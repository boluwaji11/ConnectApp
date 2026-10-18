import { NextResponse } from "next/server";
import { canManageChurch } from "@connectapp/db";
import { requireSession } from "@/lib/session";
import {
  authorizeUrl, newVerifier, resendClientId, sealHandshake, newNonce, RESEND_NONCE,
} from "@/lib/resend-oauth";
import { spanningSubdomains } from "@/lib/cookie-domain";
import { here, redirectUri } from "../hop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * HRT-288, R16.1. The press that sends a church to Resend.
 *
 * This is the only point in the journey with a session on it, so it is where
 * the church is read and where the permission is checked. Everything the way
 * back needs goes into a sealed state: which church, who pressed it, what mail
 * goes out as, and the verifier that proves the code came back to whoever
 * asked for it. Nothing readable leaves this server.
 */
export async function GET(request: Request) {
  const session = await requireSession();
  const back = new URL("/settings/email", request.url);

  if (!canManageChurch(session)) return NextResponse.redirect(back);

  const clientId = resendClientId();
  if (!clientId) {
    back.searchParams.set("resend", "unconfigured");
    return NextResponse.redirect(back);
  }

  const asked = new URL(request.url);
  const address = (asked.searchParams.get("from") ?? "").trim().toLowerCase();
  if (!address) {
    back.searchParams.set("resend", "noAddress");
    return NextResponse.redirect(back);
  }

  const { host } = await here();
  const verifier = newVerifier();

  /*
   * SEC-014. The handshake is bound to this browser, not only sealed.
   *
   * The sealed state proves that somebody with the permission asked for this
   * within the last fifteen minutes. It did not prove that the person who
   * finishes it is the person who started it, and the landing reads no session
   * by design. So an administrator of any church, including one they registered
   * for the purpose, could mint this URL and send it to somebody else: if that
   * person consented on Resend's own screen, their Resend account was attached
   * to the attacker's church, and the scope asked for is full access.
   *
   * The nonce goes to the browser in a cookie and its hash goes into the state.
   * The landing requires both, so a URL handed to somebody else no longer
   * completes.
   */
  const nonce = newNonce();

  const away = NextResponse.redirect(
    authorizeUrl({
      clientId,
      redirectUri: await redirectUri(),
      state: sealHandshake({
        tenantId: session.tenantId,
        role: session.role,
        userId: session.userId ?? null,
        /* The church's own address, so the way back lands where it started
           rather than on ours. Sealed, so it cannot be swapped in transit. */
        host,
        from: address,
        name: (asked.searchParams.get("name") ?? "").trim(),
        verifier,
        nonce: nonce.hashed,
      }),
      verifier,
    }),
  );

  /*
   * On the parent, because Resend returns to the parent and a cookie left on
   * the church's own host would not be sent there. Fifteen minutes, matching
   * the state it is paired with.
   */
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 15 * 60,
    domain: undefined as string | undefined,
  };
  away.cookies.set(RESEND_NONCE, nonce.value, spanningSubdomains(options));

  return away;
}
