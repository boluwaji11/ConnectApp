import { requireSession } from "@/lib/session";
import { SettingsHeading } from "../heading";
import { Security } from "./security";
import { TwoStep } from "./two-step";
import { twoStepFor } from "@connectapp/db";
import { relyingParty } from "@/lib/passkey";
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
  /* R1.8, R21.1. Null on a church's own domain, where a key bound to our name
     would not work. The decision is made on the server for the reason
     lib/passkey.ts gives. */
  const passkey = await relyingParty();

  return (
    <>
      <SettingsHeading title="settings.tab.security" lede="settings.lede.security" />
      <div className="flex flex-col gap-4">
        <Security email={session.email} />
        <TwoStep
          enrolled={twoStep.enrolledAt !== null}
          codesLeft={twoStep.codesLeft}
          passkey={passkey}
        />
      </div>
    </>
  );
}
