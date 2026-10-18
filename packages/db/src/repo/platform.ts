import { createHash, randomBytes } from "node:crypto";
import { owner } from "../client";

/**
 * The portal is a tool for the people running ConnectApp rather than a screen a
 * church sees, so its messages are written here in English. Every other
 * user-facing string in the product goes through the catalogue.
 */
export class PlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformError";
  }
}

/**
 * R21.x. The platform's own operators.
 *
 * Everything here reads across every church, which no tenant role may do, so it
 * runs on the owner connection behind a check that the asking account is a live
 * platform admin. That check is the first statement of every function in this
 * file, and nothing here takes a tenant context: there is no church whose
 * session could reach it.
 *
 * Every write lands in platform_events, which is append only, so the record of
 * who approved a church outlives whoever approved it.
 */

export interface PlatformAdmin {
  userId: string;
  name: string;
  email: string;
  grantedAt: Date;
  grantedByName: string | null;
  revokedAt: Date | null;
}

export interface ChurchRow {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  createdAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  archivedAt: Date | null;
  archivedReason: string | null;
  /** Live member records the church holds. */
  members: number;
  /** Accounts that can sign in to it. */
  accounts: number;
  ownerName: string | null;
  ownerEmail: string | null;
  /** The last thing anybody did in it, from the church's own audit log. */
  lastActivity: Date | null;
}

export interface PlatformEvent {
  id: string;
  at: Date;
  actorName: string;
  action: string;
  tenantId: string | null;
  tenantName: string | null;
  note: string | null;
}

export interface Signals {
  churches: number;
  provisional: number;
  archived: number;
  newThisMonth: number;
  members: number;
  /** R22.x. Churches that have recorded attendance or a check-in in 12 weeks. */
  active: number;
}

/** R21.x. Whether this account is on the platform team at all. */
export async function platformAdmin(userId: string): Promise<{ id: string; name: string } | null> {
  if (!userId) return null;
  const rows = await owner()<{ id: string; name: string }[]>`
    select a.user_id as id, a.name
      from platform_admins a
     where a.user_id = ${userId} and a.revoked_at is null
     limit 1`;
  return rows[0] ?? null;
}

async function requireAdmin(userId: string): Promise<{ id: string; name: string }> {
  const who = await platformAdmin(userId);
  if (!who) throw new PlatformError("This account is not on the platform team.");
  return who;
}

/** R21.x. Writing down what an operator did, in the log nobody can edit. */
async function record(
  actor: { id: string; name: string },
  action: string,
  about: { tenantId?: string; tenantName?: string; note?: string } = {},
): Promise<void> {
  await owner()`
    insert into platform_events (actor_id, actor_name, action, tenant_id, tenant_name, note)
    values (
      ${actor.id}, ${actor.name}, ${action},
      ${about.tenantId ?? null}, ${about.tenantName ?? null},
      ${about.note?.trim() || null}
    )`;
}

/** R21.x. Every church on the platform, newest first. */
export async function listChurches(
  by: string,
  opts: { query?: string; standing?: "all" | "provisional" | "approved" | "archived" } = {},
): Promise<ChurchRow[]> {
  await requireAdmin(by);
  const like = `%${(opts.query ?? "").trim().toLowerCase()}%`;
  const standing = opts.standing ?? "all";

  return owner()<ChurchRow[]>`
    select
      t.id,
      t.slug,
      t.name,
      t.timezone,
      t.created_at as "createdAt",
      t.approved_at as "approvedAt",
      t.approved_by as "approvedBy",
      t.archived_at as "archivedAt",
      t.archived_reason as "archivedReason",
      (select count(*)::int from members m
        where m.tenant_id = t.id and m.archived_at is null) as members,
      (select count(*)::int from tenant_members tm where tm.tenant_id = t.id) as accounts,
      (select coalesce(nullif(trim(concat_ws(' ', m.first_name, m.last_name)), ''), u.email)
         from tenant_members tm
         join app_users u on u.id = tm.user_id
         left join members m on m.app_user_id = u.id and m.tenant_id = t.id
        where tm.tenant_id = t.id and tm.role = 'owner'
        order by tm.created_at asc limit 1) as "ownerName",
      (select u.email
         from tenant_members tm
         join app_users u on u.id = tm.user_id
        where tm.tenant_id = t.id and tm.role = 'owner'
        order by tm.created_at asc limit 1) as "ownerEmail",
      (select max(a.at) from audit_entries a where a.tenant_id = t.id) as "lastActivity"
    from tenants t
    where (${like} = '%%' or lower(t.name) like ${like} or lower(t.slug) like ${like})
      and case ${standing}
            when 'provisional' then t.approved_at is null and t.archived_at is null
            when 'approved' then t.approved_at is not null and t.archived_at is null
            when 'archived' then t.archived_at is not null
            else true
          end
    order by t.created_at desc`;
}

