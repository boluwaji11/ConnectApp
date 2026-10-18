"use server";

import { redirect } from "next/navigation";
import { createDemoChurch } from "@connectapp/db";
import { issueDemoPass, newDemoUserId } from "@/lib/demo-pass";

/**
 * R19.7 and R22.1. A church to look around.
 *
 * A demo that starts with a sign-up form is a demo for the members who were
 * going to sign up anyway.
 *
 * The visitor gets a throwaway church of their own, filled with invented members
 * and thrown away tomorrow, and a signed cookie naming it. Nothing they press
 * can reach a real church: the cookie is signed, and the session layer refuses
 * any church without a demo expiry in the future.
 *
 * It is a copy of a template rather than a church built on the spot, which is
 * what makes this about half a second rather than thirty-eight.
 */
export async function startDemo() {
  const userId = newDemoUserId();
  const demo = await createDemoChurch(userId);
  await issueDemoPass(demo.tenantId, userId, demo.expiresAt);
  redirect("/dashboard");
}
