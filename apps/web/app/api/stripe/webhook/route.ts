import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  markStripeAccount, recordOnlineGift, failOnlineGift, recordRefund,
  saveRecurring, markRecurring,
} from "@connectapp/db";
import { stripe, stripeConfigured, stripeLive } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * R13.2. How the money actually arrived, in this product's own words.
 *
 * Stripe names a dozen ways to pay and a church cares about three: a card, a
 * bank, and everything else. A bank debit is slower and reconciles
 * differently, which is why it is worth telling apart.
 */
function methodFrom(type: string | undefined): "card" | "ach" | "other" {
  if (!type) return "card";
  if (type === "card" || type === "link") return "card";
  if (type.endsWith("_debit") || type === "us_bank_account") return "ach";
  return "other";
}

/**
 * R13.2. Why the bank said no, in words a treasurer can act on.
 *
 * Stripe carries the bank's own message, and that message is what the giver
 * will be told when they ring their bank, so it is passed through as given.
 */
function whyFrom(error: Stripe.PaymentIntent.LastPaymentError | null | undefined): string | null {
  if (!error) return null;
  return error.message || error.decline_code || error.code || null;
}

/**
 * R13.4. "fundId:cents;fundId:cents" as the giving page wrote it.
 *
 * Anything malformed comes back empty, and the gift lands whole on the fund
 * the payment named, because a gift that arrived has to be recorded.
 */
function splitFrom(value: string | undefined | null): { fundId: string; cents: number }[] {
  if (!value) return [];
  return value
    .split(";")
    .map((part) => {
      const [fundId, cents] = part.split(":");
      const amount = Number(cents);
      return fundId && Number.isInteger(amount) && amount > 0
        ? { fundId, cents: amount }
        : null;
    })
    .filter((part): part is { fundId: string; cents: number } => part !== null);
}

/**
 * R13.1, R13.2. What Stripe tells us after the fact.
 *
 * Every event here is about a church's own connected account, which is why
 * each one carries `event.account`. Nothing in this path trusts the body: the
 * signature is checked first, and an event without one is refused.
 *
 * It is idempotent. Stripe redelivers an event whenever it is unsure the first
 * one landed, and a gift written twice is a statement that is wrong in January.
 */
