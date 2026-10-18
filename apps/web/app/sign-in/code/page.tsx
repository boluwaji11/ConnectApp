import Link from "next/link";
import { redirect } from "next/navigation";
import { t } from "@connectapp/i18n";
import { currentUser } from "@/lib/session";
import { presentableFactor } from "@/lib/two-step";
import { twoStepFor } from "@connectapp/db";
import { landingFor } from "@/lib/landing";
import { safePath } from "@/lib/safe-redirect";
import { AuthShell } from "../../auth-shell";
import { CodeForm } from "./form";
import { publicTab } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return publicTab(t("twoStep.signInTitle"));
}

/**
 * R1.8. The second step of signing in.
 *
 * Reached from `requireSession`, which sends anybody whose mirror says they
 * enrolled and whose token says this session has only presented a password.
 *
 * The mirror is checked against Supabase here, and only here. If Supabase
 * holds no factor to present, the mirror is wrong and the person is let
 * through rather than held at a door with no key: a mirror that drifts must
 * not be able to lock somebody out of their own church.
 */
export default async function TwoStepCode({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const next = safePath(params.next ?? "") ?? undefined;

  // Already finished. Nothing to ask for.
  if (user.assurance === "aal2") redirect(next || (await landingFor(user.id)));

  const state = await twoStepFor(user.id);
  if (!state.enrolledAt) redirect(next || (await landingFor(user.id)));

  /*
   * R1.8. A factor Supabase cannot be asked about is not a factor that is
   * gone.
   *
   * This cleared the mirror and let the person through whenever the factor
   * list came back empty, which reads as repairing drift and is really a
   * second factor that turns itself off on a timed-out request. A browser run
   * caught it doing exactly that: `/members` was held here, the next
   * navigation was let straight into the dashboard, and the column had been
   * set back to null.
   *
   * So nothing is cleared on a read. Somebody whose factor really is gone has
   * the recovery codes they were given at enrolment, and that path turns
   * two-step off against a secret rather than against a failed request.
   */
  const factor = await presentableFactor();

  return (
    <AuthShell
      title={t("twoStep.signInTitle")}
      under={t("twoStep.signInLede")}
      footer={
        <Link href="/auth/sign-out" className="font-medium text-primary">
          {t("twoStep.signOut")}
        </Link>
      }
    >
      <CodeForm next={next} gone={factor === null} />
    </AuthShell>
  );
}