/** R21.x. One church, as the operator's page reads it. */
export async function church(by: string, id: string): Promise<ChurchRow | null> {
  const all = await listChurches(by);
  return all.find((one) => one.id === id || one.slug === id) ?? null;
}

async function named(id: string): Promise<{ id: string; name: string }> {
  const rows = await owner()<{ id: string; name: string }[]>`
    select id, name from tenants where id = ${id} limit 1`;
  const found = rows[0];
  if (!found) throw new PlatformError("That church could not be found.");
  return found;
}

/** R1.1. A human has looked at this church and says it is a church. */
/**
 * R1.1. Approves a church, once.
 *
 * Returns whether this call is what approved it. Approving an already-approved
 * church used to reset approved_at to now, write a second entry to the log, and
 * send the owner a second "your church is approved" email. The guard on
 * approved_at makes the write a no-op on the second press, the original
 * approval time survives, and the caller has something to decide the email on.
 */
export async function approve(by: string, tenantId: string, note: string): Promise<boolean> {
  const actor = await requireAdmin(by);
  const target = await named(tenantId);
  const changed = await owner()`
    update tenants
       set approved_at = now(), approved_by = ${actor.name}, updated_at = now()
     where id = ${tenantId} and approved_at is null`;
  if (changed.count === 0) return false;
  await record(actor, "approved", { tenantId, tenantName: target.name, note });
  return true;
}

/** R1.1. Putting a church back behind the cap, when it should not have passed. */
export async function unapprove(by: string, tenantId: string, note: string): Promise<void> {
  const actor = await requireAdmin(by);
  const target = await named(tenantId);
  await owner()`
    update tenants
       set approved_at = null, approved_by = null, updated_at = now()
     where id = ${tenantId}`;
  await record(actor, "unapproved", { tenantId, tenantName: target.name, note });
}

/**
 * R21.x. Taking a church out of service.
 *
 * Archive, never delete: every record it holds stays, and the church stops
 * counting towards anything. Nobody can sign in to it, which is what makes this
 * the answer for a test church, a duplicate, or a church that has wound down.
 */
export async function archive(by: string, tenantId: string, reason: string): Promise<void> {
  const actor = await requireAdmin(by);
  const target = await named(tenantId);
  const why = reason.trim();
  if (!why) throw new PlatformError("Say why this church is being taken out of service.");

  await owner()`
    update tenants
       set archived_at = now(), archived_reason = ${why}, updated_at = now()
     where id = ${tenantId}`;
  await record(actor, "archived", { tenantId, tenantName: target.name, note: why });
}

/** R21.x. Putting an archived church back into service. */
export async function restore(by: string, tenantId: string, note: string): Promise<void> {
  const actor = await requireAdmin(by);
  const target = await named(tenantId);
  await owner()`
    update tenants
       set archived_at = null, archived_reason = null, updated_at = now()
     where id = ${tenantId}`;
  await record(actor, "restored", { tenantId, tenantName: target.name, note });
}

