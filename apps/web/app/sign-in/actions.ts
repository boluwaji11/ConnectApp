"use server";

import { adoptTheme } from "@/lib/theme";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { syncUserAndAcceptInvitations } from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { supabaseServer } from "@/lib/supabase/server";
import { explainAuth } from "@/lib/auth-errors";
import { landingFor } from "@/lib/landing";
import { safePath, safeOrigin } from "@/lib/safe-redirect";

/** Returns never, so callers use `return fail(...)` and control flow narrows. */
const fail = (message: string, next?: string): never =>
  redirect(`/sign-in?error=${encodeURIComponent(message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);

/*
 * SEC-008. The landing address of an authentication email, on a name we
 * answer on.
 *
 * Built from the request so a church on its own domain is emailed a link back
 * to its own domain. The clamp is what keeps that from being a link to
 * wherever a host that reaches this deployment happens to point: this is an
 * unauthenticated action that takes any address, so the person who receives
 * the email is not the person who asked for it.
 */
async function origin() {
  return safeOrigin(await headers());
}

export async function sendMagicLink(data: FormData) {
  const email = String(data.get("email") ?? "").trim();
  const next = safePath(String(data.get("next") ?? "")) ?? undefined;
  if (!email) return fail(t("signIn.error.noEmail"), next);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await origin()}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    },
  });

  if (error) return fail(explainAuth(error), next);
  redirect(`/sign-in?sent=${encodeURIComponent(email)}`);
}

export async function signInWithPassword(data: FormData) {
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  /* SEC-008. A path inside the product, or the screen their role arrives at.
     This runs straight after a password is accepted, which is where an
     off-site landing does the most work for whoever sent the link. */
  const next = safePath(String(data.get("next") ?? "")) ?? undefined;

  const supabase = await supabaseServer();
  const { data: result, error } = await supabase.auth.signInWithPassword({ email, password });

  // One message for a wrong password and for an address with no account, so the
  // form cannot be used to find out who has an account.
  if (error || !result.user) return fail(t("signIn.error.noMatch"), next);

  await syncUserAndAcceptInvitations({
    id: result.user.id,
    email: result.user.email ?? email,
    fullName: (result.user.user_metadata?.["full_name"] as string | undefined) ?? null,
    emailVerified: Boolean(result.user.email_confirmed_at),
  });

  // R24.x. Their own palette, brought onto this device.
  await adoptTheme(result.user.id);

  // R5.5. A pastoral account lands on its queue. It is the one role whose job
  // is the follow-ups rather than the records, and the directory is a click
  // away from it.
  redirect(next || (await landingFor(result.user.id)));
}
