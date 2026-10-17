import { eq } from "drizzle-orm";
import type { Tx } from "../client";
import { owner } from "../client";
import { stripeAccounts } from "../schema/giving";
import { PermissionError, canManageGiving } from "../roles";
import type { WriteActor } from "./members";

/**
 * R13.1. The church's own Stripe account, as this product knows it.
 *
 * The account belongs to the church. It is created through Stripe Connect with
 * the church as the account holder, the money settles to the church's own bank,
 * and every charge carries a platform application fee of zero. Nothing here is
 * a credential: it is an id and what Stripe last said about it.
 */

export interface ChurchStripeAccount {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  livemode: boolean;
}

/**
 * HRT-386, R13.5. The same, plus what it costs the church.
 *
 * Kept apart from the write shape above because the rate is the church's own
 * answer rather than anything Stripe reports, so the calls that write down
 * what Stripe said must not be able to touch it by passing the whole record
 * back.
 */
export interface ChurchStripeAccountRead extends ChurchStripeAccount {
  /** The day the church said Stripe granted it the nonprofit rate. */
  nonprofitRateAt: Date | null;
}

/** R13.1. What this church is connected to, if anything. */
export async function getStripeAccount(db: Tx): Promise<ChurchStripeAccountRead | null> {
  const [row] = await db
    .select({
      accountId: stripeAccounts.accountId,
      chargesEnabled: stripeAccounts.chargesEnabled,
      payoutsEnabled: stripeAccounts.payoutsEnabled,
      detailsSubmitted: stripeAccounts.detailsSubmitted,
      livemode: stripeAccounts.livemode,
      nonprofitRateAt: stripeAccounts.nonprofitRateAt,
    })
    .from(stripeAccounts)
    .limit(1);
  return row ?? null;
}

/**
 * HRT-386, R13.5. The church telling us which rate Stripe charges it.
 *
 * Stripe reports this nowhere, so the church is the only one who knows. It is
 * a date rather than a flag because it is never backdated at Stripe's end
 * either: gifts taken before it were charged at the full rate, and a statement
 * worked out later has to be able to tell which side of the day a gift fell.
 */
export async function markNonprofitRate(
  db: Tx,
  actor: WriteActor,
  granted: boolean,
): Promise<void> {
  if (!canManageGiving(actor)) throw new PermissionError(actor.role, "manageGiving");

  await db
    .update(stripeAccounts)
    .set({ nonprofitRateAt: granted ? new Date() : null, updatedAt: new Date() })
    .where(eq(stripeAccounts.tenantId, actor.tenantId));
}

/** R13.1. Writing down the account the church just created, or what it became. */
export async function saveStripeAccount(
  db: Tx,
  actor: WriteActor,
  input: ChurchStripeAccount,
): Promise<void> {
  if (!canManageGiving(actor)) throw new PermissionError(actor.role, "manageGiving");

  const [existing] = await db
    .select({ id: stripeAccounts.id })
    .from(stripeAccounts)
    .limit(1);

  if (existing) {
    await db
      .update(stripeAccounts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(stripeAccounts.id, existing.id));
    return;
  }

  await db.insert(stripeAccounts).values({ tenantId: actor.tenantId, ...input });
}

/**
 * R13.1. Which church an account belongs to, read with no session.
 *
 * A Stripe webhook arrives with an account id and nothing else: there is no
 * signed-in person and no tenant set, so this is one of the few reads that
 * cannot go through RLS. It returns an id and a flag, never a record.
 */
export async function tenantForStripeAccount(accountId: string): Promise<string | null> {
  const rows = await owner()<{ tenantId: string }[]>`
    select tenant_id as "tenantId" from stripe_accounts where account_id = ${accountId} limit 1`;
  return rows[0]?.tenantId ?? null;
}

/** R13.1. What Stripe says about the account now, written from a webhook. */
export async function markStripeAccount(input: {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}): Promise<void> {
  await owner()`
    update stripe_accounts
       set charges_enabled = ${input.chargesEnabled},
           payouts_enabled = ${input.payoutsEnabled},
           details_submitted = ${input.detailsSubmitted},
           updated_at = now()
     where account_id = ${input.accountId}`;
}

