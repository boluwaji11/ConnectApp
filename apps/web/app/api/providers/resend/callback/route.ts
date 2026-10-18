import { NextResponse } from "next/server";
import {
  withTenant, connectEmailProvider, saveSendingDomain, type TenantRole,
} from "@connectapp/db";
import {
  exchangeCode, openHandshake, resendClientId, hashNonce, RESEND_NONCE,
} from "@/lib/resend-oauth";
import { cookies } from "next/headers";
import { resendDomain } from "@/lib/email-provider";
import { here, redirectUri } from "../hop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * HRT-288, R16.1, R21.15. Back from Resend, connected, on the way to the
 * screen the church started on.
 *
 * Resend returns to one registered address and that address is the parent,
 * which in development is a host the church's session cookie is never sent
 * to. So nothing here reads a session or a cookie: the state carries which
 * church this is, sealed with our own key fifteen minutes ago by a request
 * that did have a session and did have the permission. An earlier version
 * asked the church to sign in again halfway through connecting.
 *
 * Everything a church would have done by hand happens here. The code becomes a
 * token, the root of the address it sends from becomes a domain on its own
 * Resend account, and the settings that domain needs are written down so the
 * screen can show them.
 */
export async function GET(request: Request) {
  const asked = new URL(request.url);
  const { proto, host: parent } = await here();

  const held = openHandshake(asked.searchParams.get("state") ?? "");
  const home = held?.host ?? parent;
  const back = new URL(`${proto}://${home}/settings/email`);

  const refuse = (why: string) => {
    back.searchParams.set("resend", why);
    const away = NextResponse.redirect(back);
    /* SEC-014. Spent either way, so a captured URL cannot be tried twice. */
    away.cookies.delete(RESEND_NONCE);
    return away;
  };

  if (!held) return refuse("expired");

  /*
   * SEC-014. The browser that finishes this has to be the browser that started
   * it. A sealed state proves somebody with the permission asked; the cookie
   * proves it was this person, which is what stops an administrator of one
   * church handing the URL to somebody else and collecting their Resend
   * account.
   */
  const carried = (await cookies()).get(RESEND_NONCE)?.value ?? "";
  if (!held.nonce || !carried || hashNonce(carried) !== held.nonce) {
    return refuse("expired");
  }

  /* The church pressed No on Resend's own screen, which is an answer rather
     than a fault. */
  if (asked.searchParams.get("error")) return refuse("refused");

  const clientId = resendClientId();
  const code = asked.searchParams.get("code") ?? "";
  if (!clientId || !code) return refuse("expired");

  const got = await exchangeCode({
    clientId,
    redirectUri: await redirectUri(),
    code,
    verifier: held.verifier,
  });
  if (!got.ok) return refuse("exchange");

  /*
   * R16.1. The domain exactly as the church typed it, rather than the apex
   * above it.
   *
   * Resend verifies the domain it was given and nothing under or over it, so
   * a church sending from office@mail.church.org needs mail.church.org
   * verified; registering church.org for it is registering the wrong thing.
   * Sending from a subdomain is also what Resend asks for, because it keeps
   * the apex's reputation out of whatever the church sends.
   */
  const root = (held.from.split("@")[1] ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!root || !root.includes(".") || root.startsWith(".")) return refuse("noAddress");

  const made = await resendDomain(got.tokens.accessToken, root);
  if (!made.ok) {
    /*
     * R16.1, R22.2. Resend's own sentence, carried to the screen.
     *
     * "Resend would not take that domain" tells a church nothing it can act
     * on. Resend says why, in its own words, and those words name the thing:
     * a domain somebody else already holds, an address that is not a domain,
     * an account that has reached its limit. They are the church's to read.
     */
    console.error("[resend] domain refused", root, made.said);
    back.searchParams.set("domain", root);
    back.searchParams.set("why", made.said.slice(0, 200));
    /* The one refusal with a thing to do about it: somebody already holds
       this domain on Resend, here or on another account. */
    const held = /already exist|registered already|already registered|already in use/i;
    return refuse(held.test(made.said) ? "domainTaken" : "domain");
  }

  const actor = {
    tenantId: held.tenantId,
    role: held.role as TenantRole,
    userId: held.userId ?? undefined,
  };

  try {
    await withTenant(actor, async (tx) => {
      const providerId = await connectEmailProvider(tx, actor, {
        vendor: "resend",
        /* R21.15. The refresh token is what the worker sends with months from
           now. Resend rotates it on every use and refuses one used twice, so
           whatever refreshes it writes the new one back first. */
        credential: got.tokens.refreshToken,
        externalAccountId: made.domain.id,
        fromName: held.name,
        fromAddress: held.from,
        settings: null,
      });
      await saveSendingDomain(tx, actor, {
        providerId,
        domain: made.domain.name,
        records: made.domain.records,
      });
    });
  } catch {
    return refuse("exchange");
  }

  return refuse("connected");
}
