import Link from "next/link";
import { redirect } from "next/navigation";
import { teamMemberBeforeTwoStep } from "@/lib/admin";
import { standing } from "@/lib/two-step";
import { Door } from "./door";
import { CodeForm } from "./form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Enter your code - ConnectApp Admin" };

/**
 * HRT-439, R1.8, R21.4. The second step of signing in to the portal.
 *
 * Required with no grace period: this is the one account that reaches every
 * church's records. Somebody who has not set it up is sent to do so, and
 * nothing else in the portal renders until this is answered.
 */
export default async function TwoStepPage() {
  const who = await teamMemberBeforeTwoStep();
  const two = await standing(who.id);

  if (!two.enrolled) redirect("/two-step/set-up");
  if (two.presented) redirect("/");

  return (
    <Door
      title="Enter your code"
      lede="Open your authenticator app and type the six-digit code it shows."
      foot={
        <>
          Lost your phone? Ask another operator to clear it from the security
          screen.{" "}
          <Link href="/sign-in" className="font-medium text-primary">
            Sign in as someone else
          </Link>
        </>
      }
    >
      <CodeForm />
    </Door>
  );
}
