import { adoptTheme } from "@/lib/theme";
import { NextResponse, type NextRequest } from "next/server";
import { syncUserAndAcceptInvitations } from "@connectapp/db";
import { supabaseServer } from "@/lib/supabase/server";
import { explainAuth } from "@/lib/auth-errors";
import { landingFor } from "@/lib/landing";
import { safeDestination } from "@/lib/safe-redirect";

/**
 * Where an email link lands. Handles both shapes Supabase sends: a PKCE `code`,
 * and a `token_hash` plus `type` pair.
 *
 * Invitations are accepted here rather than at invite time, because this is the
 * first moment the email address is known to be verified. Accepting earlier would
 * turn an invitation into a way to join a church by claiming someone's address.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const supabase = await supabaseServer();

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "magiclink" | "email" | "recovery" | "invite" })
      : { data: { user: null }, error: new Error("This link is missing its token.") };

  if (result.error || !result.data.user) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(explainAuth(result.error))}`,
    );
  }

  const user = result.data.user;
  await syncUserAndAcceptInvitations({
    id: user.id,
    email: user.email ?? "",
    fullName: (user.user_metadata?.["full_name"] as string | undefined) ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
  });

  // R24.x. Their own palette, brought onto this device.
  await adoptTheme(user.id);

  /*
   * R17.1. Where they land may be the church's own address, which already
   * carries its own origin. Only a path needs ours put in front of it.
   *
   * SEC-008. The absolute branch used to take whatever it was given, so
   * `?next=https://evil.example` was an off-site redirect from our own origin
   * immediately after the session cookie was set, which is the landing a
   * phished sign-in wants. An absolute address now has to be one of our names
   * or a domain a church has actually set.
   */
  const asked = await safeDestination(next);
  const to = asked ?? (await landingFor(user.id));
  return NextResponse.redirect(to.startsWith("/") ? `${origin}${to}` : to);
}
