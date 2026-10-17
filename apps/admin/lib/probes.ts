import "server-only";
import { owner } from "@connectapp/db";
import { environment } from "@connectapp/env";
import type { Health } from "@/components/state-dot";

/**
 * HRT-394, N3. Liveness probes for every external service the platform depends
 * on.
 *
 * Each probe calls the service rather than inspecting local configuration: a
 * credential that parses is not a credential that works.
 *
 * Each probe uses the cheapest call the provider offers and carries its own
 * deadline, and all seven run concurrently. Run in sequence, a full outage
 * would cost seven timeouts of wall-clock time on the one morning the screen
 * is being read.
 */

/** Per-probe deadline. */
const BUDGET_MS = 6_000;
/** Above this a passing probe is reported as slow rather than healthy. */
const SLOW_MS = 1_500;

export interface Shape {
  service: string;
  /** Display name, as the status screen shows it. */
  label: string;
  /** What stops working when this service is down. */
  matters: string;
}

export interface Probe extends Shape {
  state: Health;
  tookMs: number | null;
  said: string | null;
}

/**
 * Display text per service, held separately from the probe results.
 *
 * A stored reading is only a service name and a state, and the status screen
 * draws stored readings while they are fresh. Keeping the text here lets both
 * live and stored readings resolve it.
 */
export const SHAPE: Shape[] = [
  { service: "database", label: "Database", matters: "Everything. No screen renders without it." },
  { service: "supabase", label: "Supabase Auth", matters: "Signing in, for churches and for us." },
  { service: "stripe", label: "Stripe", matters: "Every gift a church receives." },
  { service: "resend", label: "Resend", matters: "The welcome, the approval and every confirmation." },
  { service: "redis", label: "Upstash Redis", matters: "The rate limits in front of the public forms." },
  { service: "queue", label: "The send queue", matters: "Every message a church sends to its people." },
  { service: "web", label: "The product", matters: "The site a church opens." },
  {
    service: "stripeWebhook",
    label: "Stripe's webhook",
    matters: "Whether a gift given reaches the church's records.",
  },
];

const words = (service: string): Shape =>
  SHAPE.find((one) => one.service === service) ?? { service, label: service, matters: "" };

/** fetch with the probe deadline applied. */
async function ask(url: string, init: RequestInit = {}): Promise<Response> {
  const stop = AbortSignal.timeout(BUDGET_MS);
  return fetch(url, { ...init, signal: stop, cache: "no-store" });
}

/**
 * Resolve with `whenLate` if `work` has not settled within `ms`.
 *
 * The AbortSignal on each fetch is not sufficient. A database connection is
 * not a fetch, and postgres.js waits on the connection pool without a deadline
 * of its own. Without this wrapper the health route hung for five minutes on
 * Vercel and returned nothing: a status check that never returns reports less
 * than one that reports a service as unreachable.
 */
