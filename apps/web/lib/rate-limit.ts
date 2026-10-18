import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * SEC-026, R21.5. How often one caller may do something expensive.
 *
 * The support form had the only limiter in the product. Everything else that an
 * unauthenticated caller can reach was unlimited: a public form submission,
 * which writes a row and a person record and can carry a ten megabyte file; an
 * event registration; a gift, which creates a Stripe Checkout Session and
 * sometimes a Stripe Customer on the church's own account; and the demo, where
 * one request clones an entire church.
 *
 * On a platform that is free and donation funded, that is the cost line rather
 * than a nuisance: the expensive ones are expensive in somebody else's bill, or
 * in a church's storage quota, or in Stripe's rate limit for that church's
 * account.
 *
 * The shape is the support form's, lifted so there is one of these rather than
 * five: refuse to run unlimited on a deployment, run unlimited on a laptop
 * where there is no Redis and nobody to abuse it, and key on a hash of the
 * address so the limiter holds no addresses itself.
 */

export type Verdict = "ok" | "over" | "unavailable";

/** The caller's address, where the proxy gave us one we believe. */
export async function callerIp(): Promise<string | undefined> {
  const head = await headers();
  const forwarded = head.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate =
    head.get("x-real-ip") ?? head.get("cf-connecting-ip") ?? forwarded ?? undefined;
  return candidate && isIP(candidate) ? candidate : undefined;
}

/**
 * Whether this caller may go ahead.
 *
 * `unavailable` is a refusal too, and a deliberate one: a deployment that
 * cannot limit must not serve these paths, because an open endpoint with no
 * limiter is the whole of the problem.
 */
export async function withinLimit(
  what: string,
  howMany: number,
  perWindow: `${number} ${"s" | "m" | "h"}`,
  /** Something stabler than an address where the path has one, like a slug. */
  alsoKeyedOn?: string,
): Promise<Verdict> {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  const deployed = !!process.env["VERCEL"];
  const limited = !!url && !!token;

  if (!limited) {
    if (deployed) {
      console.error(`[${what}] rate limiting is not configured`);
      return "unavailable";
    }
    return "ok";
  }

  const ip = await callerIp();
  if (!ip) return "unavailable";

  try {
    const limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(howMany, perWindow),
      prefix: `connectapp:${what}`,
    });
    const key = createHash("sha256")
      .update(alsoKeyedOn ? `${alsoKeyedOn}:${ip}` : ip)
      .digest("hex");
    return (await limiter.limit(key)).success ? "ok" : "over";
  } catch (error) {
    console.error(`[${what}] rate limiting could not be applied`, error);
    return "unavailable";
  }
}
