import { and, asc, desc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { owner } from "../client";
import { emailSends, emailRecipients, contactConsent, churchProviders } from "../schema/messaging";
import { contactMethods } from "../schema/members";
import { tenants } from "../schema/tenancy";
import { openCredential, sealCredential, CREDENTIAL_KEY_ID } from "../crypto";
import { GRANT_DAYS } from "./providers";

/**
 * HRT-141, R16.6. The queue behind a send.
 *
 * Everything here runs in the worker, as the owner, with no session. The queue
 * exists so that a send completes after the church has closed the browser, so
 * there is no signed-in user to act as.
 *
 * The rules that decide who may be written to are not here. They were applied
 * when the rows were written, which is the moment a church could still
 * see what it was about to do.
 */

/** How many copies one pass of the worker attempts. */
export const BATCH = 25;

export interface DueSend {
  id: string;
  tenantId: string;
  subject: string;
  body: string;
  churchName: string;
  /** The church's own postal address, for the fine print. */
  postal: string;
  /** Where the way out points. */
  origin: string;
  waiting: number;
}

/**
 * R16.6. Sends with copies still waiting, and the time has come.
 *
 * A send with a future time is not due, which is the whole of scheduling: the
 * row sits there and the worker walks past it until the clock catches up.
 */
export async function dueSends(limit = 5): Promise<DueSend[]> {
  const db = drizzle(owner());

  const rows = await db
    .select({
      id: emailSends.id,
      tenantId: emailSends.tenantId,
      subject: emailSends.subject,
      body: emailSends.body,
      churchName: tenants.name,
      origin: emailSends.origin,
      line1: tenants.addressLine1,
      city: tenants.city,
      region: tenants.region,
      postcode: tenants.postalCode,
      waiting: sql<number>`(
        select count(*)::int from email_recipients r
        where r.send_id = ${emailSends.id} and r.state = 'queued'
          and (r.next_try is null or r.next_try <= now())
      )`,
    })
    .from(emailSends)
    .innerJoin(tenants, eq(tenants.id, emailSends.tenantId))
    .where(
      and(
        or(eq(emailSends.state, "queued"), eq(emailSends.state, "sending")),
        or(isNull(emailSends.sendAt), lte(emailSends.sendAt, new Date())),
      ),
    )
    .orderBy(asc(emailSends.sendAt), asc(emailSends.createdAt))
    .limit(limit);

  return rows
    .filter((one) => one.waiting > 0)
    .map((one) => ({
      id: one.id,
      tenantId: one.tenantId,
      subject: one.subject,
      body: one.body,
      churchName: one.churchName,
      origin: one.origin ?? "",
      postal: [one.line1, one.city, [one.region, one.postcode].filter(Boolean).join(" ")]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" · "),
      waiting: one.waiting,
    }));
}

export interface Waiting {
  id: string;
  memberId: string | null;
  address: string;
  first: string;
  name: string;
  /** R16.8. The way out this person's copy carries. */
  token: string | null;
}

/**
 * R16.6. The next batch of copies, taken so nobody else takes them.
 *
 * `skip locked` is what makes two workers safe: a row another pass already
 * holds is stepped over rather than waited for, so a slow provider on one
 * batch never stalls the next.
 */
