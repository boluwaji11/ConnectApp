/**
 * HRT-402, R21.x. The development site is for the team, and nobody else.
 *
 * Production is open by design: the marketing pages, a church's own public
 * site and its join links are all meant to be read by anybody. Every one of
 * those is open on the development deployment too, which is a copy of the
 * product carrying seeded records, half-built screens and whatever was pushed
 * twenty minutes ago. None of that should be reachable by an address somebody
 * guesses.
 *
 * The check itself is a row in `platform_admins`, which is the same list the
 * admin portal runs on: one place to add somebody, one place to take them
 * off. Middleware cannot read that list, because it runs where the database
 * connection does not belong, so the pass below carries the answer instead. It
 * is minted once, by a route that can reach the database, and checked on every
 * request after that with no round trip at all.
 *
 * Nothing here runs in production, and nothing here runs on a laptop: a
 * developer's own machine is already the developer's.
 */

/** The cookie holding a pass. */
export const DEV_PASS = "connectapp-dev-pass";

/** How long a pass is good for before the team list is read again. */
const HOURS = 12;

const encoder = new TextEncoder();

/**
 * Whether this deployment gates itself.
 *
 * Deployed and not production. `VERCEL` is set on every Vercel build and on
 * nothing else, which is what keeps `pnpm dev` ungated: a laptop reaching its
 * own development server has already proved whatever there is to prove.
 */
export function gated(): boolean {
  if (process.env["VERCEL"] !== "1") return false;
  const where = (process.env["CONNECTAPP_ENV"] ?? process.env["VERCEL_ENV"] ?? "").toLowerCase();
  return where !== "production";
}

function secret(): string | null {
  return process.env["DEV_GATE_SECRET"] || null;
}

async function key(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(value),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const b64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * A pass for one account, good for twelve hours.
 *
 * It names who it was minted for and when it stops counting, and is signed, so
 * it cannot be written by whoever holds it. Minted only by `/dev-gate`, which
 * has just read the team list.
 */
export async function mintPass(userId: string): Promise<string | null> {
  const value = secret();
  if (!value) return null;
  const body = `${userId}.${Date.now() + HOURS * 60 * 60 * 1000}`;
  const mac = await crypto.subtle.sign("HMAC", await key(value), encoder.encode(body));
  return `${body}.${b64url(mac)}`;
}

/**
 * Whether a pass is this deployment's own and still counts.
 *
 * Edge-safe on purpose: WebCrypto rather than node:crypto, because this is
 * read in middleware on every request the site answers.
 */
export async function passHolds(pass: string | undefined): Promise<boolean> {
  const value = secret();
  if (!value || !pass) return false;

  const cut = pass.lastIndexOf(".");
  if (cut < 0) return false;
  const body = pass.slice(0, cut);
  const given = pass.slice(cut + 1);

  /*
   * SEC-028. Verified rather than compared.
   *
   * `b64url(mac) !== given` short-circuits on the first differing character.
   * WebCrypto has a verify of its own that does not, and it is the same call
   * with the signature handed in rather than recomputed.
   *
   * The decode is inside the try with it. This runs in middleware on every
   * request the site answers, so a throw here is not a refused pass, it is a
   * deployment that answers nothing.
   */
  let ok = false;
  try {
    const padded = given.replace(/-/g, "+").replace(/_/g, "/");
    const signature = Uint8Array.from(
      atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "=")),
      (c) => c.charCodeAt(0),
    );
    ok = await crypto.subtle.verify("HMAC", await key(value), signature, encoder.encode(body));
  } catch {
    /* Not base64, the wrong length, or not a signature at all. */
    return false;
  }
  if (!ok) return false;

  const until = Number(body.slice(body.lastIndexOf(".") + 1));
  return Number.isFinite(until) && until > Date.now();
}

/**
 * What stays reachable without a pass.
 *
 * The door, what the door needs, and the machine routes, which carry their own
 * proof and would otherwise be turned away from a deployment that is meant to
 * be exercising them.
 */
export function openInDev(path: string): boolean {
  return (
    path === "/dev-gate" ||
    path === "/sign-in" ||
    path.startsWith("/auth/") ||
    path.startsWith("/api/")
  );
}
