"use server";

import { adoptTheme } from "@/lib/theme";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { syncUserAndAcceptInvitations } from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { supabaseServer } from "@/lib/supabase/server";
import { explainAuth, authField } from "@/lib/auth-errors";
import { PASSWORD_LENGTH } from "@/lib/password";
import { safePath, safeOrigin } from "@/lib/safe-redirect";

/* SEC-008. On a name we answer on. See the note in sign-in's own copy. */
async function origin() {
  return safeOrigin(await headers());
}

/** R1.8. They have an account. Sign in, and the way back in is on that screen. */
const taken = (email: string, next: string): { go: string } => ({
  go: `/sign-in?taken=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
});

/**
 * R1.7, R22.1. A form that was refused comes back as a message, not a
 * redirect.
 *
 * Sending the browser back to /sign-up with the reason in the query reloads
 * the screen, which empties every box on it: somebody who typed ten characters
 * where the password wanted more retyped their name, their surname and their
 * address as well. The message goes back to the form instead, and the form is
 * still standing.
 */
const fail = (message: string, field?: string): { error: string; field?: string } =>
  ({ error: message, field });

/**
 * R1.7, R22.1. Making an account.
 *
 * The address has to be proved before it is worth anything: an invitation is
 * matched to a verified address, and a church's first owner is granted to one.
 * So this sends a confirmation and nothing happens until they open it.
 */
export async function signUp(
  data: FormData,
): Promise<{ error?: string; field?: string; go?: string } | void> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  const firstName = String(data.get("firstName") ?? "").trim().replace(/\s+/g, " ");
  const lastName = String(data.get("lastName") ?? "").trim().replace(/\s+/g, " ");
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const next = safePath(String(data.get("next") ?? "")) ?? "/choose-church";

  if (!firstName || !lastName) return fail(t("signUp.error.name"), firstName ? "lastName" : "firstName");
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return fail(t("signUp.error.email"), "email");
  if (password.length < PASSWORD_LENGTH) return fail(t("signUp.error.password"), "password");

  const supabase = await supabaseServer();
  const { data: created, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null, first_name: firstName, last_name: lastName },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    if (/already registered|already exists|user_already_exists/i.test(error.message)) {
      return taken(email, next);
    }
    /* Where the provider was talking about one box, the message goes
       under that box rather than over the whole form. */
    return fail(explainAuth(error), authField(error) ?? undefined);
  }

  // With confirmations on, Supabase answers an address that already has an
  // account with a user carrying no identities rather than an error, so that
  // sign-up cannot be used to find out who has one. Both shapes mean the same
  // thing to the person in front of us.
  if (created.user && (created.user.identities?.length ?? 0) === 0) {
    return taken(email, next);
  }

  // A project that does not ask for confirmation hands back a session here, and
  // sending them to look in an inbox that will stay empty is how a product
  // loses somebody on its first screen.
  if (created.session) {
    await syncUserAndAcceptInvitations({
      id: created.user!.id,
      email: created.user!.email ?? email,
      fullName: fullName || null,
      emailVerified: true,
    });

    // R24.x. Their own palette, brought onto this device.
    await adoptTheme(created.user!.id);

    return { go: next };
  }

  return { go: `/sign-up?sent=${encodeURIComponent(email)}` };
}

/**
 * R1.7. The confirmation again, for the one that never arrived.
 *
 * Supabase answers an unknown address the same way as a known one, so this
 * cannot be used to find out who has an account.
 */
export async function resendSignUp(data: FormData): Promise<{ error?: string }> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const next = safePath(String(data.get("next") ?? "")) ?? "/choose-church";
  if (!email) return { error: t("signIn.error.noEmail") };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: explainAuth(error) };
  return {};
}

/** R1.8. A link to set a password, for somebody who has forgotten or never had one. */
export async function sendReset(data: FormData) {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  /*
   * R1.8. Back to the screen they pressed it on.
   *
   * An empty box previously sent the reader to sign up, which is the wrong
   * destination for somebody who already has an account, and read as the press
   * having failed.
   */
  if (!email) {
    redirect(`/forgot?error=${encodeURIComponent(t("signIn.error.noEmail"))}`);
  }

  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?next=/reset`,
  });

  // The same answer whether or not the address has an account, so this cannot
  // be used to find out who has one.
  redirect(`/sign-in?sent=${encodeURIComponent(email)}`);
}

/** R1.8. Choosing the password, once the link has proved the address. */
export async function setPassword(data: FormData): Promise<{ error?: string }> {
  const password = String(data.get("password") ?? "");
  if (password.length < 10) return { error: t("signUp.error.password") };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: explainAuth(error) };
  redirect("/sign-in?set=1");
}
