"use server";

import { headers } from "next/headers";
import { t, type MessageKey } from "@connectapp/i18n";
import { requireSession } from "@/lib/session";
import { safeOrigin } from "@/lib/safe-redirect";
import { supabaseServer } from "@/lib/supabase/server";
import { explainAuth } from "@/lib/auth-errors";
import {
  beginEnrolment, finishEnrolment, turnOffEverything, presentableFactor,
} from "@/lib/two-step";
import { issueRecoveryCodes, markTwoStepOn } from "@connectapp/db";

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

/**
 * R1.8, R21.4. Starting two-step verification.
 *
 * Supabase holds the secret and draws the QR code. The secret reaches the
 * screen that shows it and goes no further: it is not written down, not
 * logged, and not carried in the session. An abandoned attempt leaves an
 * unverified factor behind, which `beginEnrolment` clears on the way in.
 */
export async function startTwoStep(): Promise<
  { factorId: string; qr: string; secret: string } | { error: string }
> {
  await requireSession();
  const started = await beginEnrolment();
  return "error" in started ? { error: t(started.error as MessageKey) } : started;
}

/**
 * R1.8. The first code out of their app, which finishes it.
 *
 * The recovery codes come back with it and are shown once. They are issued
 * here rather than on a later screen so that there is no state in which
 * two-step is on and the person has no way back in.
 */
export async function confirmTwoStep(
  factorId: string,
  code: string,
): Promise<{ codes: string[] } | { error: string }> {
  const session = await requireSession();
  const done = await finishEnrolment(session.userId, factorId, code);
  return "error" in done ? { error: t(done.error as MessageKey) } : done;
}

/**
 * R1.8. Turning it off, which asks for the password first.
 *
 * Same reasoning as the two changes above: an open session is a laptop
 * somebody walked away from, and taking the second factor off is the change
 * that makes every other one easier.
 */
export async function stopTwoStep(data: FormData): Promise<PasswordResult> {
  const session = await requireSession();
  if (!(await withPassword(session.email, field(data, "password")))) {
    return { error: t("twoStep.error.password") };
  }

  await turnOffEverything(session.userId);
  return {};
}

/**
 * R1.8. A fresh set of recovery codes, replacing whatever is left.
 *
 * Asked for by somebody who has used some of theirs, or who has lost the
 * piece of paper. The old set stops working the moment this answers.
 */
export async function newRecoveryCodes(data: FormData): Promise<
  { codes: string[] } | { error: string }
> {
  const session = await requireSession();
  if (!(await withPassword(session.email, field(data, "password")))) {
    return { error: t("twoStep.error.password") };
  }

  return { codes: await issueRecoveryCodes(session.userId) };
}

/**
 * R1.8. A passkey has just been registered in the browser, so finish up.
 *
 * The ceremony itself cannot happen here: the private key never leaves the
 * device and `navigator.credentials` is a browser API. What the server still
 * owns is the mirror and the recovery codes, and both are written only after
 * Supabase says a verified factor exists, which is read from Supabase rather
 * than taken from the browser's word for it.
 */
export async function completePasskey(): Promise<
  { codes: string[] } | { error: string }
> {
  const session = await requireSession();

  const held = await presentableFactor();
  if (held === "unknown") return { error: t("twoStep.error.again") };
  if (!held) return { error: t("twoStep.error.code") };

  await markTwoStepOn(session.userId);
  return { codes: await issueRecoveryCodes(session.userId) };
}