export async function POST(request: Request) {
  if (!stripeConfigured()) return new NextResponse("Not configured", { status: 503 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new NextResponse("Unsigned", { status: 400 });

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new NextResponse("Bad signature", { status: 400 });
  }

  /*
   * R13.2. A test event never writes into a real church's records.
   *
   * Stripe sends a production endpoint both live and test events, because a
   * platform can transact either way under one application. Every church that
   * connected before this platform swapped to live keys still holds a sandbox
   * account id, and that id still resolves to a real church here, so a test
   * payment on one of those accounts would otherwise have been written down
   * as a gift somebody actually gave.
   */
  if (event.livemode !== stripeLive()) return NextResponse.json({ received: true });

  const account = event.account;

  try {
    switch (event.type) {
      /* R13.1. Stripe has finished asking the church for its details. */
      case "account.updated": {
        const updated = event.data.object as Stripe.Account;
        await markStripeAccount({
          accountId: updated.id,
          chargesEnabled: updated.charges_enabled ?? false,
          payoutsEnabled: updated.payouts_enabled ?? false,
          detailsSubmitted: updated.details_submitted ?? false,
        });
        break;
      }

      /*
       * R13.2. A gift went through on the church's own account.
       *
       * The fee is read from the charge, because the church pays it and its
       * treasurer reconciles the deposit against it.
       */
      case "payment_intent.succeeded": {
        if (!account) break;
        const intent = event.data.object as Stripe.PaymentIntent;

        /*
         * R13.3. A collection on a repeating gift arrives twice: once as this
         * payment and once as the invoice that raised it. Only the invoice
         * knows who gave and what for, because that lives on the
         * subscription, so a payment this product did not write metadata onto
         * is left to the invoice below.
         */
        if (!intent.metadata?.fundId) break;
        const chargeId =
          typeof intent.latest_charge === "string"
            ? intent.latest_charge
            : intent.latest_charge?.id ?? null;

        let feeCents = 0;
        let method = "card";
        if (chargeId) {
          const charge = await stripe().charges.retrieve(
            chargeId,
            { expand: ["balance_transaction"] },
            { stripeAccount: account },
          );
          const balance = charge.balance_transaction;
          if (balance && typeof balance !== "string") feeCents = balance.fee;
          method = methodFrom(charge.payment_method_details?.type);
        }

        await recordOnlineGift({
          accountId: account,
          paymentIntentId: intent.id,
          chargeId,
          amountCents: intent.amount_received || intent.amount,
          feeCents,
          currency: intent.currency,
          receivedOn: new Date(intent.created * 1000).toISOString().slice(0, 10),
          method,
          fundId: intent.metadata?.fundId || null,
          split: splitFrom(intent.metadata?.split),
          memberId: intent.metadata?.memberId || null,
          coveredFee: intent.metadata?.coveredFee === "true",
          giverName: intent.metadata?.giverName || null,
          giverEmail: intent.metadata?.giverEmail || null,
        });
        break;
      }

      /*
       * R13.2. A bank debit the giver has authorised.
       *
       * Stripe takes the instruction now and moves the money over the next
       * few days, so the gift is written down pending: the church can see it
       * coming, and no total counts it until it has arrived. A card never
       * reaches here.
       */
      case "payment_intent.processing": {
        if (!account) break;
        const waiting = event.data.object as Stripe.PaymentIntent;
        if (!waiting.metadata?.fundId) break;

        await recordOnlineGift({
          accountId: account,
          paymentIntentId: waiting.id,
          chargeId: null,
          amountCents: waiting.amount,
          feeCents: 0,
          currency: waiting.currency,
          receivedOn: new Date(waiting.created * 1000).toISOString().slice(0, 10),
          method: methodFrom(waiting.payment_method_types?.[0]),
          fundId: waiting.metadata?.fundId || null,
          split: splitFrom(waiting.metadata?.split),
          memberId: waiting.metadata?.memberId || null,
          coveredFee: waiting.metadata?.coveredFee === "true",
          giverName: waiting.metadata?.giverName || null,
          giverEmail: waiting.metadata?.giverEmail || null,
          status: "pending",
        });
        break;
      }

      /*
       * R13.2. The bank returned it, or refused it.
       *
       * The row stays and reads as failed, because the church was already
       * shown the gift on its way and has to see that it did not arrive.
       */
      case "payment_intent.payment_failed": {
        if (!account) break;
        const refused = event.data.object as Stripe.PaymentIntent;
        await failOnlineGift({
          accountId: account,
          paymentIntentId: refused.id,
          reason: whyFrom(refused.last_payment_error),
        });
        break;
      }

      /*
       * R13.2. A bank debit returned after it had settled.
       *
       * Stripe raises a return on a settled bank debit as a dispute, days or
       * weeks later, and takes the money back out of the church's balance.
       * The gift reads as failed from then on, so the fund total and the
       * statement both come down with it.
       */
      case "charge.dispute.created": {
        if (!account) break;
        const dispute = event.data.object as Stripe.Dispute;
        await failOnlineGift({
          accountId: account,
          chargeId: typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id,
          paymentIntentId:
            typeof dispute.payment_intent === "string"
              ? dispute.payment_intent
              : dispute.payment_intent?.id ?? null,
          reason: dispute.reason ?? null,
        });
        break;
      }

      /*
       * R13.15. A refund to a bank account, days after it was asked for.
       *
       * Stripe says whether the money moved. Where the bank refused it, what
       * was taken off the gift goes back on, because it never left.
       */
      /*
       * R13.15, HRT-414. A refund, wherever it was made.
       *
       * Four types, because Stripe announces one refund in more than one way
       * and a treasurer refunding in Stripe's own dashboard raises
       * `refund.created` and `charge.refunded`, neither of which this
       * endpoint listened for. The gift stayed reading as given in full and
       * the year-end statement overstated it.
       *
       * The charge is read back rather than the event's own amount trusted,
       * because `amount_refunded` is the charge's total and is the same
       * answer however many of these arrive and in whatever order. A refund
       * that later fails lowers it again, which is the same path.
       */
      case "refund.created":
      case "refund.updated":
      case "charge.refund.updated":
      case "charge.refunded": {
        if (!account) break;

        const refund =
          event.type === "charge.refunded"
            ? null
            : (event.data.object as Stripe.Refund);
        const refunded = event.type === "charge.refunded"
          ? (event.data.object as Stripe.Charge)
          : null;

        const chargeId =
          refunded?.id ??
          (typeof refund?.charge === "string" ? refund.charge : refund?.charge?.id ?? null);
        if (!chargeId) break;

        const charge = await stripe().charges.retrieve(
          chargeId,
          undefined,
          { stripeAccount: account },
        );

        await recordRefund({
          accountId: account,
          /* The charge's own id where the event was about the charge: this
             column holds the last refund seen, and the total beside it is
             what a statement reads. */
          refundId: refund?.id ?? charge.refunds?.data?.[0]?.id ?? chargeId,
          chargeId: charge.id,
          paymentIntentId:
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent?.id ?? null,
          refundedCents: charge.amount_refunded ?? 0,
          status: refund?.status === "failed" ? "failed"
            : refund?.status === "pending" ? "pending"
            : "settled",
        });
        break;
      }

      /*
       * R13.3. A repeating gift was set up, or Stripe collected it again.
       *
       * The subscription is written down so the church can see what it is
       * expecting, and every collection still lands in gifts as its own row,
       * because that is what a statement is built from.
       */
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        if (!account) break;
        const sub = event.data.object as Stripe.Subscription;
        const item = sub.items.data[0];
        await saveRecurring({
          accountId: account,
          subscriptionId: sub.id,
          customerId: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
          amountCents: item?.price.unit_amount ?? 0,
          currency: sub.currency,
          interval: item?.price.recurring?.interval ?? "month",
          intervalCount: item?.price.recurring?.interval_count ?? 1,
          status: sub.status,
          startedOn: new Date(sub.created * 1000).toISOString().slice(0, 10),
          /*
           * R13.3. Stripe keeps the end of the current period on the
           * subscription item rather than on the subscription, and the end
           * of this period is when the next collection comes out.
           */
          nextOn: item?.current_period_end
            ? new Date(item.current_period_end * 1000).toISOString().slice(0, 10)
            : null,
          fundId: sub.metadata?.fundId || null,
          giverName: sub.metadata?.giverName || null,
          giverEmail: sub.metadata?.giverEmail || null,
        });
        break;
      }

      /*
       * R13.8. A card expired, or the bank said no.
       *
       * Stripe retries on its own schedule and tells the giver. What this is
       * for is the church: a repeating gift that has stopped collecting shows
       * on the giving screen rather than being noticed in March.
       */
      case "invoice.payment_failed": {
        const failed = event.data.object as Stripe.Invoice & {
          subscription?: string | { id: string } | null;
        };
        const subId =
          typeof failed.subscription === "string"
            ? failed.subscription
            : failed.subscription?.id ?? null;
        if (subId) await markRecurring({ subscriptionId: subId, status: "past_due" });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await markRecurring({ subscriptionId: sub.id, status: "canceled" });
        break;
      }

      /*
       * R13.3. A collection on a repeating gift.
       *
       * The first one arrives as a payment intent too, which is why this is
       * keyed on the intent: the two events describe one payment and the
       * unique index on the intent keeps it one row.
       */
      case "invoice.paid": {
        if (!account) break;
        const paid = event.data.object as Stripe.Invoice;

        /*
         * R13.3. An invoice no longer names its subscription or its payment
         * at the top level: the subscription and its metadata sit under
         * `parent`, and the payment is one of `payments`, which has to be
         * asked for. Both are read here rather than guessed at.
         */
        const subscription = paid.parent?.subscription_details;
        const metadata = subscription?.metadata ?? {};

        const full = await stripe().invoices.retrieve(
          paid.id as string,
          { expand: ["payments"] },
          { stripeAccount: account },
        );
        const payment = full.payments?.data?.[0]?.payment;
        const intentId =
          payment && payment.type === "payment_intent"
            ? typeof payment.payment_intent === "string"
              ? payment.payment_intent
              : payment.payment_intent?.id ?? null
            : null;
        if (!intentId) break;

        /* The fee Stripe took, which the church pays and reconciles against. */
        let feeCents = 0;
        let chargeId: string | null = null;
        let method = "card";
        const intent = await stripe().paymentIntents.retrieve(
          intentId,
          { expand: ["latest_charge.balance_transaction"] },
          { stripeAccount: account },
        );
        const charge = intent.latest_charge;
        if (charge && typeof charge !== "string") {
          chargeId = charge.id;
          const balance = charge.balance_transaction;
          if (balance && typeof balance !== "string") feeCents = balance.fee;
          method = methodFrom(charge.payment_method_details?.type);
        }

        await recordOnlineGift({
          accountId: account,
          paymentIntentId: intentId,
          chargeId,
          amountCents: paid.amount_paid,
          feeCents,
          currency: paid.currency,
          receivedOn: new Date(paid.created * 1000).toISOString().slice(0, 10),
          method,
          fundId: metadata.fundId || null,
          split: splitFrom(metadata.split),
          coveredFee: metadata.coveredFee === "true",
          giverName: metadata.giverName || null,
          giverEmail: metadata.giverEmail || paid.customer_email || null,
          /* R13.3. Raised by a subscription, which is what an invoice is. */
          recurring: true,
          subscriptionId: subscription?.subscription
            ? typeof subscription.subscription === "string"
              ? subscription.subscription
              : subscription.subscription.id
            : null,
        });
        break;
      }

      default:
        break;
    }
  } catch {
    // Stripe retries on anything but a 2xx, which is what we want when the
    // database was briefly unreachable.
    return new NextResponse("Retry", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