/**
 * R13.1, R13.2. Writing down a gift that came in through Stripe.
 *
 * Called from the webhook, which arrives with no session and no tenant set, so
 * it cannot go through RLS. It is narrow on purpose: it writes one row against
 * the church the account belongs to, and it is idempotent, because Stripe
 * delivers an event more than once whenever it is unsure.
 */
export async function recordOnlineGift(input: {
  accountId: string;
  paymentIntentId: string;
  chargeId: string | null;
  amountCents: number;
  feeCents: number;
  currency: string;
  receivedOn: string;
  /** From the metadata the giving page put on the payment. */
  fundId?: string | null;
  /** R13.4. Where the gift was split, what each fund took, in whole cents. */
  split?: { fundId: string; cents: number }[];
  memberId?: string | null;
  coveredFee?: boolean;
  /** R13.2. How it was paid: card, ach or other, as the charge says. */
  method?: string;
  /** R13.6. What the giver typed on the church's own giving page. */
  giverName?: string | null;
  giverEmail?: string | null;
  /**
   * R13.2. settled, or pending while a bank debit is still on its way.
   *
   * A gift written pending is updated in place when the money lands, because
   * it is the same payment: the row keeps its id, so a fund it was split
   * across and a person it was attached to both survive settlement.
   */
  status?: "settled" | "pending";
  /** R13.3. Collected by a repeating gift rather than given by hand. */
  recurring?: boolean;
  /** R13.3. The subscription that raised it, where one did. */
  subscriptionId?: string | null;
}): Promise<void> {
  const tenantId = await tenantForStripeAccount(input.accountId);
  if (!tenantId) return;

  const sql = owner();

  /*
   * The fund the giver chose, where the page said so and it still belongs to
   * this church. Anything else lands on the church's first live fund, because
   * a gift that arrived is a gift that has to be recorded.
   */
  const funds = await sql<{ id: string }[]>`
    select id from funds
     where tenant_id = ${tenantId}
       and archived_at is null
       and (${input.fundId ?? null}::uuid is null or id = ${input.fundId ?? null}::uuid)
     order by position asc
     limit 1`;
  const fundId = funds[0]?.id;
  if (!fundId) return;

  /*
   * R13.18. Whoever this is, if the church already has them.
   *
   * Matched on the address they gave Stripe, which is the one they typed on
   * the giving page. No match leaves the gift standing in their own name, and
   * the church can put it against a person later.
   */
  let memberId = input.memberId ?? null;
  const email = input.giverEmail?.trim().toLowerCase() || null;
  if (!memberId && email) {
    const people = await sql<{ id: string }[]>`
      select m.id
        from members m
        join contact_methods c on c.member_id = m.id
       where m.tenant_id = ${tenantId}
         and c.kind = 'email'
         and lower(c.value) = ${email}
         and m.archived_at is null
       limit 2`;
    // Two people on one address is a household sharing it, and guessing which
    // of them gave is worse than leaving it to the church.
    if (people.length === 1) memberId = people[0]!.id;
  }

  /*
   * R13.4. A split is one row a fund. The fee rides on the first of them,
   * because Stripe charged it once on the whole payment.
   */
  const live = await sql<{ id: string }[]>`
    select id from funds where tenant_id = ${tenantId} and archived_at is null`;
  const known = new Set(live.map((one) => one.id));

  const parts = (input.split ?? [])
    .filter((part) => known.has(part.fundId) && part.cents > 0)
    .slice(0, 8);
  const shares = parts.length > 0
    ? parts
    : [{ fundId, cents: input.amountCents }];

  const status = input.status ?? "settled";

  for (const [at, share] of shares.entries()) {
    /*
     * R13.2. A bank debit arrives here twice: once pending, when the giver
     * authorises it, and again days later when the money has moved. The
     * second one settles the row that is already there and writes what only
     * settlement knows, the charge and the fee Stripe took. A redelivered
     * event changes nothing, because a settled gift is left alone.
     */
    await sql`
      insert into gifts (
        tenant_id, member_id, fund_id, amount_cents, currency, method,
        received_on, stripe_payment_intent_id, stripe_charge_id, fee_cents, covered_fee,
        giver_name, giver_email, status, recurring, stripe_subscription_id
      )
      values (
        ${tenantId}, ${memberId}, ${share.fundId}, ${share.cents},
        ${input.currency}, ${input.method ?? "card"}, ${input.receivedOn}::date,
        ${input.paymentIntentId}, ${input.chargeId}, ${at === 0 ? input.feeCents : 0},
        ${input.coveredFee ?? false},
        ${input.giverName ?? null}, ${email}, ${status}, ${input.recurring ?? false},
        ${input.subscriptionId ?? null}
      )
      on conflict (tenant_id, stripe_payment_intent_id, fund_id) do update
         set status = ${status},
             stripe_charge_id = coalesce(${input.chargeId}, gifts.stripe_charge_id),
             fee_cents = ${at === 0 ? input.feeCents : 0},
             method = ${input.method ?? "card"},
             updated_at = now()
       where gifts.status <> 'settled'`;
  }
}

