"use server";

import { headers } from "next/headers";
import { t } from "@connectapp/i18n";
import { requireSession } from "@/lib/session";
import { safeOrigin } from "@/lib/safe-redirect";
import { supabaseServer } from "@/lib/supabase/server";
import { explainAuth } from "@/lib/auth-errors";

export interface PasswordResult {
  error?: string;
}

const PASSWORD_LENGTH = 10;

const field = (data: FormData, name: string) => String(data.get(name) ?? "");

/**
 * R1.8. Proving it is really them, before an authentication change.
 *
 * Supabase will change an email address or a password on the strength of an
 * open session alone. An open session is a laptop somebody walked away from,
 * so both changes ask for the password first.
 */
async function withPassword(email: string, password: string): Promise<boolean> {
  if (!password) return false;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

/** R1.8. Changing a password. */
export async function changePassword(data: FormData): Promise<PasswordResult> {
  const session = await requireSession();
  const current = field(data, "current");
  const next = field(data, "next");
  const again = field(data, "confirm");

  if (next.length < PASSWORD_LENGTH) return { error: t("signUp.error.password") };
  if (next !== again) return { error: t("password.error.match") };
  if (!(await withPassword(session.email, current))) return { error: t("password.error.wrong") };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: next });
  return error ? { error: explainAuth(error) } : {};
}

/**
 * R1.8. Changing the address somebody signs in with.
 *
 * Supabase sends a confirmation to the new address, and the change lands only
 * when it is answered. Nothing in our own tables moves here: app_users follows
 * on the next sign-in, and the person's record follows that.
 */
export async function changeEmail(data: FormData): Promise<PasswordResult> {
  const session = await requireSession();
  const next = field(data, "email").trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(next)) return { error: t("email.error.format") };
  if (next === session.email.toLowerCase()) return { error: t("email.error.same") };
  if (!(await withPassword(session.email, field(data, "password")))) {
    return { error: t("email.error.password") };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ email: next });
  return error ? { error: explainAuth(error) } : {};
}

/** R1.8. For somebody who has only ever signed in by email link. */
export async function emailMeALink(): Promise<PasswordResult> {
  const session = await requireSession();
  /* SEC-008. On a name we answer on, rather than on whatever host reached us. */
  const site = await safeOrigin(await headers());

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(session.email, {
    redirectTo: `${site}/reset`,
  });
  return error ? { error: explainAuth(error) } : {};
}
