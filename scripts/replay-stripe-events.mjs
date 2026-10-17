/**
 * HRT-410. Deliver again what Stripe could not deliver the first time.
 *
 * When an environment has no webhook destination, or holds the wrong secret,
 * Stripe has nowhere to report a gift and the money reaches the church's
 * Stripe account while the product's own records stay empty. Stripe keeps the
 * events either way, so the gifts are recoverable: this reads them back and
 * posts each one to our endpoint the way Stripe would, signed with the same
 * secret, so the recovery runs through the production code path rather than
 * writing rows behind it.
 *
 *   node scripts/replay-stripe-events.mjs acct_123            what it would send
 *   node scripts/replay-stripe-events.mjs acct_123 --send     send it
 *
 * Safe to run twice. Every handler behind this endpoint is idempotent, because
 * Stripe redelivers on its own whenever it is unsure one landed.
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const account = process.argv[2];
const send = process.argv.includes("--send");
const since = Number(process.env.SINCE ?? 0);

if (!account?.startsWith("acct_")) {
  console.error("Usage: node scripts/replay-stripe-events.mjs <acct_...> [--send]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(`${root}/.env.local`, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const key = env["STRIPE_SECRET_KEY"];
const secret = env["STRIPE_WEBHOOK_SECRET"];
const BASE = process.env.DEV_BASE_URL ?? "https://dev.connectapp.church";
if (!key || !secret) throw new Error("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must both be set.");
if (!key.includes("_test_")) throw new Error("That is a live key. This is for the development sandbox.");

/** Only what the endpoint acts on. Anything else is noise to replay. */
const ACTED_ON = new Set([
  "account.updated", "payment_intent.succeeded", "payment_intent.processing",
  "payment_intent.payment_failed", "charge.dispute.created",
  "refund.created", "refund.updated", "charge.refund.updated", "charge.refunded",
  "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed",
]);

async function events() {
  const found = [];
  let after;
  for (;;) {
    const url = new URL("https://api.stripe.com/v1/events");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("starting_after", after);
    if (since) url.searchParams.set("created[gte]", String(since));
    const answer = await fetch(url, {
      headers: { authorization: `Bearer ${key}`, "Stripe-Account": account },
    });
    const said = await answer.json();
    if (!answer.ok) throw new Error(said.error?.message ?? `${answer.status}`);
    found.push(...said.data);
    if (!said.has_more || said.data.length === 0) break;
    after = said.data[said.data.length - 1].id;
  }
  /* Oldest first, so a gift is written before the refund against it. */
  return found.filter((one) => ACTED_ON.has(one.type)).reverse();
}

/** The header Stripe signs each delivery with, made the same way. */
function signature(body) {
  const at = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", secret).update(`${at}.${body}`).digest("hex");
  return `t=${at},v1=${mac}`;
}

const found = await events();
console.log(`${found.length} events this endpoint acts on, on ${account}`);
if (!send) {
  for (const one of found) {
    console.log(`  ${new Date(one.created * 1000).toISOString().slice(0, 19)}  ${one.type}`);
  }
  console.log("\nNothing was sent. Add --send.");
  process.exit(0);
}

let sent = 0;
for (const one of found) {
  /* A delivery carries the account it is about at the top level, which is
     what `event.account` is read from on the other side. */
  const body = JSON.stringify({ ...one, account });
  const answer = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature(body) },
    body,
  });
  const said = await answer.text();
  console.log(`  ${answer.status}  ${one.type}  ${answer.ok ? "" : said.slice(0, 80)}`);
  if (answer.ok) sent += 1;
}
console.log(`\n${sent} of ${found.length} accepted.`);
