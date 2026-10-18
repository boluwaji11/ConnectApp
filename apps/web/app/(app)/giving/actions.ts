"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  withTenant, openBatch, updateBatch, amendBatch, removeBatch,
  recordGift, removeGift, refundGift, attachGift, giftCharge, getStripeAccount,
  getChurch, lookupPeople, personForUser,
  recurringSubscription, markRecurring, canManageGiving, PermissionError, type GiftMethod,
} from "@connectapp/db";
import { stripe, stripeConfigured, asChurch } from "@/lib/stripe";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { churchNow } from "@/lib/church-now";
import { stepUpNeeded, type MayNeedStepUp } from "@/lib/step-up";

export interface GivingResult extends MayNeedStepUp {
  error?: string;
  id?: string;
}

async function context() {
  const session = await requireSession();
  const who = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
  return { actor: who, ctx: who };
}

/** R13.10. Opening a count, on what the counters say is in the bag. */
export async function startCount(
  input: {
    name: string;
    receivedOn: string;
    /** R13.9, R13.10. What was counted, and which fund it was given to. */
    fundId: string;
    amountCents: number;
    /** R13.12. Cash or cheques, which is what a session is counting. */
    method?: GiftMethod;
    counterOneId?: string | null;
    counterTwoId?: string | null;
  },
  ): Promise<GivingResult & { slug?: string }> {
  const { actor, ctx } = await context();
  try {
    const made = await withTenant(ctx, async (tx) => {
      const batch = await openBatch(tx, actor, input);
      /* The session and the first thing counted are one press. */
      await recordGift(tx, actor, {
        fundId: input.fundId,
        batchId: batch.id,
        amountCents: input.amountCents,
        method: input.method ?? "cash",
        receivedOn: input.receivedOn,
      });
      return batch;
    });

    revalidatePath("/giving");
    return { id: made.id, slug: made.slug };
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R13.10, R13.11. Changing a count that is still open. */
export async function saveCount(
  id: string,
  input: {
    name?: string;
    receivedOn?: string;
    expectedCents?: number;
    counterOneId?: string | null;
    counterTwoId?: string | null;
  },
  ): Promise<GivingResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => updateBatch(tx, actor, id, input));
    revalidatePath(`/giving/counts/${id}`);
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R13.12 to R13.14. A line on the count, or a gift on its own. */
export async function addGift(
  input: {
    memberId?: string | null;
    fundId: string;
    batchId?: string | null;
    amountCents: number;
    method: GiftMethod;
    reference?: string | null;
    receivedOn: string;
    note?: string | null;
    inKindDescription?: string | null;
  },
  ): Promise<GivingResult> {
  const { actor, ctx } = await context();
  try {
    const { id } = await withTenant(ctx, (tx) => recordGift(tx, actor, input));
    revalidatePath("/giving");
    if (input.batchId) revalidatePath(`/giving/counts/${input.batchId}`);
    return { id };
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R13.15. Taking a line back off a count that is still open. */
export async function dropGift(
  id: string,
  batchId: string | null,
  ): Promise<GivingResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => removeGift(tx, actor, id));
    revalidatePath("/giving");
    if (batchId) revalidatePath(`/giving/counts/${batchId}`);
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R13.15. Giving a gift back.
 *
 * A card gift goes back through Stripe first, on the church's own account, and
 * is written down only once Stripe has agreed to it. A cash gift is written
 * down here and handed over by the church.
 */
export async function giveBack(
  id: string,
  cents: number,
  ): Promise<GivingResult> {
  const { actor, ctx } = await context();
  /*
   * SEC-003, R13.15. Asked before the money moves, not after.
   *
   * `refundGift` holds the only permission check on this path and it runs
   * last, so a reader who may not manage giving still reached
   * `stripe().refunds.create` and moved real money out of the church's Stripe
   * balance. The write was then refused, which left Stripe and the church's
   * books disagreeing with nothing on either side saying why.
   *
   * The amount is bounded here for the same reason: `refundGift` checks it
   * against what the gift has left, and it checked after Stripe had agreed to
   * whatever was asked for.
   */
  try {
    if (!canManageGiving(actor)) throw new PermissionError(actor.role, "recordGift");

    /*
     * R1.8, R21.4. The code again, before Stripe is told anything.
     *
     * Above the read and above the refund, for the same reason the permission
     * check moved up here: once `refunds.create` has answered, the money has
     * left the church's balance and nothing on this path puts it back.
     */
    const stop = await stepUpNeeded();
    if (stop) return stop;

    const gift = await withTenant(ctx, (tx) => giftCharge(tx, id));
    if (!gift) return { error: "gift.error.missing" };

    const amount = Math.round(cents);
    if (!Number.isInteger(amount) || amount <= 0) return { error: "gift.error.refund" };
    if (amount + gift.refundedCents > gift.amountCents) return { error: "gift.error.refund" };

    /*
     * R13.15. A card is answered at once and a bank account is not: Stripe
     * takes the instruction and moves the money over the following days, so
     * what it says about the refund is written down with it.
     */
    let how: { status?: "settled" | "pending" | "failed"; refundId?: string | null } = {};

    if (gift.chargeId) {
      if (!stripeConfigured()) return { error: "stripe.unconfigured" };
      const account = await withTenant(ctx, (tx) => getStripeAccount(tx));
      if (!account) return { error: "stripe.unconfigured" };

      const back = await stripe().refunds.create(
        { charge: gift.chargeId, amount },
        asChurch(account.accountId),
      );
      how = {
        status: back.status === "succeeded" ? "settled" : back.status === "pending" ? "pending" : "failed",
        refundId: back.id,
      };
    }

    await withTenant(ctx, (tx) => refundGift(tx, actor, id, amount, how));
    revalidatePath("/giving");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R13.18. Saying who a gift was from, where nobody was attached to it. */
export async function nameGiver(
  id: string,
  memberId: string | null,
  ): Promise<GivingResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => attachGift(tx, actor, id, memberId));
    revalidatePath("/giving");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface GiverHit {
  id: string;
  name: string;
}

/** R13.12. Who gave, looked up as the treasurer types the name. */
export async function findGiver(query: string): Promise<GiverHit[]> {
  const session = await requireSession();
  const ctx = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
  try {
    return await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const asOf = churchNow(profile?.timezone ?? "America/Chicago").date;
      const matches = await lookupPeople(tx, query, { asOf, limit: 10 });
      return matches.map((one) => ({
        id: one.person.id,
        name: `${one.person.name} ${one.person.lastName}`.trim(),
      }));
    });
  } catch {
    return [];
  }
}

/**
 * R13.3, R13.19. Stopping a repeating gift, inside this product.
 *
 * Stripe is told to cancel the subscription on the church's own account, and
 * the row is marked here at once so the screen is right before the webhook
 * lands. Stripe sends `customer.subscription.deleted` as well, which writes
 * the same thing, so the two cannot disagree.
 *
 * A member may stop their own. Anybody who runs the church's giving may stop
 * any of them, because a treasurer is asked to.
 */
export async function stopRepeating(id: string): Promise<GivingResult> {
  if (!stripeConfigured()) return { error: "stripe.unconfigured" };

  const session = await requireSession();
  const ctx = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };

  try {
    const read = await withTenant(ctx, async (tx) => ({
      gift: await recurringSubscription(tx, id),
      self: await personForUser(tx, session.userId),
      account: await getStripeAccount(tx),
    }));

    if (!read.gift || !read.account) return { error: "give.error.closed" };

    const mine = read.self !== null && read.gift.memberId === read.self;
    if (!mine && !canManageGiving(ctx)) throw new PermissionError(ctx.role, "manageGiving");

    await stripe().subscriptions.cancel(
      read.gift.subscriptionId,
      undefined,
      asChurch(read.account.accountId),
    );
    await markRecurring({ subscriptionId: read.gift.subscriptionId, status: "canceled" });

    revalidatePath("/giving");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R13.3. Changing the card a repeating gift is collected on, in this page.
 *
 * Stripe's own fields, in Stripe's frame, inside the church's screen. The
 * card number goes from the browser to Stripe and never reaches this server,
 * which is what keeps every church on this product in PCI scope SAQ-A.
 *
 * What comes back is a session to draw, and the subscription it belongs to
 * rides in the session's metadata so that nothing the browser sends decides
 * which gift is changed.
 */
export async function startCardChange(
  id: string,
  ): Promise<{ secret?: string; accountId?: string; error?: string }> {
  if (!stripeConfigured()) return { error: "stripe.unconfigured" };

  const session = await requireSession();
  const ctx = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };

  try {
    const read = await withTenant(ctx, async (tx) => ({
      gift: await recurringSubscription(tx, id),
      self: await personForUser(tx, session.userId),
      account: await getStripeAccount(tx),
    }));

    if (!read.gift?.customerId || !read.account) return { error: "give.error.closed" };

    const mine = read.self !== null && read.gift.memberId === read.self;
    if (!mine && !canManageGiving(ctx)) throw new PermissionError(ctx.role, "manageGiving");

    const head = await headers();
    const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:4488";
    const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

    const made = await stripe().checkout.sessions.create(
      {
        mode: "setup",
        customer: read.gift.customerId,
        currency: "usd",
        metadata: { subscriptionId: read.gift.subscriptionId },
        ui_mode: "embedded_page" as never,
        return_url:
          `${proto}://${host}/giving/card`
          + `?session={CHECKOUT_SESSION_ID}`,
      },
      asChurch(read.account.accountId),
    );

    return { secret: made.client_secret ?? undefined, accountId: read.account.accountId };
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R13.10. Putting right a counting session that was entered wrong. */
export async function amendCount(
  id: string,
  input: {
    name: string;
    receivedOn: string;
    fundId: string;
    amountCents: number;
    method: GiftMethod;
  },
  ): Promise<GivingResult> {
  const { actor, ctx } = await context();
    /*
     * SEC-022. A picker is a read of the whole directory, so it asks the same
     * permission the writes beside it ask.
     *
     * These returned name, address and household for anybody in the church to
     * any signed-in account. The product has a separate member-facing
     * directory whose default is name-only and whose visibility switches a
     * member can turn off; this handed out the staff view instead, so a member
     * who had turned every switch off was disclosed anyway.
     */
    if (!canManageGiving(actor)) throw new PermissionError(actor.role, "manageGiving");

  try {
    await withTenant(ctx, (tx) => amendBatch(tx, actor, id, input));
    revalidatePath("/giving");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R13.10. Taking a counting session off the record, with what it held. */
export async function removeCount(id: string): Promise<GivingResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => removeBatch(tx, actor, id));
    revalidatePath("/giving");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}