/** R21.x. What the platform team has done, newest first. */
export async function events(
  by: string,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<PlatformEvent[]> {
  await requireAdmin(by);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const tenantId = opts.tenantId ?? null;

  return owner()<PlatformEvent[]>`
    select id, at, actor_name as "actorName", action,
           tenant_id as "tenantId", tenant_name as "tenantName", note
      from platform_events
     where (${tenantId}::uuid is null or tenant_id = ${tenantId}::uuid)
     order by at desc
     limit ${limit}`;
}

/** R21.x. Who is on the platform team. */
export async function admins(by: string): Promise<PlatformAdmin[]> {
  await requireAdmin(by);
  return owner()<PlatformAdmin[]>`
    select a.user_id as "userId", a.name, u.email,
           a.granted_at as "grantedAt", a.revoked_at as "revokedAt",
           (select g.name from platform_admins g where g.user_id = a.granted_by) as "grantedByName"
      from platform_admins a
      join app_users u on u.id = a.user_id
     order by a.revoked_at nulls first, a.granted_at asc`;
}

/** R21.x. Giving somebody else the same power, by the address they sign in with. */
export async function grant(by: string, email: string, name: string): Promise<void> {
  const actor = await requireAdmin(by);
  const address = email.trim().toLowerCase();
  const who = name.trim();
  if (!address || !who) throw new PlatformError("An address and a name are both needed.");

  const rows = await owner()<{ id: string }[]>`
    select id from app_users where email = ${address} limit 1`;
  const found = rows[0];
  if (!found) throw new PlatformError("No account signs in with that address yet.");

  await owner()`
    insert into platform_admins (user_id, name, granted_by)
    values (${found.id}, ${who}, ${actor.id})
    on conflict (user_id) do update
      set name = excluded.name, granted_by = excluded.granted_by,
          granted_at = now(), revoked_at = null`;
  await record(actor, "granted", { note: `${who} (${address})` });
}

/** R21.x. Taking it away. The row stays, so the log still reads. */
export async function revoke(by: string, userId: string): Promise<void> {
  const actor = await requireAdmin(by);
  if (actor.id === userId) throw new PlatformError("Revoking your own access would lock you out.");

  const rows = await owner()<{ name: string }[]>`
    update platform_admins set revoked_at = now()
     where user_id = ${userId} and revoked_at is null
     returning name`;
  const gone = rows[0];
  if (!gone) throw new PlatformError("That account is not on the platform team.");
  await record(actor, "revoked", { note: gone.name });
}

/** R22.x. The numbers the platform is run on. */
export async function signals(by: string): Promise<Signals> {
  await requireAdmin(by);
  const rows = await owner()<Signals[]>`
    select
      (select count(*)::int from tenants where archived_at is null) as churches,
      (select count(*)::int from tenants
        where archived_at is null and approved_at is null) as provisional,
      (select count(*)::int from tenants where archived_at is not null) as archived,
      (select count(*)::int from tenants
        where created_at > now() - interval '30 days') as "newThisMonth",
      (select count(*)::int from members where archived_at is null) as members,
      (select count(distinct a.tenant_id)::int from audit_entries a
        where a.at > now() - interval '84 days') as active`;
  return rows[0]!;
}


/* ---------------------------------------------------------------------------
 * HRT-401. Asking somebody on before they have an account
 * ------------------------------------------------------------------------ */

/** How long a link is worth anything. */
export const INVITE_DAYS = 7;

export interface TeamInvite {
  id: string;
  email: string;
  name: string;
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * The token is mailed and never stored, so this table being read hands nobody
 * a way in. The same reasoning as a password.
 */
const fingerprint = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/**
 * R21.x. Ask an address onto the team.
 *
 * Returns the token, which is the only time it exists in readable form: the
 * caller puts it in a link and forgets it. A second ask for the same address
 * replaces the first, so there is never a spare token in somebody's inbox that
 * still works.
 */
export async function inviteTeamMember(
  by: string,
  email: string,
  name: string,
): Promise<{ token: string; email: string; name: string; expiresAt: Date }> {
  const actor = await requireAdmin(by);
  const address = email.trim().toLowerCase();
  const who = name.trim();
  if (!address || !who) throw new PlatformError("An address and a name are both needed.");
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(address)) {
    throw new PlatformError("That does not look like an email address.");
  }

  /* Already on the team, already has an account: there is nothing to invite
     them to, and a link that grants what they hold is a link worth phishing. */
  const held = await owner()<{ revoked: boolean }[]>`
    select (a.revoked_at is not null) as revoked
      from platform_admins a
      join app_users u on u.id = a.user_id
     where lower(u.email) = ${address}
     limit 1`;
  if (held[0] && !held[0].revoked) {
    throw new PlatformError("That account is already on the team.");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  await owner()`
    update platform_invites set revoked_at = now()
     where lower(email) = ${address} and accepted_at is null and revoked_at is null`;

  await owner()`
    insert into platform_invites (email, name, token_hash, invited_by, invited_by_name, expires_at)
    values (${address}, ${who}, ${fingerprint(token)}, ${actor.id}, ${actor.name}, ${expiresAt})`;

  await record(actor, "invited", { note: `${who} (${address})` });
  return { token, email: address, name: who, expiresAt };
}

/** R21.x. The asks nobody has answered yet. */
export async function teamInvites(by: string): Promise<TeamInvite[]> {
  await requireAdmin(by);
  return owner()<TeamInvite[]>`
    select id, email, name, invited_by_name as "invitedByName",
           created_at as "createdAt", expires_at as "expiresAt"
      from platform_invites
     where accepted_at is null and revoked_at is null and expires_at > now()
     order by created_at desc`;
}

/** R21.x. Withdraws an invitation that has not been accepted. */
export async function revokeInvite(by: string, id: string): Promise<void> {
  const actor = await requireAdmin(by);
  const rows = await owner()<{ name: string; email: string }[]>`
    update platform_invites set revoked_at = now()
     where id = ${id}::uuid and accepted_at is null and revoked_at is null
     returning name, email`;
  const gone = rows[0];
  if (!gone) throw new PlatformError("That invitation has already been used or withdrawn.");
  await record(actor, "invite withdrawn", { note: `${gone.name} (${gone.email})` });
}

/**
 * R21.x. They arrived carrying the link.
 *
 * The address Supabase proved has to be the address that was asked. Without
 * that test the link is a grant to whoever opens it, which is the whole of the
 * thing an invitation must never be: tokens get forwarded, and a colleague
 * reading somebody else's mail is a likelier accident than an attacker.
 *
 * Takes no `by`, on purpose. The caller is the person being let in, so there
 * is nobody to check against the team except the token itself.
 */
export async function claimInvite(
  token: string,
  user: { id: string; email: string },
): Promise<{ name: string }> {
  const address = user.email.trim().toLowerCase();
  if (!token || !address) throw new PlatformError("That link is not complete.");

  const rows = await owner()<{ id: string; email: string; name: string; invitedBy: string | null }[]>`
    select id, email, name, invited_by as "invitedBy"
      from platform_invites
     where token_hash = ${fingerprint(token)}
       and accepted_at is null and revoked_at is null and expires_at > now()
     limit 1`;
  const invite = rows[0];
  if (!invite) throw new PlatformError("That link has expired or has already been used.");

  if (invite.email !== address) {
    throw new PlatformError(`That invitation was sent to ${invite.email}.`);
  }

  await owner()`
    insert into platform_admins (user_id, name, granted_by)
    values (${user.id}, ${invite.name}, ${invite.invitedBy})
    on conflict (user_id) do update
      set name = excluded.name, granted_by = excluded.granted_by,
          granted_at = now(), revoked_at = null`;

  await owner()`
    update platform_invites set accepted_at = now() where id = ${invite.id}::uuid`;

  await owner()`
    insert into platform_events (actor_id, actor_name, action, note)
    values (${user.id}, ${invite.name}, 'joined', ${`${invite.name} (${address})`})`;

  return { name: invite.name };
}

/** R1.8, R21.4. What an operator is told about an account's second factor. */
export interface TwoStepLookup {
  userId: string;
  email: string;
  name: string | null;
  /** Null for somebody who has not set it up. */
  enrolledAt: Date | null;
  /** Recovery codes still unspent. Zero with an enrolment is a locked door. */
  codesLeft: number;
  /** The churches this account belongs to, so the operator can see who it is. */
  churches: string[];
}

/**
 * R1.8, R21.4. Finding an account that cannot get past its own second factor.
 *
 * Looked up by the address they sign in with, because that is what somebody
 * locked out can tell you over the phone. It answers for an address with no
 * account too, with nothing set up, so this cannot be used to find out who
 * holds an account here.
 */
export async function twoStepFor(by: string, email: string): Promise<TwoStepLookup | null> {
  await requireAdmin(by);

  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;

  const rows = await owner()<{
    user_id: string; email: string; name: string | null;
    enrolled_at: Date | null; codes_left: string; churches: string[] | null;
  }[]>`
    select
      u.id as user_id,
      u.email,
      u.full_name as name,
      u.mfa_enrolled_at as enrolled_at,
      (select count(*) from account_recovery_codes c
        where c.user_id = u.id and c.used_at is null)::text as codes_left,
      (select array_agg(t.name order by t.name)
         from tenant_members m join tenants t on t.id = m.tenant_id
        where m.user_id = u.id) as churches
    from app_users u
   where lower(u.email) = ${wanted}
   limit 1`;

  const found = rows[0];
  if (!found) return null;

  return {
    userId: found.user_id,
    email: found.email,
    name: found.name,
    enrolledAt: found.enrolled_at,
    codesLeft: Number(found.codes_left),
    churches: found.churches ?? [],
  };
}

/**
 * R1.8, R21.4. Taking an account's second factor off, as the last resort.
 *
 * A church's first owner has nobody above them. They hold the ten recovery
 * codes they were given and nothing else, so an owner who loses the phone and
 * the codes is outside their own church for good. This is the way back, and
 * it is why it has to exist before a second factor is ever required.
 *
 * It is deliberately blunt: it does not let anybody in, it puts the account
 * back to a password and asks them to set it up again. And it is written down
 * in a log no application role can edit, with the address it was done to,
 * because an operator who can switch off anybody's second factor is exactly
 * the power that has to be reviewable.
 */
export async function clearTwoStep(
  by: string,
  userId: string,
  reason: string,
): Promise<{ email: string }> {
  const actor = await requireAdmin(by);

  const said = reason.trim();
  if (said.length < 4) throw new PlatformError("Say why this is being turned off.");

  const rows = await owner()<{ email: string; enrolled_at: Date | null }[]>`
    select email, mfa_enrolled_at as enrolled_at from app_users where id = ${userId}`;
  const held = rows[0];
  if (!held) throw new PlatformError("There is no account with that id.");
  if (!held.enrolled_at) throw new PlatformError("That account has no two-step verification on.");

  /*
   * The factor, the mirror and the codes together, the same way the person
   * would have done it themselves. See markTwoStepOff for why the factor is
   * deleted here rather than through Supabase.
   */
  await owner().begin(async (tx) => {
    await tx`delete from auth.mfa_factors where user_id = ${userId}`;
    await tx`update app_users set mfa_enrolled_at = null where id = ${userId}`;
    await tx`delete from account_recovery_codes where user_id = ${userId}`;
  });

  await record(actor, "two-step cleared", { note: `${held.email}: ${said}` });
  return { email: held.email };
}
