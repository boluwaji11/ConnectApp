"use server";

import { withinLimit } from "@/lib/rate-limit";
import { t } from "@connectapp/i18n";

import { registerForEvent, publicChurchTimezone, type Registrant } from "@connectapp/db";
import { churchNow } from "@/lib/church-now";
import { explain } from "@/lib/explain";

/**
 * R14.2, R14.6. Taking a party's places from the open web.
 *
 * `trap` is the same hidden field the public form carries: a person never sees
 * it, so a person never fills it in, and answering a robot with a thank you
 * means it cannot tell it tripped.
 */
export async function registerParty(input: {
  churchSlug: string;
  eventSlug: string;
  today: string;
  party: Registrant[];
  trap: string;
}): Promise<{
  ok: boolean;
  going?: number;
  waiting?: number;
  errors?: { at: number; fieldId: string; message: string }[];
  error?: string;
}> {
  if (input.trap.trim() !== "") return { ok: true, going: input.party.length, waiting: 0 };

  /*
   * SEC-026. The honeypot stops a crawler and not a direct caller, and this
   * writes registrations and can create person records. It also decides
   * capacity under a row lock, so a flood is a way to hold that lock.
   */
  const allowance = await withinLimit("event-register", 10, "10 m", input.churchSlug);
  if (allowance !== "ok") {
    return {
      ok: false,
      error: t(allowance === "over" ? "publicForm.tooMany" : "publicForm.unavailable"),
    };
  }

  try {
    /*
     * The church's own clock, read here rather than taken from the browser. A
     * registration that arrives after closing must be refused on the church's
     * time, and the time the page was drawn with is not something to trust.
     */
    const clock = churchNow(await publicChurchTimezone(input.churchSlug));

    const result = await registerForEvent({
      churchSlug: input.churchSlug,
      eventSlug: input.eventSlug,
      today: clock.date,
      now: clock.time,
      party: input.party,
    });
    return result.ok
      ? { ok: true, going: result.going, waiting: result.waiting }
      : { ok: false, errors: result.errors };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}
