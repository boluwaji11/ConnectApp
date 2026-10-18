import "server-only";
import { cache } from "react";
import {
  twoStepFor, markTwoStepOn, markTwoStepOff, issueRecoveryCodes, spendRecoveryCode,
} from "@connectapp/db";
import { supabaseServer } from "./supabase/server";

/**
 * R1.8, R21.4. Two-step verification.
 *
 * The factor is Supabase's: it holds the secret, draws the QR code and decides
 * whether a six-digit code is right. This file is the product's side of it,
 * and the reason it exists rather than the actions calling Supabase directly
 * is that three of these flows have to keep our mirror and Supabase in step,
 * and one of them has to undo a factor on a path where the person cannot
 * present it.
 *
 * Supabase expresses the state as an assurance level on the access token:
 * `aal1` is a password or an email link, `aal2` is a second factor presented.
 * The token is already verified in `currentUser`, so reading the level there
 * costs nothing.
 */

/** A factor Supabase holds for this person. */
export interface Factor {
  id: string;
  /** An authenticator app, or a passkey held by the device. */
  kind: "totp" | "webauthn";
  /** Only a verified factor is ever challenged. An abandoned enrolment is not. */
  verified: boolean;
}

/**
 * The factors Supabase holds, which is a round trip.
 *
 * Asked only by the screens that act on a factor, never by a navigation. What
 * a navigation needs is the mirror in `app_users`, read beside the
 * memberships.
 *
 * `held` is null when Supabase could not be asked, which is a different answer
 * from an empty list and has to stay different. Reading "no factors" out of a
 * failed call and acting on it is how a second factor turns itself off: this
 * went in with the list collapsed to `[]` on error, and a screen that cleared
 * the mirror on an empty list disabled two-step for a real account on a
 * request that had simply timed out.
 */
export const factors = cache(async (): Promise<{ held: Factor[] | null }> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { held: null };
  /*
   * `data.all`, not `data.totp`.
   *
   * The per-kind arrays hold only the verified factors; `all` holds every
   * factor including an enrolment that was started and never finished. Reading
   * the per-kind arrays meant the cleanup below never saw an abandoned
   * attempt, so they accumulated: an account that had opened the setup box a
   * few times and walked away was carrying four of them, and Supabase refuses
   * enrolment once a user reaches its limit. Nothing said so, because nothing
   * could see them.
   */
  const everything = (data.all ?? []) as unknown as {
    id: string;
    status: string;
    factor_type: string;
  }[];

  return {
    held: everything
      .filter((one) => one.factor_type === "totp" || one.factor_type === "webauthn")
      .map((one) => ({
        id: one.id,
        kind: one.factor_type === "webauthn" ? ("webauthn" as const) : ("totp" as const),
        verified: one.status === "verified",
      })),
  };
});

/** The verified factors, by kind, for a screen deciding what to offer. */
export async function presentable(): Promise<
  { known: true; totp: string | null; passkey: string | null } | { known: false }
> {
  const { held } = await factors();
  if (held === null) return { known: false };
  return {
    known: true,
    totp: held.find((o) => o.verified && o.kind === "totp")?.id ?? null,
    passkey: held.find((o) => o.verified && o.kind === "webauthn")?.id ?? null,
  };
}

/**
 * The one factor a challenge is made against.
 *
 * `"unknown"` where Supabase could not be asked. Every caller treats that as
 * "try again", never as "there is nothing here".
 */
export async function presentableFactor(): Promise<string | null | "unknown"> {
  const { held } = await factors();
  if (held === null) return "unknown";
  return held.find((one) => one.verified)?.id ?? null;
}

export interface Enrolment {
  factorId: string;
  /** Supabase's own QR, as an SVG data URI. Nothing is drawn here. */
  qr: string;
  /** The same secret in the form somebody types in by hand. */
  secret: string;
}