export function within<T>(ms: number, work: Promise<T>, whenLate: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(whenLate), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** Run one probe, time it, and map anything it throws to a failed state. */
async function timed(
  service: string,
  work: () => Promise<{ state: Health; said?: string | null }>,
): Promise<Probe> {
  const started = Date.now();
  try {
    const answer = await work();
    const tookMs = Date.now() - started;
    /* Report a slow pass as a warning. A four-second response is a signal
       that a green light would hide. */
    const state: Health =
      answer.state === "pass" && tookMs > SLOW_MS ? "warn" : answer.state;
    return {
      ...words(service),
      state,
      tookMs,
      said: answer.said ?? (state === "warn" && answer.state === "pass" ? `Took ${tookMs}ms` : null),
    };
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    return {
      ...words(service),
      state: "fail",
      tookMs: Date.now() - started,
      /* An abort reads as "The operation was aborted", which names no
         service and no deadline. Replace it with both. */
      said: said.includes("abort") || said.includes("timeout")
        ? `No answer inside ${BUDGET_MS / 1000}s`
        : said,
    };
  }
}

const off = (service: string, said: string): Probe => ({
  ...words(service), state: "off", tookMs: null, said,
});

/** Check database availability. */
const database = () =>
  timed("database", async () => {
    const rows = await owner()<{ ok: number }[]>`select 1 as ok`;
    return { state: rows[0]?.ok === 1 ? "pass" : "fail" };
  });

/** Check Supabase Auth, which every sign-in depends on. */
const supabase = () => {
  const url = process.env["SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    return Promise.resolve(
      off("supabase", "No Supabase URL or key"),
    );
  }

  return timed("supabase", async () => {
    /*
     * The health endpoint wants the key like every other call to the auth API.
     * Without it the answer is 401, which reads as Supabase being down when it
     * is Supabase working correctly and being asked wrongly.
     */
    const answer = await ask(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (answer.ok) return { state: "pass" };
    return { state: "fail", said: `${answer.status} ${answer.statusText}` };
  });
};

/**
 * Stripe. The balance is the cheapest authenticated call there is, and a
 * restricted key scoped to Connect can still read it.
 */
const stripe = () => {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return Promise.resolve(off("stripe", "No STRIPE_SECRET_KEY"));

  return timed("stripe", async () => {
    const answer = await ask("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (answer.ok) return { state: "pass" };
    /*
     * A restricted key may legitimately be refused the balance while being
     * perfectly good for what this platform does with it. That is a key
     * Stripe recognised, which is what the probe is asking.
     */
    if (answer.status === 403) return { state: "pass", said: "Key is good, scoped away from the balance" };
    const body = (await answer.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { state: "fail", said: body?.error?.message ?? `${answer.status} ${answer.statusText}` };
  });
};

/**
 * HRT-410, R13.2. Whether Stripe has anywhere to tell us a gift happened.
 *
 * A gift is written to our records by the webhook and by nothing else. With no
 * destination the money still reaches the church's Stripe account and the
 * Payouts screen still shows it, because that screen reads Stripe live, so the
 * product looks right while its own records stay empty. Development ran that
 * way until somebody gave money and went looking for it.
 *
 * Two things have to hold: Stripe has a destination pointing at this
 * environment, and this environment holds the secret to verify its deliveries.
 * Either one missing means every delivery is refused.
 */
const stripeWebhook = () => {
  const key = process.env["STRIPE_SECRET_KEY"];
  const host = process.env["PLATFORM_HOST"];
  if (!key) return Promise.resolve(off("stripeWebhook", "No STRIPE_SECRET_KEY"));
  if (!host || host === "localhost") {
    return Promise.resolve(off("stripeWebhook", "Nothing deployed to receive one"));
  }

  return timed("stripeWebhook", async () => {
    if (!process.env["STRIPE_WEBHOOK_SECRET"]) {
      return { state: "fail", said: "No STRIPE_WEBHOOK_SECRET, so every delivery is refused" };
    }

    const answer = await ask("https://api.stripe.com/v1/webhook_endpoints?limit=100", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!answer.ok) {
      /* A restricted key may be scoped away from this without being a bad key,
         and that is not an answer to the question being asked. */
      if (answer.status === 403) return { state: "warn", said: "Key is scoped away from the endpoints" };
      return { state: "fail", said: `${answer.status} ${answer.statusText}` };
    }

    const said = (await answer.json()) as { data?: { url?: string; status?: string }[] };
    const ours = (said.data ?? []).filter((one) => typeof one.url === "string" && one.url.includes(host));
    if (ours.length === 0) {
      return { state: "fail", said: `Nothing points at ${host}, so no gift is recorded` };
    }
    const live = ours.filter((one) => one.status === "enabled");
    if (live.length === 0) return { state: "fail", said: "Its destination is disabled" };
    return { state: "pass", said: null };
  });
};

/** Resend, which carries the welcome, the approval and every confirmation. */
const resend = () => {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    return Promise.resolve(
      off("resend", "No RESEND_API_KEY"),
    );
  }

  return timed("resend", async () => {
    const answer = await ask("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (answer.ok) return { state: "pass" };
    const body = (await answer.json().catch(() => null)) as { message?: string } | null;
    return { state: "fail", said: body?.message ?? `${answer.status} ${answer.statusText}` };
  });
};

/**
 * Upstash, which rate-limits the public support form.
 *
 * This portal's own sign-in throttle does not use it: that counts rows in
 * platform_sign_ins and needs nothing outside the database. Upstash is probed
 * because the portal watches the platform rather than itself, and the public
 * support form accepts unlimited submissions without a limiter in front.
 */
const redis = () => {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) {
    return Promise.resolve(
      off("redis", "No Upstash credentials"),
    );
  }

  return timed("redis", async () => {
    const answer = await ask(`${url.replace(/\/$/, "")}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (answer.ok) return { state: "pass" };
    return { state: "fail", said: `${answer.status} ${answer.statusText}` };
  });
};

/**
 * End-to-end check of the product over the public internet.
 *
 * The only probe that covers the whole path rather than a single dependency:
 * DNS, the certificate, Vercel, the application, and a render that reaches the
 * database.
 */
const web = () => {
  const host = process.env["PLATFORM_HOST"];
  if (!host || host === "localhost") {
    return Promise.resolve(
      off("web", "Nothing to reach in development"),
    );
  }

  return timed("web", async () => {
    const answer = await ask(`https://${host}/`, { redirect: "manual" });
    /* A redirect to the sign-in screen is the product answering. */
    if (answer.ok || (answer.status >= 300 && answer.status < 400)) return { state: "pass" };
    return { state: "fail", said: `${answer.status} ${answer.statusText}` };
  });
};

/**
 * HRT-394, R16.6. The send queue worker, which can be dead while every screen
 * still renders correctly.
 *
 * The worker is a GitHub Actions schedule, so there is no endpoint to call.
 * Its state is inferred from the rows it leaves behind: rows claimed over an
 * hour ago and never finished mean a worker was killed part way through, and a
 * non-empty queue with nothing moving means the schedule has stopped.
 */
const queue = () =>
  timed("queue", async () => {
    const rows = await owner()<{ waiting: number; stuck: number; old: number }[]>`
      select
        (select count(*)::int from email_recipients where state = 'queued') as waiting,
        (select count(*)::int from email_recipients
          where state = 'sending' and claimed_at < now() - interval '1 hour') as stuck,
        (select count(*)::int from email_recipients
          where state = 'queued' and at < now() - interval '30 minutes'
            and (next_try is null or next_try < now())) as old`;
    const found = rows[0];
    if (!found) return { state: "fail", said: "The queue could not be read" };

    if (found.stuck > 0) {
      return { state: "fail", said: `${found.stuck} copies claimed over an hour ago and never finished` };
    }
    if (found.old > 0) {
      return { state: "warn", said: `${found.old} copies have been waiting over half an hour` };
    }
    return { state: "pass", said: found.waiting > 0 ? `${found.waiting} waiting their turn` : null };
  });

/** Every probe, at once. */
export async function probeEverything(): Promise<Probe[]> {
  const late = (service: string): Probe => ({
    ...words(service),
    state: "fail",
    tookMs: BUDGET_MS,
    said: `No answer inside ${BUDGET_MS / 1000}s`,
  });

  return Promise.all(
    ([
      ["database", database],
      ["supabase", supabase],
      ["stripe", stripe],
      ["resend", resend],
      ["redis", redis],
      ["queue", queue],
      ["web", web],
      ["stripeWebhook", stripeWebhook],
    ] as const).map(([service, run]) =>
      /* A second over the budget each probe already works to, so a probe that
         is about to answer is not cut off by the net below it. */
      within(BUDGET_MS + 1_000, run(), late(service)),
    ),
  );
}

/** What environment these answers belong to, for the row they are written as. */
export const probeEnvironment = (): string => environment();
