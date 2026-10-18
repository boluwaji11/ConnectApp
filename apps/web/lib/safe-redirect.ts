/**
 * SEC-008, R1.4, R1.7. Where this product is willing to send somebody.
 *
 * Six places built a redirect, or the landing address of an authentication
 * email, out of something the caller sent: a `next` in the query, a
 * `redirect_to` on the way to Supabase, or the request's own Host header. None
 * of them checked it.
 *
 * The one that matters most is `redirect_to`. The send-email hook puts it into
 * the link a church is emailed, `/auth/verify` hands it to Supabase, and
 * Supabase appends the proof of identity to it once the token is spent. An
 * address nobody checked therefore carries a live credential to wherever it
 * points. The sibling route in the admin portal already clamps it, with a
 * comment saying exactly that; this is the same clamp for the product.
 *
 * Two kinds of answer, because the two cases are different:
 *
 * - `safePath` is for a destination inside this product. A path, or nothing.
 *   `//evil.example` is a protocol-relative URL rather than a path, which is
 *    the shape that gets past a `startsWith("/")` written on its own.
 * - `ourOrigin` is for an absolute address, which a church on its own domain
 *   legitimately needs. Only our own names and a church's own name pass it,
 *   and the church's is read from the database rather than believed.
 */
import "server-only";
import { resolveTenantByHost } from "@connectapp/db";
import { safePath } from "./safe-path";

export { safePath };

/** The names this platform answers on, from configuration rather than a request. */
function ourHosts(): string[] {
  const named = [
    process.env["PLATFORM_SITE"],
    process.env["PLATFORM_ADMIN_SITE"],
    process.env["NEXT_PUBLIC_DEMO_HOST"],
    process.env["PLATFORM_HOST"],
  ];

  const hosts: string[] = [];
  for (const one of named) {
    if (!one) continue;
    const bare = one.trim().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").toLowerCase();
    if (bare) hosts.push(bare);
  }
  return hosts;
}

/** Whether a host is ours, or a single name under one of ours. */
function isOurs(host: string): boolean {
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  if (!name) return false;
  return ourHosts().some((ours) => {
    const root = ours.split(":")[0]!;
    return name === root || name.endsWith(`.${root}`);
  });
}

/**
 * The origin of an address we will send somebody to, or null.
 *
 * A church's own domain counts, because the signed-in screens are meant to
 * live on it and the session cookie is first-party there. It has to be a
 * domain a church has actually set, which is a lookup rather than a guess.
 */
export async function ourOrigin(asked: string | null | undefined): Promise<string | null> {
  if (!asked) return null;

  let url: URL;
  try {
    url = new URL(asked);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  /* An address carrying credentials renders as somebody else's name. */
  if (url.username || url.password) return null;

  if (isOurs(url.host)) return `${url.protocol}//${url.host}`;

  const church = await resolveTenantByHost(url.host);
  return church ? `${url.protocol}//${url.host}` : null;
}

/**
 * An address this product will redirect to, or null.
 *
 * A path is returned as a path. An absolute address is returned whole, once
 * its origin has been allowed, so the path and query a link was built with
 * survive.
 */
export async function safeDestination(asked: string | null | undefined): Promise<string | null> {
  const path = safePath(asked);
  if (path) return path;
  if (!asked) return null;
  const origin = await ourOrigin(asked);
  if (!origin) return null;
  try {
    const url = new URL(asked);
    return `${origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * The origin of the request, clamped to a name we answer on.
 *
 * Used where an authentication email's landing address is built from the
 * request. Behind a proxy `x-forwarded-host` is the browser's host, which is
 * only ever a name routed to this deployment, and a church's custom domain is
 * one of those. So the clamp matters: it is the difference between a link in
 * our own email landing on our product and landing wherever a host that
 * reaches us happens to point tomorrow.
 */
export async function safeOrigin(headers: Headers): Promise<string> {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  const proto =
    headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.endsWith(".localhost") ? "http" : "https");

  const allowed = await ourOrigin(host ? `${proto}://${host}` : null);
  if (allowed) return allowed;

  /* Nothing we recognise. The configured site is the honest fallback: a link
     that lands on the product is better than one that lands nowhere. */
  const home = (process.env["PLATFORM_SITE"] ?? "https://connectapp.church").replace(/\/$/, "");
  return home;
}
