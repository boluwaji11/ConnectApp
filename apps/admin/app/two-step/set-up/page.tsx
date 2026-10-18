import { redirect } from "next/navigation";
import { teamMemberBeforeTwoStep } from "@/lib/admin";
import { standing } from "@/lib/two-step";
import { Door } from "../door";
import { Enrol } from "./enrol";
import { Leave } from "../leave";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set up verification - ConnectApp Admin" };

/**
 * HRT-439, R1.8, R21.4. The portal's second factor, which is not optional.
 *
 * No grace period, deliberately. This is the one account in the product that
 * reaches every church's records, there are nine of them rather than nine
 * hundred churches, and there is no sign-up funnel to lose anybody from. An
 * operator who has not set it up reaches this screen and nothing else.
 */
export default async function SetUpPage() {
  const who = await teamMemberBeforeTwoStep();
  const two = await standing(who.id);

  /*
   * HRT-439. Enrolled and not yet presented is the code screen's job.
   *
   * Enrolled *and* presented is not sent anywhere, deliberately. Finishing
   * enrolment raises this session to aal2, and a server action re-renders the
   * page it was called from: redirecting here meant the screen vanished the
   * instant the code was accepted and the recovery codes, which are shown
   * once and never again, were never shown at all. The client keeps its own
   * state across that re-render and goes on showing them; a fresh visit gets
   * the finished state below instead.
   */
  if (two.enrolled && !two.presented) redirect("/two-step");

  return (
    <Door
      title="Set up two-step verification"
      lede="The portal reaches every church on the platform, so a password on its own is not enough. This takes a minute and you only do it once."
      foot={<>Signed in as {who.email}. <Leave /></>}
    >
      <Enrol alreadyOn={two.enrolled} codesLeft={two.codesLeft} />
    </Door>
  );
}
