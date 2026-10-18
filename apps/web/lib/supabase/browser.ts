"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * R1.8. The Supabase client in the browser, for one thing only.
 *
 * Everything else in this product talks to Supabase from the server, because
 * data access goes through Drizzle on the tenant-scoped connection and
 * authentication is settled before a screen renders. See
 * docs/architecture.md.
 *
 * A passkey is the exception and cannot be anything else.
 * `navigator.credentials` lives in the browser, the private key never leaves
 * the device, and the ceremony is a conversation between the browser and the
 * authenticator that a server cannot stand in the middle of. So the challenge
 * is fetched and the signed answer returned from here.
 *
 * It reads and writes the same cookies the server client does, so a session
 * raised to aal2 by a passkey is the session the next request resolves.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
  );
}
