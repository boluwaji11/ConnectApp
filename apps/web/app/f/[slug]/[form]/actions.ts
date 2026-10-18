"use server";

import { withinLimit } from "@/lib/rate-limit";
import { t } from "@connectapp/i18n";

import { submitPublicForm } from "@connectapp/db";
import type { FormAnswer } from "@connectapp/db/rules";
import { explain } from "@/lib/explain";

/**
 * R4.3, R4.9. Sending an answered form in from the open web.
 *
 * `trap` is a field positioned off the screen and hidden from a screen reader.
 * A person never sees it, so a person never fills it in, and the robots that
 * walk a page filling every input it has fill it every time. Answering with a
 * thank you rather than an error means a robot cannot tell it tripped.
 */
export async function sendForm(input: {
  churchSlug: string;
  formSlug: string;
  answers: Record<string, FormAnswer>;
  trap: string;
  /** R14.2. The event this form was reached from, where it was reached from one. */
  eventSlug?: string | null;
}): Promise<{ ok: boolean; errors?: Record<string, string>; error?: string }> {
  if (input.trap.trim() !== "") return { ok: true };

  /*
   * SEC-026. The honeypot above is a field a direct caller leaves out, so it
   * stops a crawler and nothing else. This writes rows and can create a person
   * record, and it was unlimited.
   */
  const allowance = await withinLimit("form-send", 10, "10 m", input.churchSlug);
  if (allowance === "over") return { ok: false, error: t("publicForm.tooMany") };
  if (allowance === "unavailable") return { ok: false, error: t("publicForm.unavailable") };

  try {
    const result = await submitPublicForm({
      churchSlug: input.churchSlug,
      formSlug: input.formSlug,
      answers: input.answers,
      eventSlug: input.eventSlug ?? null,
    });
    return result.ok ? { ok: true } : { ok: false, errors: result.errors };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}
