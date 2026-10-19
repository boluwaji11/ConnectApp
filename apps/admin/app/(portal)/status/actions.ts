"use server";

import { revalidatePath } from "next/cache";
import { platformHealth } from "@connectapp/db";
import { environment } from "@connectapp/env";
import { requireTeamMember } from "@/lib/admin";
import { probeEverything } from "@/lib/probes";

/**
 * HRT-463, N3. Asks every service now, and writes down what they said.
 *
 * This used to happen inside the status screen's own render, which is what
 * made that screen unopenable in production: the render already had five reads
 * and eight writes to get through on a pool of four, and the probes sat on top
 * of it inside the function's thirty seconds. A press is the right place for
 * work somebody asked for, because a press can say it is working and a render
 * cannot.
 *
 * The readings are written one after another rather than together. Eight
 * concurrent writes on the owner pool is the shape that wedged the screen, and
 * nothing here is in a hurry: the person pressing is watching a button spin.
 */
export async function checkNow(): Promise<{ checked: number } | { error: string }> {
  await requireTeamMember();
  const env = environment();

  try {
    const probes = await probeEverything();
    for (const one of probes) {
      await platformHealth.recordCheck(
        { service: one.service, state: one.state, tookMs: one.tookMs, said: one.said },
        env,
      );
    }
    revalidatePath("/status");
    return { checked: probes.length };
  } catch (trouble) {
    return { error: trouble instanceof Error ? trouble.message : "Asking failed." };
  }
}
