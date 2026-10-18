"use server";

import {
  createInvitation, revokeInvitation, setMemberRole, canManageChurch,
  withTenant, peopleToInvite, listRoles, memberRole, withinReach, ROLE_PERMISSIONS,
  invitationToSend,
  type TenantRole, PermissionError,
} from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { explain } from "@/lib/explain";
import { requireSession, type Session } from "@/lib/session";
import { churchOrigin } from "@/lib/church-address";
import { inviteMessage } from "@/lib/invite-mail";
import { sendAsPlatform } from "@/lib/transactional";

export interface TeamResult {
  error?: string;
  /**
   * HRT-370, R16.4. The invitation is written down and the message did not go.
   *
   * Separate from an error, because the two ask for different things. An error
   * means nothing happened and the press can be repeated. This means the
   * address is invited and nobody has been told, which is answered by
   * connecting an account and sending it again.
   */
  unsent?: boolean;
  /** What the provider said, where there was an account to say anything. */
  said?: string;
}

/**
 * HRT-370, R1.7, R16.4. Taking one invitation to the address it names.
 *
 * Out through ConnectApp's own account the moment it is written, rather than
 * into the queue. The queue is for a composed send, with its consent, its
 * targeting and every recipient's own way out of a mailing list, and an
 * invitation has none of those: one address, nothing to unsubscribe from, and
 * somebody standing at the screen waiting to hear whether it went.
 *
 * HRT-372. And it is our mail rather than the church's: it says somebody has
 * an account here and it links to our sign-in. A church should not have to
 * connect an email account before it can get its second administrator in.
 */
async function deliver(
  session: Session,
  invitation: { email: string; role: string; expiresAt: Date },
): Promise<TeamResult> {
  const origin = await churchOrigin(session.tenantSlug);
  if (!origin) return { unsent: true };

  const sent = await sendAsPlatform(
    inviteMessage({
      church: session.tenantName,
      invitedBy: session.displayName,
      role: invitation.role,
      address: invitation.email,
      expiresAt: invitation.expiresAt,
      origin,
    }),
  );

  if (sent.ok) return {};
  return sent.connected ? { unsent: true, said: sent.said } : { unsent: true };
}

/** R1.6. What this church calls the role somebody is being given. */
const nameOfRole = (role: { builtin: boolean; key: string; name: string }): string =>
  role.builtin ? t(`role.${role.key}` as never) : role.name;

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const ROLES: TenantRole[] = [
  "owner", "admin", "staff", "pastoral", "finance", "group_leader", "checkin_volunteer", "member",
];

async function allowed() {
  const session = await requireSession();
  /*
   * A PermissionError and not a plain Error: explain() rethrows anything it
   * does not know, so a plain one escaped the action's own catch and took
   * the screen down instead of writing a sentence on the form.
   */
  if (!canManageChurch(session)) throw new PermissionError(session.role, "editChurch");
  return session;
}

