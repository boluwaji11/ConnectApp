"use server";

import { redirect } from "next/navigation";
import { t, type MessageKey } from "@connectapp/i18n";
import { currentUser } from "@/lib/session";
import { beginEnrolment, finishEnrolment } from "@/lib/two-step";

/**
 * HRT-438. Enrolment for somebody the requirement applies to.
 *
 * Deliberately not behind `requireSession`. That is the thing which sent them
 * here, and it refuses to return until they are enrolled, so a screen built
 * on it could never be the screen that enrols them.
 *
 * `currentUser` is the half that matters: a Supabase session that has been
 * verified. A factor is only ever written for the account that session
 * belongs to, so nothing here depends on which church they are in.
 */
export interface Done {
  error?: string;
}

async function signedIn() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function startTwoStep(): Promise<
  { factorId: string; qr: string; secret: string } | Done
> {
  await signedIn();
  const started = await beginEnrolment();
  return "qr" in started ? started : { error: t(started.error as MessageKey) };
}

export async function confirmTwoStep(
  factorId: string,
  code: string,
): Promise<{ codes: string[] } | Done> {
  const user = await signedIn();
  const done = await finishEnrolment(user.id, factorId, code);
  return "codes" in done ? done : { error: t(done.error as MessageKey) };
}