export async function claimBatch(sendId: string, size = BATCH): Promise<Waiting[]> {
  const db = drizzle(owner());

  /*
   * One statement claims the rows and brings back everything the copy needs:
   * the person's name for the greeting and their way out for the fine print.
   * Those were a query each, per recipient, so a batch of twenty-five cost
   * fifty round trips before the first message left.
   *
   * `claimed_at` is stamped here because it is the only thing that can later
   * tell a row a dead worker abandoned from one still in flight.
   */
  const rows = (await db.execute(sql`
    with taken as (
      select id from email_recipients
      where send_id = ${sendId} and state = 'queued'
        and (next_try is null or next_try <= now())
      order by at
      limit ${size}
      for update skip locked
    ),
    claimed as (
      update email_recipients r
      set state = 'sending', claimed_at = now()
      from taken
      where r.id = taken.id
      returning r.id, r.tenant_id, r.member_id, r.address
    )
    /*
     * SEC-006. Both joins name the church the recipient belongs to.
     *
     * This runs on the owner connection, which the isolation policies do not
     * constrain, and the consent join had no tenant predicate at all. An
     * address with no member record, which is what a visiting speaker or a
     * tradesman typed into the composer is, matched on the address alone, and
     * consent is unique per church per address rather than globally.
     * So one church's message could carry another church's unsubscribe token,
     * and a recipient pressing it was taken off the wrong church's list and
     * shown the wrong church's name. Two matching rows also duplicated the
     * recipient, so that address was sent the message twice.
     */
    select c.id, c.member_id, c.address,
           coalesce(m.preferred_name, m.first_name) as first,
           coalesce(m.preferred_name, m.first_name) || ' ' || m.last_name as name,
           k.token
      from claimed c
      left join members m on m.id = c.member_id and m.tenant_id = c.tenant_id
      left join contact_consent k
        on k.channel = 'email'
       and k.tenant_id = c.tenant_id
       and (case when c.member_id is null
                 then k.address = c.address and k.member_id is null
                 else k.member_id = c.member_id end)
  `)) as unknown as {
    id: string;
    member_id: string | null;
    address: string;
    first: string | null;
    name: string | null;
    token: string | null;
  }[];

  const out: Waiting[] = rows.map((raw) => ({
    id: raw.id,
    memberId: raw.member_id,
    address: raw.address,
    first: raw.first ?? raw.address,
    name: raw.name ?? raw.address,
    token: raw.token ?? null,
  }));

  await db
    .update(emailSends)
    .set({ state: "sending", claimedAt: new Date(), updatedAt: new Date() })
    .where(eq(emailSends.id, sendId));

  return out;
}

/**
 * R16.6. How long a claimed copy may sit before it is treated as abandoned.
 *
 * Longer than any invocation can live, so a worker still working is never
 * robbed of a row it holds, and short enough that a church does not wait an
 * afternoon for the rest of its message.
 */
const STUCK_MINUTES = 10;

/**
 * R16.6. Copies a dead worker left behind, put right.
 *
 * The worker claims a batch in one statement and then sends them one at a
 * time, so an invocation that runs out of time leaves the remainder marked
 * 'sending'. Nothing else in the product could recognise those: the due-sends
 * query counts only 'queued', so the send reported nothing waiting and was
 * never picked up again, while the progress the church was watching counted
 * them as outstanding and never finished. Every send larger than one batch
 * stranded its remainder.
 *
 * A stuck row is read by whether the provider was ever told about it, because
 * the two cases want opposite answers:
 *
 *   A reference means the provider took the message. It went. Putting that row
 *   back in the queue would send somebody a second copy, so it is marked sent,
 *   which is what the worker was about to do when it died.
 *
 *   No reference means there is no evidence it left, so it goes back in the
 *   queue and keeps its attempt count, so a copy that has already been refused
 *   three times does not get a fresh four.
 *
 * One window remains: a message accepted by the provider in the moment before
 * its reference is written looks like a row that never sent, and is sent again.
 * The window is one statement wide, and duplicate delivery is the better
 * failure here than a send that silently loses its remainder.
 */
export async function reclaimStuck(): Promise<{ requeued: number; finished: number }> {
  const db = drizzle(owner());
  const cutoff = sql.raw(`now() - interval '${STUCK_MINUTES} minutes'`);

  const finished = (await db.execute(sql`
    update email_recipients
       set state = 'sent', said = null, claimed_at = null
     where state = 'sending'
       and claimed_at is not null and claimed_at < ${cutoff}
       and provider_ref is not null
    returning id
  `)) as unknown as { id: string }[];

  const requeued = (await db.execute(sql`
    update email_recipients
       set state = 'queued', claimed_at = null
     where state = 'sending'
       and claimed_at is not null and claimed_at < ${cutoff}
       and provider_ref is null
    returning id
  `)) as unknown as { id: string }[];

  return { requeued: requeued.length, finished: finished.length };
}

/**
 * R16.7. How many goes one copy gets before a church is told it did not go.
 *
 * Four, with the waits below. Past that a provider is not having a bad minute,
 * and a church is better off being told than having a row quietly retried for
 * the rest of the afternoon.
 */
export const TRIES = 4;

/** R16.7. How long to wait before each later go, in seconds. */
const BACKOFF = [30, 120, 600];

