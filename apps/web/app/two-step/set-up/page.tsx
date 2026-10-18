import { redirect } from "next/navigation";
import { SignOutLink } from "@/components/sign-out-link";
import { t } from "@connectapp/i18n";
import { twoStepFor } from "@connectapp/db";
import { currentUser } from "@/lib/session";
import { safePath } from "@/lib/safe-redirect";
import { AuthShell } from "../../auth-shell";
import { publicTab } from "@/lib/page-metadata";
import { Enrol } from "./enrol";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return publicTab(t("twoStep.required.title"));
}

/**
 * HRT-438, R1.8, R21.4. Two-step, required of the people whose account is
 * worth stealing.
 *
 * `requireSession` sends them here and will not return until they are
 * enrolled, so this screen cannot use it. It uses `currentUser`, which is the
 * half that matters: a verified Supabase session. The factor is written for
 * that account and nothing here depends on which church they are in.
 *
 * Somebody who is already enrolled is sent on, so this is not a screen
 * anybody can get stuck on by typing its address.
 */
export default async function RequiredTwoStep({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const params = await searchParams;
  const next = safePath(params.next ?? "") ?? undefined;

  /*
   * HRT-438. Not sent away once enrolled, deliberately.
   *
   * Finishing enrolment writes the mirror, and a server action re-renders the
   * page it was called from. Redirecting here meant the screen vanished the
   * instant the code was accepted and the recovery codes, which are shown
   * once and never again, were never shown at all. The portal had the same
   * bug and the same fix.
   *
   * The client keeps its own state across that re-render and goes on showing
   * them. Somebody who arrives already enrolled gets the finished state
   * instead, so this is not a screen anybody can be stuck on.
   */
  const state = await twoStepFor(user.id);

  return (
    <AuthShell
      title={t("twoStep.required.title")}
      under={t("twoStep.required.lede")}
      footer={
<SignOutLink label="twoStep.required.signOut" />
      }
    >
      <Enrol next={next} alreadyOn={state.enrolledAt !== null} />
    </AuthShell>
  );
}
