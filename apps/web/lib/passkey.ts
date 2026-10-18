import "server-only";
import { headers } from "next/headers";

/**
 * R1.8, R21.1. Which name a passkey is bound to, and whether to offer one.
 *
 * A passkey is tied to a relying party, which is a registrable domain. A key
 * created on `connectapp.church` works on `riverside.connectapp.church`,
 * because one is under the other, and does not work on a church's own domain,
 * because `stmarys.example` is a different registrable domain with no
 * relationship to ours.
 *
 * That is a property of WebAuthn rather than a thing to work around: binding
 * the key to the domain is what stops a convincing copy of this product
 * collecting one. So a passkey is offered on our own names, where the binding
 * holds for every church, and an authenticator app stays the answer for a
 * church reached at its own domain.
 *
 * `rpOrigins` names the addresses the ceremony may be run from, which is the
 * platform's own site and every church's name under it.
 */
export interface RelyingParty {
  /** The registrable domain the key is bound to. */
  rpId: string;
  /** The exact origins allowed to run the ceremony. */
  rpOrigins: string[];
}

/** The bare host, without the port a laptop carries. */
function bare(host: string): string {
  return host.split(":")[0]!.toLowerCase();
}

/**
 * Our own registrable domain, as this deployment is configured.
 *
 * Read from the environment rather than inferred from the request, for the
 * reason `cookieDomain()` gives: working the parent out from a host is how a
 * preview deployment claims a domain it does not own, and a relying party is
 * a stronger claim than a cookie.
 */
function ours(): string | null {
  const named = process.env["AUTH_COOKIE_DOMAIN"]?.trim()
    ?? process.env["PLATFORM_HOST"]?.trim();
  return named ? bare(named.replace(/^\./, "")) : null;
}

/**
 * The relying party for this request, or null where a passkey is not offered.
 *
 * Null for a church on its own domain, and null where this deployment has not
 * said what its own name is, because guessing it is the mistake above.
 */
export async function relyingParty(): Promise<RelyingParty | null> {
  /*
   * R1.8. Passkeys are a Supabase project setting as well as code.
   *
   * WebAuthn enrolment is off by default on a Supabase project and the API
   * answers `mfa_webauthn_enroll_not_enabled` until it is turned on. Offering
   * the button regardless means a person presses it, meets an error, and
   * learns not to trust the screen. This flag is set once per environment,
   * after the project setting is turned on, so the two cannot disagree.
   */
  if (process.env["PASSKEYS_ENABLED"] !== "true") return null;

  const head = await headers();
  const host = bare(head.get("x-forwarded-host") ?? head.get("host") ?? "");
  if (!host) return null;

  const root = ours();
  if (!root) return null;

  const proto = head.get("x-forwarded-proto")
    ?? (host === "localhost" || host.endsWith(".localhost") ? "http" : "https");
  const origin = `${proto}://${head.get("x-forwarded-host") ?? head.get("host")}`;

  /* On our own name, or on a church's name underneath it. */
  if (host === root || host.endsWith(`.${root}`)) {
    return { rpId: root, rpOrigins: [origin] };
  }

  return null;
}