/**
 * R16.6, R16.7. What happened to one copy.
 *
 * Two failures that look alike on the way out: a provider saying "slow down"
 * or "try later", which is this copy's bad luck, and a provider saying there
 * is nobody at that address, which is true of every send from now on. The
 * first comes back round; the second stops here and marks the address.
 */
export async function settle(
  recipientId: string,
  outcome: { ok: boolean; said: string | null; again?: boolean },
): Promise<void> {
  const db = drizzle(owner());

  if (outcome.ok) {
    await db
      .update(emailRecipients)
      .set({ state: "sent", said: null })
      .where(eq(emailRecipients.id, recipientId));
    return;
  }

  const [row] = await db
    .select({ attempts: emailRecipients.attempts })
    .from(emailRecipients)
    .where(eq(emailRecipients.id, recipientId))
    .limit(1);

  const attempts = (row?.attempts ?? 0) + 1;
  const wait = BACKOFF[attempts - 1];

  if (outcome.again && attempts < TRIES && wait !== undefined) {
    await db
      .update(emailRecipients)
      .set({
        state: "queued",
        said: outcome.said,
        attempts,
        nextTry: new Date(Date.now() + wait * 1000),
      })
      .where(eq(emailRecipients.id, recipientId));
    return;
  }

  await db
    .update(emailRecipients)
    .set({ state: "failed", said: outcome.said, attempts })
    .where(eq(emailRecipients.id, recipientId));
}

/** R16.6. What the provider called this copy, so its verdict can be matched. */
export async function noteRef(recipientId: string, ref: string | null): Promise<void> {
  if (!ref) return;
  const db = drizzle(owner());
  await db
    .update(emailRecipients)
    .set({ providerRef: ref })
    .where(eq(emailRecipients.id, recipientId));
}

/**
 * R16.6. The tally, once nothing is left waiting.
 *
 * Counted from the rows rather than kept as a running total, because a worker
 * that dies mid-batch would leave a running total wrong and nobody would ever
 * know which number to believe.
 */
export async function closeIfDone(sendId: string): Promise<boolean> {
  const db = drizzle(owner());

  const [tally] = await db
    .select({
      waiting: sql<number>`count(*) filter (where ${emailRecipients.state} in ('queued','sending'))::int`,
      delivered: sql<number>`count(*) filter (where ${emailRecipients.state} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${emailRecipients.state} = 'failed')::int`,
    })
    .from(emailRecipients)
    .where(eq(emailRecipients.sendId, sendId));

  if (!tally || tally.waiting > 0) return false;

  await db
    .update(emailSends)
    .set({
      state: tally.delivered > 0 ? "sent" : "failed",
      delivered: tally.delivered,
      failed: tally.failed,
      updatedAt: new Date(),
    })
    .where(eq(emailSends.id, sendId));

  return true;
}