/** R1.7. Inviting somebody, by the address they will sign in with. */
export async function invite(data: FormData): Promise<TeamResult> {
  try {
    const session = await allowed();
    const email = field(data, "email").toLowerCase();

    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return { error: t("team.error.email") };

    /*
     * R1.6. The church picks one of its own roles, so what arrives is a row id.
     * It is read back here rather than trusted: a built-in travels as its key
     * and a church's own role as its id, and anything else is refused.
     */
    const chosen = await withTenant(
      { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
      (tx) => listRoles(tx, session.tenantId, { includeArchived: true }),
    );

    /*
     * R1.6. A role has to be one this church runs. The built-ins it has not
     * taken up are archived, and so is one it put away itself; neither is
     * something to hand an account.
     */
    const picked = chosen.find(
      (one) => one.id === field(data, "role") && !one.archived,
    );
    if (!picked) return { error: t("team.error.role") };

    /*
     * R1.4, R1.5, R21.2. The most somebody can hand out is what they hold.
     *
     * The panel filters this already and that is a convenience: the screen is
     * never the control. Without it here an Admin could post the id of the
     * Finance role and read the giving on their next sign-in, which is the
     * field-level restriction on amounts undone in one request.
     */
    if (!withinReach(session, picked.permissions)) {
      return { error: t("team.error.beyond") };
    }

    const role = (picked.builtin ? picked.key : "member") as TenantRole;
    if (!ROLES.includes(role)) return { error: t("team.error.role") };

    const made = await createInvitation({
      tenantId: session.tenantId,
      email,
      role,
      roleId: picked.builtin ? null : picked.id,
      invitedByUserId: session.userId,
      // R1.7. Where the church picked somebody it already holds, the account
      // ties to that record on first sign-in.
      memberId: field(data, "memberId") || null,
    });

    /* R1.7, R16.4. The row is the record of who may come in. The message is
       the only thing that tells them, so it goes now. */
    return await deliver(session, {
      email,
      role: nameOfRole(picked),
      expiresAt: made.expiresAt,
    });
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * HRT-370, R1.7, R16.4. Sending an invitation that is already open again.
 *
 * The one that went while no account was connected, and the one that went to
 * somebody who never saw it. The row is left exactly as it is, so the address,
 * the role and the fourteen days it already carries are what the message says.
 */
export async function sendAgain(id: string): Promise<TeamResult> {
  try {
    const session = await allowed();

    const open = await invitationToSend(session.tenantId, id);
    if (!open) return { error: t("team.error.invitation") };

    return await deliver(session, {
      email: open.email,
      role: open.roleName ?? t(`role.${open.role}` as never),
      expiresAt: open.expiresAt,
    });
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function withdraw(id: string): Promise<TeamResult> {
  try {
    const session = await allowed();
    await revokeInvitation(session.tenantId, id);
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R1.4. Changing what somebody may do. */
/**
 * R1.5, R1.6, R21.2. What a role can do, against what the person handing it
 * out can do.
 *
 * Admin runs the church and does not hold the money permissions, so without
 * this an Admin could put themselves on Finance and read the giving on the
 * next page load, which is the field-level restriction on amounts undone in
 * two clicks. The Owner holds everything, so the Owner can assign anything.
 */
async function reachable(
  session: Awaited<ReturnType<typeof allowed>>,
  role: TenantRole,
  roleId?: string | null,
): Promise<boolean> {
  const who = { role: session.role, permissions: session.permissions };
  if (!roleId) return withinReach(who, ROLE_PERMISSIONS[role]);

  const ctx = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
  const roles = await withTenant(ctx, (tx) =>
    listRoles(tx, session.tenantId, { includeArchived: true }));
  const target = roles.find((one) => one.id === roleId);
  return target ? withinReach(who, target.permissions) : false;
}

export async function changeRole(
  userId: string,
  role: TenantRole,
  church?: string,
  /** R1.6. A role this church wrote, where they picked one. */
  roleId?: string | null,
): Promise<TeamResult> {
  try {
    const session = await allowed();

    /*
     * R1.4. An Owner's row is only an Owner's to change. Admin may run the
     * church; it may not take the keys off the person who holds them.
     */
    const held = await memberRole(session.tenantId, userId);
    if (held === "owner" && session.role !== "owner") {
      return { error: t("team.error.owner") };
    }
    if (role === "owner" && session.role !== "owner") {
      return { error: t("team.error.onlyOwner") };
    }
    if (!(await reachable(session, role, roleId))) {
      return { error: t("team.error.beyond") };
    }

    await setMemberRole(session.tenantId, userId, role, roleId ?? null);
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R1.4. Taking somebody's access away puts them back on Member.
 *
 * Deleting the membership outright left a person with a record in the church
 * and no way into the portal that is theirs: the directory, their household,
 * their own serving. Member is the floor, so that is where somebody who should
 * no longer be running things lands.
 *
 * An Owner is never put back. There is nobody above them to undo it, and a
 * church whose last Owner was demoted by an Admin has lost its own keys.
 */
export async function removeAccess(userId: string): Promise<TeamResult> {
  try {
    const session = await allowed();

    const held = await memberRole(session.tenantId, userId);
    if (!held) return { error: t("team.error.gone") };
    if (held === "owner") return { error: t("team.error.owner") };

    const member = await withTenant(
      { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
      (tx) => listRoles(tx, session.tenantId),
    ).then((all) => all.find((one) => one.builtin && one.key === "member"));

    await setMemberRole(session.tenantId, userId, "member", member?.id ?? null);
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}


/** R1.7. People in the directory who could be given an account. */
export async function invitees(
  search: string,
  ): Promise<{ id: string; name: string; email: string }[]> {
  /*
   * A search box asks this as somebody types, so a refusal comes back as no
   * matches rather than as a rejected promise the field cannot do anything
   * with. Whoever cannot manage the team cannot open this panel anyway.
   */
  let session;
  try {
    session = await allowed();
  } catch {
    return [];
  }

  return withTenant(
    { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
    (tx) => peopleToInvite(tx, search),
  );
}
