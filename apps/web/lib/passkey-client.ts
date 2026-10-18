"use client";

import { supabaseBrowser } from "./supabase/browser";

/**
 * R1.8. The passkey ceremony, which can only happen in the browser.
 *
 * The private key is made by the device and never leaves it. What travels is
 * a signed answer to a challenge, and the signature covers the origin the
 * ceremony ran on, which is what makes a passkey impossible to phish: a
 * convincing copy of this product on another name gets an answer its own
 * server cannot use.
 *
 * `rpId` and `rpOrigins` are decided on the server (lib/passkey.ts) rather
 * than read from `location` here, so the name a key is bound to is not
 * something a page can be talked into changing.
 */
export interface RelyingParty {
  rpId: string;
  rpOrigins: string[];
}

/** A message key, or nothing where it worked. */
export interface Outcome {
  error?: "twoStep.error.passkey" | "twoStep.error.passkeyGone";
}

/** Whether this browser can do any of it, asked before anything is offered. */
export function passkeysWork(): boolean {
  return typeof window !== "undefined"
    && typeof window.PublicKeyCredential !== "undefined";
}

/**
 * Registers a passkey as a second factor.
 *
 * `register` does the whole ceremony: it enrols the factor, fetches the
 * challenge, calls `navigator.credentials.create`, and verifies the answer.
 * A person who dismisses the system prompt lands here as an error, and the
 * unverified factor it leaves behind is cleared the next time either kind of
 * enrolment starts.
 */
export async function registerPasskey(party: RelyingParty): Promise<Outcome> {
  if (!passkeysWork()) return { error: "twoStep.error.passkey" };

  const supabase = supabaseBrowser();
  const api = supabase.auth.mfa as unknown as {
    webauthn: {
      register: (p: {
        friendlyName: string;
        webauthn: RelyingParty;
      }) => Promise<{ error: unknown }>;
    };
  };

  try {
    const { error } = await api.webauthn.register({
      friendlyName: `passkey-${Date.now()}`,
      webauthn: party,
    });
    return error ? { error: "twoStep.error.passkey" } : {};
  } catch {
    return { error: "twoStep.error.passkey" };
  }
}

/**
 * Presents a passkey at sign-in, which raises this session to aal2.
 *
 * The browser client writes the same cookies the server reads, so the session
 * the next request resolves is the one this upgraded.
 */
export async function presentPasskey(
  factorId: string,
  party: RelyingParty,
): Promise<Outcome> {
  if (!passkeysWork()) return { error: "twoStep.error.passkeyGone" };

  const supabase = supabaseBrowser();
  const api = supabase.auth.mfa as unknown as {
    webauthn: {
      authenticate: (p: {
        factorId: string;
        webauthn: RelyingParty;
      }) => Promise<{ error: unknown }>;
    };
  };

  try {
    const { error } = await api.webauthn.authenticate({ factorId, webauthn: party });
    return error ? { error: "twoStep.error.passkeyGone" } : {};
  } catch {
    return { error: "twoStep.error.passkeyGone" };
  }
}