/** R16.6. How far a send has got, for the screen that is watching it. */
export async function progressOf(sendId: string): Promise<{ done: number; total: number }> {
  const db = drizzle(owner());
  const [row] = await db
    .select({
      done: sql<number>`count(*) filter (where ${emailRecipients.state} in ('sent','failed'))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(emailRecipients)
    .where(eq(emailRecipients.sendId, sendId));
  return { done: row?.done ?? 0, total: row?.total ?? 0 };
}

export interface SendingAccountForWorker {
  vendor: string;
  credential: string;
  fromName: string | null;
  fromAddress: string | null;
  settings: unknown;
  /** R16.1. The short-lived token, where one is still good. */
  access: string | null;
}

/**
 * R21.15. The church's own account, opened in the worker and nowhere else.
 *
 * No read path on a screen selects this column. The worker is the one place
 * a credential is ever in the clear, which is what makes that structural
 * rather than a habit.
 */
export async function accountFor(tenantId: string): Promise<SendingAccountForWorker | null> {
  const db = drizzle(owner());
  const [row] = await db
    .select({
      vendor: churchProviders.vendor,
      credential: churchProviders.credential,
      fromName: churchProviders.fromName,
      fromAddress: churchProviders.fromAddress,
      settings: churchProviders.settings,
      access: churchProviders.accessToken,
      accessExpires: churchProviders.accessExpires,
    })
    .from(churchProviders)
    .where(
      and(
        eq(churchProviders.tenantId, tenantId),
        eq(churchProviders.channel, "email"),
        eq(churchProviders.state, "connected"),
      ),
    )
    .limit(1);

  if (!row?.credential) return null;

  /* A minute's grace, so a token that expires mid-send is refreshed before it
     is used rather than halfway through four hundred copies. */
  const good =
    row.access !== null &&
    row.accessExpires !== null &&
    row.accessExpires.getTime() > Date.now() + 60_000;

  return {
    vendor: row.vendor,
    credential: openCredential(row.credential),
    fromName: row.fromName,
    fromAddress: row.fromAddress,
    settings: row.settings,
    access: good ? openCredential(row.access!) : null,
  };
}

/**
 * R16.1. The short-lived token, kept for the minutes it has left.
 *
 * Written with the rotated refresh token in one statement, because the two
 * belong to the same exchange and a worker that stored one without the other
 * would either replay a spent refresh token or throw away a good access one.
 */
export async function storeTokens(
  tenantId: string,
  tokens: { refresh: string; access: string; seconds: number },
): Promise<void> {
  const db = drizzle(owner());
  await db
    .update(churchProviders)
    .set({
      credential: sealCredential(tokens.refresh),
      credentialKeyId: CREDENTIAL_KEY_ID,
      accessToken: sealCredential(tokens.access),
      accessExpires: new Date(Date.now() + tokens.seconds * 1000),
      /* HRT-387, R16.1. Resend gives the new refresh token sixty days and
         resets them on every exchange, so the clock starts again here. */
      credentialExpiresAt: new Date(Date.now() + GRANT_DAYS * 86_400_000),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(churchProviders.tenantId, tenantId),
        eq(churchProviders.channel, "email"),
        eq(churchProviders.state, "connected"),
      ),
    );
}

/**
 * R16.1, R21.15. The rotated refresh token, written back by the worker.
 *
 * Resend refuses a refresh token used twice and revokes the grant when one is
 * replayed, so the new one has to be written down before a single copy goes
 * out. There is no session here: the worker has the tenant and nothing else.
 */
export async function rotateCredentialAsOwner(
  tenantId: string,
  refreshToken: string,
): Promise<void> {
  const db = drizzle(owner());
  await db
    .update(churchProviders)
    .set({
      credential: sealCredential(refreshToken),
      credentialKeyId: CREDENTIAL_KEY_ID,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(churchProviders.tenantId, tenantId),
        eq(churchProviders.channel, "email"),
        eq(churchProviders.state, "connected"),
      ),
    );
}

export interface Awaiting {
  id: string;
  tenantId: string;
  providerRef: string;
  address: string;
  memberId: string | null;
}

/**
 * R16.7. Copies a provider took and has not been asked about.
 *
 * Only ones sent recently enough to still be worth asking: a provider's
 * verdict arrives within minutes, and a week-old copy with no verdict is one
 * nobody is going to get an answer on.
 */
export async function awaitingVerdict(limit = 60): Promise<Awaiting[]> {
  const db = drizzle(owner());

  const rows = await db
    .select({
      id: emailRecipients.id,
      tenantId: emailRecipients.tenantId,
      providerRef: emailRecipients.providerRef,
      address: emailRecipients.address,
      memberId: emailRecipients.memberId,
    })
    .from(emailRecipients)
    .where(
      and(
        eq(emailRecipients.state, "sent"),
        isNotNull(emailRecipients.providerRef),
        gte(emailRecipients.at, new Date(Date.now() - 36 * 60 * 60 * 1000)),
      ),
    )
    .orderBy(desc(emailRecipients.at))
    .limit(limit);

  return rows.filter((one): one is Awaiting => one.providerRef !== null);
}

/**
 * R16.7. The provider's verdict, written down where it does some good.
 *
 * A bounce is not this send's problem, it is this address's. So it marks the
 * copy and the address both: the send says who missed it, and the person's
 * record says why, and every later send leaves them out until somebody fixes
 * the address.
 *
 * A complaint is somebody pressing "this is spam". The address works
 * perfectly and must never be written to again, which is the same consent
 * withdrawal as pressing the link, recorded the same way.
 */
export async function recordVerdict(
  recipientId: string,
  verdict: "delivered" | "bounced" | "complained",
): Promise<void> {
  const db = drizzle(owner());

  if (verdict === "delivered") {
    await db
      .update(emailRecipients)
      .set({ state: "sent", said: null })
      .where(eq(emailRecipients.id, recipientId));
    return;
  }

  const [copy] = await db
    .select({
      tenantId: emailRecipients.tenantId,
      memberId: emailRecipients.memberId,
      address: emailRecipients.address,
      sendId: emailRecipients.sendId,
    })
    .from(emailRecipients)
    .where(eq(emailRecipients.id, recipientId))
    .limit(1);

  if (!copy) return;

  await db
    .update(emailRecipients)
    .set({ state: verdict === "bounced" ? "bounced" : "sent" })
    .where(eq(emailRecipients.id, recipientId));

  if (verdict === "bounced") {
    /* The send's own tally counted this copy as delivered when it closed,
       because the provider had taken it. It did not arrive, and a church
       reading "sent to 223" when four of them bounced is being told
       something untrue. */
    await db
      .update(emailSends)
      .set({
        delivered: sql`greatest(${emailSends.delivered} - 1, 0)`,
        failed: sql`${emailSends.failed} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(emailSends.id, copy.sendId));

    await db
      .update(contactMethods)
      .set({ isValid: false, bouncedAt: new Date(), bounceReason: "bounced" })
      .where(
        and(
          eq(contactMethods.tenantId, copy.tenantId),
          eq(contactMethods.kind, "email"),
          eq(contactMethods.value, copy.address),
        ),
      );
    return;
  }

  /* R16.8. A complaint is a withdrawal somebody made in their mail program
     rather than on our screen, and it binds exactly the same. */
  const mine = copy.memberId
    ? eq(contactConsent.memberId, copy.memberId)
    : eq(contactConsent.address, copy.address.toLowerCase());

  await db
    .update(contactConsent)
    .set({ state: "withdrawn", source: "portal", withdrawnAt: new Date(), updatedAt: new Date() })
    .where(and(mine, eq(contactConsent.channel, "email")));
}


