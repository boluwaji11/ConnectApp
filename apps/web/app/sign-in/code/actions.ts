"use server";

import { redirect } from "next/navigation";
import { t, type MessageKey } from "@connectapp/i18n";
import { currentUser } from "@/lib/session";
import { presentCode, redeemRecoveryCode } from "@/lib/two-step";
import { landingFor } from "@/lib/landing";
import { safePath } from "@/lib/safe-redirect";

export interface CodeResult {
  error?: string;
}

/**
 * R1.8. The six-digit code, which is what finishes signing in.
 *
 * Supabase decides whether it is right and raises this session to aal2 when it
 * is. Nothing here decides anything about the code, and the factor it is
 * checked against is read from Supabase rather than taken from the form.
 */
export async function submitCode(data: FormData): Promise<CodeResult> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const result = await presentCode(String(data.get("code") ?? ""));
  if (result.error) return { error: t(result.error as MessageKey) };

  /* SEC-008. A path inside the product, or the screen their role arrives at. */
  const next = safePath(String(data.get("next") ?? ""));
  redirect(next || (await landingFor(user.id)));
}

/**
 * R1.8. A recovery code, because the phone is gone.
 *
 * Spending one turns two-step off rather than letting this session through on
 * its own: Supabase raises the assurance level only for the factor itself, and
 * the factor is on the phone that is gone. Letting somebody past once would
 * leave them meeting the same wall on their next sign-in with one fewer code.
 */
export async function submitRecovery(data: FormData): Promise<CodeResult> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const result = await redeemRecoveryCode(user.id, String(data.get("code") ?? ""));
  if (result.error) return { error: t(result.error as MessageKey) };

  const next = safePath(String(data.get("next") ?? ""));
  redirect(`${next || (await landingFor(user.id))}?recovered=1`);
}
