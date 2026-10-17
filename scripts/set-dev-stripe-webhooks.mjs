/**
 * HRT-410. The two webhook destinations development needs, and their secrets.
 *
 * A gift is recorded by the webhook and by nothing else. Without a destination
 * the money reaches the church's Stripe account, Payouts shows it because that
 * screen reads Stripe live, and the product's own records stay empty. That is
 * what happened in development: the sandbox had no destinations at all, so
 * every gift given there since the sandbox was made went unrecorded.
 *
 * `set-dev-stripe.sh` left this as a sentence telling somebody to go and do it
 * in the dashboard. A step a person has to remember is a step that gets
 * skipped, so it is made here instead.
 *
 *   node scripts/set-dev-stripe-webhooks.mjs            writes to Vercel Preview
 *   node scripts/set-dev-stripe-webhooks.mjs --print    prints, writes nothing
 *
 * Idempotent: a destination already pointing at the same URL is reused, and
 * its secret is only readable at creation, so one that exists and whose secret
 * is not held is replaced.
 */
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const ENV = join(root, ".env.local");
const BASE = process.env.DEV_BASE_URL ?? "https://dev.connectapp.church";
const print = process.argv.includes("--print");

/** R13.2. Every event the gift webhook acts on, and nothing it ignores. */
const GIFT_EVENTS = [
  "account.updated",
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "charge.dispute.created",
  /* HRT-414. One refund is announced more than one way, and a refund made in
     Stripe's own dashboard raises the first two of these and neither of the
     last two. All four are taken; the handler reads the charge's total, so
     hearing the same refund four times records it once. */
  "refund.created",
  "refund.updated",
  "charge.refund.updated",
  "charge.refunded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

/** R13.1. What the account route acts on. Accounts v2, so a v2 destination. */
const ACCOUNT_EVENTS = [
  "v2.core.account_link.returned",
  "v2.core.account[configuration.merchant].updated",
  "v2.core.account[configuration.merchant].capability_status_updated",
  "v2.core.account[requirements].updated",
  "v2.core.account[identity].updated",
];

function env() {
  return Object.fromEntries(
    readFileSync(ENV, "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
  );
}

const key = env()["STRIPE_SECRET_KEY"];
if (!key) throw new Error("No STRIPE_SECRET_KEY in .env.local. Run set-dev-stripe.sh first.");
if (!key.includes("_test_")) {
  throw new Error("That is a live key. This script is for the development sandbox only.");
}

async function stripe(path, { method = "GET", body, version } = {}) {
  const answer = await fetch(`https://api.stripe.com/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(version ? { "Stripe-Version": version } : null),
      ...(body ? { "content-type": typeof body === "string" ? "application/x-www-form-urlencoded" : "application/json" } : null),
    },
    body: typeof body === "string" ? body : body ? JSON.stringify(body) : undefined,
  });
  const said = await answer.json();
  if (!answer.ok) throw new Error(`${method} ${path}: ${said.error?.message ?? answer.status}`);
  return said;
}

/** The v1 endpoint that carries the gifts, scoped to connected accounts. */
async function giftEndpoint() {
  const url = `${BASE}/api/stripe/webhook`;
  const held = await stripe("v1/webhook_endpoints?limit=100");
  const already = held.data.find((one) => one.url === url);
  if (already) {
    /* The secret is shown once, at creation. An endpoint whose secret nobody
       holds cannot be verified against, so it is replaced rather than left to
       reject every delivery. */
    await stripe(`v1/webhook_endpoints/${already.id}`, { method: "DELETE" });
  }
  const form = new URLSearchParams();
  form.set("url", url);
  form.set("connect", "true");
  form.set("description", "ConnectApp development, gifts on connected accounts");
  for (const [i, type] of GIFT_EVENTS.entries()) form.set(`enabled_events[${i}]`, type);
  const made = await stripe("v1/webhook_endpoints", { method: "POST", body: form.toString() });
  return { id: made.id, secret: made.secret, url, replaced: Boolean(already) };
}

/** The v2 destination that carries the account's own events. */
async function accountDestination() {
  const url = `${BASE}/api/stripe/account`;
  const version = "2025-09-30.preview";
  const held = await stripe("v2/core/event_destinations?limit=100", { version });
  const already = held.data?.find((one) => one.webhook_endpoint?.url === url);
  if (already) await stripe(`v2/core/event_destinations/${already.id}`, { method: "DELETE", version });

  const made = await stripe("v2/core/event_destinations", {
    method: "POST", version,
    body: {
      name: "connectapp-dev-account",
      description: "ConnectApp development, the connected account's own events",
      type: "webhook_endpoint",
      event_payload: "thin",
      enabled_events: ACCOUNT_EVENTS,
      webhook_endpoint: { url },
      include: ["webhook_endpoint.signing_secret"],
    },
  });
  return {
    id: made.id,
    secret: made.webhook_endpoint?.signing_secret,
    url,
    replaced: Boolean(already),
  };
}

const gift = await giftEndpoint();
let account = null;
try {
  account = await accountDestination();
} catch (trouble) {
  console.error(`The account destination was not made: ${trouble.message}`);
  console.error("Make it in the sandbox's Developers screen, pointed at");
  console.error(`  ${BASE}/api/stripe/account`);
}

console.log(`${gift.replaced ? "Replaced" : "Made"} ${gift.url}`);
if (account) console.log(`${account.replaced ? "Replaced" : "Made"} ${account.url}`);

if (print) {
  console.log(`\nSTRIPE_WEBHOOK_SECRET=${gift.secret}`);
  if (account?.secret) console.log(`STRIPE_ACCOUNT_WEBHOOK_SECRET=${account.secret}`);
  process.exit(0);
}

function writeLocal(name, value) {
  const lines = readFileSync(ENV, "utf8").split("\n");
  let done = false;
  const out = lines.map((line) => {
    if (!line.startsWith(`${name}=`)) return line;
    done = true;
    return `${name}=${value}`;
  });
  if (!done) out.push(`${name}=${value}`);
  writeFileSync(ENV, out.join("\n"));
  chmodSync(ENV, 0o600);
}

function writeVercel(name, value) {
  execFileSync("vercel", ["env", "add", name, "preview", "--force"], {
    cwd: root, input: value, stdio: ["pipe", "ignore", "inherit"],
  });
}

writeLocal("STRIPE_WEBHOOK_SECRET", gift.secret);
writeVercel("STRIPE_WEBHOOK_SECRET", gift.secret);
if (account?.secret) {
  writeLocal("STRIPE_ACCOUNT_WEBHOOK_SECRET", account.secret);
  writeVercel("STRIPE_ACCOUNT_WEBHOOK_SECRET", account.secret);
}
console.log("Secrets written into .env.local and Vercel Preview. Production was not touched.");
console.log("Redeploy development for the Preview variables to take effect.");
