import { requireSession } from "@/lib/session";
import { SettingsHeading } from "../heading";
import { Security } from "./security";
import { TwoStep } from "./two-step";
import { twoStepFor } from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { tabMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

/** R17.1. What the browser tab says. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  return tabMetadata(t("settings.tab.security"));
}

/** R1.8. How somebody gets in, and the two ways to change it. */
export default async function SecurityPage() {
  const session = await requireSession();
  /* R1.8. The mirror, not Supabase: this screen draws the state, it does not
     act on a factor until somebody presses something. */
  const twoStep = await twoStepFor(session.userId);

  return (
    <>
      <SettingsHeading title="settings.tab.security" lede="settings.lede.security" />
      <div className="flex flex-col gap-4">
        <Security email={session.email} />
        <TwoStep
          enrolled={twoStep.enrolledAt !== null}
          codesLeft={twoStep.codesLeft}
        />
      </div>
    </>
  );
}
