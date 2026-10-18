"use server";

import { redirect } from "next/navigation";
import { teamMemberBeforeTwoStep } from "@/lib/admin";
import { beginEnrolment, finishEnrolment, presentCode } from "@/lib/two-step";

export interface Done {
  error?: string;
}

/** HRT-439. Starting enrolment, for an operator who has not set it up. */
export async function startTwoStep(): Promise<
  { factorId: string; qr: string; secret: string } | Done
> {
  await teamMemberBeforeTwoStep();
  return beginEnrolment();
}

/** The first code out of their app, which finishes it and issues the codes. */
export async function confirmTwoStep(
  factorId: string,
  code: string,
): Promise<{ codes: string[] } | Done> {
  const who = await teamMemberBeforeTwoStep();
  return finishEnrolment(who.id, factorId, code);
}

/** A code at the door, which raises this session and lets them in. */
export async function submitCode(data: FormData): Promise<Done> {
  await teamMemberBeforeTwoStep();
  const result = await presentCode(String(data.get("code") ?? ""));
  if (result.error) return result;
  redirect("/");
}