/** Churches whose grant runs out within `days`, soonest first. */
export async function grantsRunningOut(days: number): Promise<string[]> {
  const rows = await owner()<{ tenantId: string }[]>`
    select tenant_id as "tenantId"
      from church_providers
     where channel = 'email'
       and vendor = 'resend'
       and state = 'connected'
       and credential is not null
       and credential_expires_at is not null
       and credential_expires_at < now() + make_interval(days => ${days})
     order by credential_expires_at asc
     limit 50`;
  return rows.map((one) => one.tenantId);
}

/**
 * HRT-387, R16.1. One refresh of a church's grant at a time, across the
 * whole deployment.
 *
 * Resend issues a new refresh token on every exchange, refuses a spent one
 * and revokes the grant when one is replayed. Two things refreshing the same
 * church at the same moment is therefore not a race that loses a message, it
 * is a race that disconnects the church: the slower of them presents a token
 * the faster one has already spent.
 *
 * A Postgres advisory lock is what makes it one at a time, and it has to be
 * taken and released on the same connection, so one is reserved for the
 * length of it rather than borrowed from the pool per statement.
 *
 * `work` is expected to re-read the credential once it holds the lock: the
 * process it waited for has usually just refreshed, and the token it wrote is
 * the one to use rather than a reason to refresh again.
 */
export async function underGrantLock<T>(
  tenantId: string,
  work: () => Promise<T>,
): Promise<T | null> {
  const sql = owner();
  const held = await sql.reserve();

  try {
    /*
     * Asked for rather than waited on, so a connection is never held behind
     * a refresh that has stalled against Resend. The caller's own retry is
     * the next message or the next pass of the worker.
     */
    const deadline = Date.now() + 15_000;
    for (;;) {
      const [got] = await held<{ ok: boolean }[]>`
        select pg_try_advisory_lock(
          hashtext('connectapp.email-grant'), hashtext(${tenantId})
        ) as ok`;

      if (got?.ok) break;
      if (Date.now() >= deadline) return null;
      await new Promise((rest) => setTimeout(rest, 250));
    }

    try {
      return await work();
    } finally {
      await held`
        select pg_advisory_unlock(
          hashtext('connectapp.email-grant'), hashtext(${tenantId})
        )`;
    }
  } finally {
    held.release();
  }
}
