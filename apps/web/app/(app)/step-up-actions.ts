"use server";

import { t, type MessageKey } from "@connectapp/i18n";
import { currentUser } from "@/lib/session";
import { presentCode } from "@/lib/two-step";

export interface StepUpResult {
  error?: string;
}

/**
 * R1.8, R21.4. The code again, in front of something that cannot be undone.
 *
 * The same challenge the sign-in screen makes, for the same factor, read from
 * Supabase rather than taken from the form. What it changes is the `amr`
 * timestamp on the token, which is what `freshFactor` reads, so the action
 * behind the dialog can simply be tried again.
 *
 * No recovery code here. A recovery code turns two-step off, which is right
 * when somebody has lost their phone and is signing in, and wrong as a way
 * past a question asked in front of a refund. Somebody who has genuinely lost
 * their phone signs out and comes back in, which is the path that was built
 * for it.
 */
export async function proveItIsStillYou(data: FormData): Promise<StepUpResult> {
  const user = await currentUser();
  if (!user) return { error: t("twoStep.error.again") };

  const result = await presentCode(String(data.get("code") ?? ""));
  return result.error ? { error: t(result.error as MessageKey) } : {};
}