/**
 * R13.2. A bank debit that was returned, or a payment the bank refused.
 *
 * The row stays and reads as failed. A treasurer who was told a gift was on
 * its way needs to see that it did not arrive, and the giver usually rings
 * about it.
 */
export async function failOnlineGift(input: {
  accountId: string;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  /** What the bank said, as Stripe passed it on. */
  reason?: string | null;
}): Promise<void> {
  const tenantId = await tenantForStripeAccount(input.accountId);
  if (!tenantId) return;
  const intentId = input.paymentIntentId ?? null;
  const chargeId = input.chargeId ?? null;
  if (!intentId && !chargeId) return;

  /*
   * A bank debit can also be returned after it has settled, days later, which
   * is why a settled gift is not spared here: the money went back out of the
   * church's account and the record has to say so. A gift already marked
   * failed is left as it is, so a redelivered event keeps the first reason.
   */
  await owner()`
    update gifts
       set status = 'failed',
           failure_reason = coalesce(${input.reason ?? null}, failure_reason),
           updated_at = now()
     where tenant_id = ${tenantId}
       and status <> 'failed'
       and (
         (${intentId}::text is not null and stripe_payment_intent_id = ${intentId})
         or (${chargeId}::text is not null and stripe_charge_id = ${chargeId})
       )`;
}

/**
 * R13.15, HRT-414. What Stripe says has been refunded against a gift.
 *
 * The total is taken from Stripe rather than added up here, which is what
 * makes this safe to call twice. Stripe redelivers whenever it is unsure one
 * landed, a refund arrives as several event types, and a charge can be
 * refunded in parts; accumulating under any of those subtracts twice. The
 * charge's own `amount_refunded` is the one number that is true whatever
 * order the events arrive in, and it falls back when a refund fails.
 *
 * It no longer matters where the refund was made. Before this, only a refund
 * the product itself issued was ever recorded, because the row had to already
 * carry the refund's id; a treasurer who refunded in Stripe's dashboard, which
 * is where a treasurer with a Stripe login goes, left the gift reading as
 * given in full and the year-end statement overstating it.
 */
export async function recordRefund(input: {
  accountId: string;
  /** The refund this event was about, kept as the most recent one seen. */
  refundId: string;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  /** The charge's total refunded, from Stripe. Not a delta. */
  refundedCents: number;
  /** Where that total currently stands. */
  status: "settled" | "pending" | "failed";
}): Promise<void> {
  const tenantId = await tenantForStripeAccount(input.accountId);
  if (!tenantId) return;

  const intentId = input.paymentIntentId ?? null;
  const chargeId = input.chargeId ?? null;
  if (!intentId && !chargeId) return;

  /*
   * `least` so a figure Stripe reports larger than the gift we hold, which
   * should not happen and would mean the two disagree about the amount, can
   * never put a gift into a refunded-for-more-than-it-was state that a
   * statement would then have to explain.
   */
  await owner()`
    update gifts
       set refunded_cents = least(${input.refundedCents}, amount_cents),
           refunded_at = case
             when ${input.refundedCents} > 0 then coalesce(refunded_at, now())
             else null
           end,
           refund_status = case when ${input.refundedCents} > 0 then ${input.status} else null end,
           stripe_refund_id = ${input.refundId},
           updated_at = now()
     where tenant_id = ${tenantId}
       and (
         (${intentId}::text is not null and stripe_payment_intent_id = ${intentId})
         or (${chargeId}::text is not null and stripe_charge_id = ${chargeId})
       )
       and (
         refunded_cents is distinct from least(${input.refundedCents}, amount_cents)
         or refund_status is distinct from
            (case when ${input.refundedCents} > 0 then ${input.status} else null end)
       )`;
}
