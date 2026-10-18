import "server-only";
import { cache } from "react";
import { twoStepFor, markTwoStepOn, issueRecoveryCodes } from "@connectapp/db";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * HRT-439, R1.8, R21.4. The portal's second factor.
 *
 * Required, with no grace period, and that is a different decision from the
 * one the church product makes. There are nine operators rather than nine
 * hundred churches, there is no sign-up to protect, and this is the one
 * account in the product that reaches every church's records. An operator who
 * has not set it up gets one screen and nothing else.
 *
 * The factor is the same factor. It lives on the account rather than on an
 * app, so an operator who set two-step up on their church's side is already
 * enrolled and only has to present it here.
 */

/** What this session has presented, read from the token it already verified. */
export const assurance = cache(async (): Promise<string> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claim = data?.claims?.["aal"];
  return typeof claim === "string" ? claim : "aal1";
});

export interface Standing {
  /** They have set it up, somewhere. */
  enrolled: boolean;
  /** This session has presented it. */
  presented: boolean;
  codesLeft: number;
}

export const standing = cache(async (userId: string): Promise<Standing> => {
  const [state, level] = await Promise.all([twoStepFor(userId), assurance()]);
  return {
    enrolled: state.enrolledAt !== null,
    presented: level === "aal2",
    codesLeft: state.codesLeft,
  };
});

/** The factors Supabase holds, for the screens that act on one. */
async function factors(): Promise<{ id: string; verified: boolean }[] | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return null;

  /* `data.all`, not the per-kind arrays, which hold only the verified ones. */
  return ((data.all ?? []) as unknown as { id: string; status: string }[])
    .map((one) => ({ id: one.id, verified: one.status === "verified" }));
}

/** The verified factor a challenge is made against, or nothing. */
export async function presentableFactor(): Promise<string | null> {
  return (await factors())?.find((one) => one.verified)?.id ?? null;
}

export interface Enrolment {
  factorId: string;
  qr: string;
  secret: string;
}

/** Starts enrolment, clearing whatever an abandoned attempt left behind. */
export async function beginEnrolment(): Promise<Enrolment | { error: string }> {
  const supabase = await supabaseServer();

  for (const one of (await factors()) ?? []) {
    if (!one.verified) await supabase.auth.mfa.unenroll({ factorId: one.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `portal-${Date.now()}`,
  });

  if (error || !data) return { error: "Setting this up failed. Try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** The first code out of their app, which finishes it and issues the codes. */
export async function finishEnrolment(
  userId: string,
  factorId: string,
  code: string,
): Promise<{ codes: string[] } | { error: string }> {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ""),
  });
  if (error) return { error: "That code isn't right. Check your app and try again." };

  await markTwoStepOn(userId);
  return { codes: await issueRecoveryCodes(userId) };
}

/** A code presented at the door, which raises this session to aal2. */
export async function presentCode(code: string): Promise<{ error?: string }> {
  const factorId = await presentableFactor();
  if (!factorId) return { error: "There is nothing to verify. Sign in again." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ""),
  });
  return error ? { error: "That code isn't right. Check your app and try again." } : {};
}
