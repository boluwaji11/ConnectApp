import { redirect } from "next/navigation";
import { SignOutLink } from "@/components/sign-out-link";
import { t } from "@connectapp/i18n";
import { twoStepFor } from "@connectapp/db";
import { currentUser } from "@/lib/session";
import { safePath } from "@/lib/safe-redirect";
import { landingFor } from "@/lib/landing";
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
  /*
   * HRT-452. Where "Finish" goes when nothing said where to go.
   *
   * The address carries `next` when a gate sent somebody here from a screen
   * they were trying to reach, and carries nothing when setting up a church
   * walked them through it. That second case fell back to `/`, which on our
   * own name is the marketing page: a church owner finished securing their
   * account and was shown the front door of the product they had just signed
   * up for.
   *
   * `landingFor` is the same answer signing in gives, which includes sending
   * them to their own church's address rather than ours.
   */
  const next = safePath(params.next ?? "") ?? (await landingFor(user.id));

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
<SignOutLink>{t("twoStep.required.signOut")}</SignOutLink>
      }
    >
      <Enrol next={next} alreadyOn={state.enrolledAt !== null} />
    </AuthShell>
  );
}