/**
 * Starts enrolment and hands back what the screen draws.
 *
 * Supabase refuses a second unverified factor with the same name, and an
 * abandoned attempt leaves one behind: somebody who opens this screen, closes
 * the tab and comes back would meet an error rather than a QR code. So every
 * unverified factor is cleared first. A verified one is never touched, which
 * is what keeps this from being a way to drop somebody's real factor.
 */
export async function beginEnrolment(): Promise<Enrolment | { error: string }> {
  const supabase = await supabaseServer();

  for (const one of (await factors()).held ?? []) {
    if (!one.verified) await supabase.auth.mfa.unenroll({ factorId: one.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `authenticator-${Date.now()}`,
  });

  if (error || !data) return { error: "twoStep.error.start" };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * The first code out of their app, which is what finishes enrolment.
 *
 * Supabase verifies it and raises this session to aal2 in the same call. The
 * mirror is written only once Supabase has agreed, so a refused code leaves
 * nothing behind, and the recovery codes are issued in the same breath because
 * enrolment without recovery is how somebody loses their church.
 */
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
  if (error) return { error: "twoStep.error.code" };

  await markTwoStepOn(userId);
  return { codes: await issueRecoveryCodes(userId) };
}

/**
 * A code presented at sign-in, which raises this session to aal2.
 *
 * The factor is read from Supabase rather than taken from the form, so nothing
 * the browser sends decides which factor is being answered.
 */
export async function presentCode(code: string): Promise<{ error?: string }> {
  const factorId = await presentableFactor();
  if (factorId === "unknown") return { error: "twoStep.error.again" };
  if (!factorId) return { error: "twoStep.error.gone" };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ""),
  });
  return error ? { error: "twoStep.error.code" } : {};
}

/**
 * A recovery code, used because the phone is gone.
 *
 * Spending one cannot raise this session to aal2: Supabase only does that for
 * the factor itself, and the factor is on the phone that is gone. So a spent
 * code takes two-step off outright rather than letting somebody through once
 * and leaving them to meet the same wall on their next sign-in.
 *
 * That is the honest behaviour and it is also the safe one: the person is told
 * two-step is now off and asked to set it up again, instead of holding a
 * session that claims a factor it cannot present.
 */
export async function redeemRecoveryCode(
  userId: string,
  code: string,
): Promise<{ error?: string }> {
  if (!(await spendRecoveryCode(userId, code))) return { error: "twoStep.error.recovery" };

  /*
   * The code is spent before the factor is taken off, so a refused one cannot
   * be tried again at leisure. If the factor will not come off, say so rather
   * than letting them through: the code is gone but the others still work, and
   * two-step is still genuinely on.
   */
  return turnOffEverything(userId);
}

/**
 * Takes every factor off, in Supabase and in the mirror, or neither.
 *
 * This wrote the mirror whatever happened. `held ?? []` is an empty loop when
 * the factor list could not be read, so a failed call turned two-step off in
 * our column and left it on in Supabase: the screen said Off, the account
 * still held a verified factor, and the next enrolment added a second one
 * beside it. It is the same mistake as reading an unreadable list as an empty
 * one, on the writing side.
 *
 * So the mirror is cleared only once Supabase has agreed. Leaving it on when
 * the factor is really gone is the safe direction of the two: the person meets
 * a code screen, and the recovery codes they were given are the way through.
 */
export async function turnOffEverything(userId: string): Promise<{ error?: string }> {
  const supabase = await supabaseServer();

  const { held } = await factors();
  if (held === null) return { error: "twoStep.error.again" };

  for (const one of held) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: one.id });
    if (error) return { error: "twoStep.error.again" };
  }

  await markTwoStepOff(userId);
  return {};
}

/**
 * Whether this person still has to present a code.
 *
 * The mirror says they enrolled; the token says what this session has
 * presented. A mirror can drift, so the caller that acts on `true` reads the
 * factors themselves before it refuses anybody.
 */
export async function owesACode(userId: string, assurance: string | null): Promise<boolean> {
  if (assurance === "aal2") return false;
  return (await twoStepFor(userId)).enrolledAt !== null;
}
