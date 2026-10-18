import { requireSession } from "@/lib/session";
import { twoStepFor } from "@connectapp/db";
import { SecurityOverview } from "./overview";
import { SecurityCards } from "./cards";
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
    /*
     * R24.6. The reading on the left, the controls on the right.
     *
     * Three cards that are all shut by default answer nothing on arrival, and
     * "is my account actually protected" was three presses away. The rail
     * answers it without opening anything, and goes above the cards on a
     * phone, where there is one column and the answer should still come
     * first.
     */
    <div className="flex flex-col gap-6">
      {/* The name of the screen spans both columns, so the overview card and
          the three cards beside it start on the same line. */}
      <div>
        <h2 className="font-display text-[28px] leading-[34px] text-fg">
          {t("security.title")}
        </h2>
        <p className="mt-1 text-fg-muted">{t("settings.lede.security")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] lg:gap-0 lg:divide-x lg:divide-line">
      <div className="lg:pr-6">
      <SecurityOverview
        email={session.email}
        twoStepOn={twoStep.enrolledAt !== null}
        codesLeft={twoStep.codesLeft}
      />
      </div>

      <div className="lg:pl-6">
        <SecurityCards
          email={session.email}
          enrolled={twoStep.enrolledAt !== null}
          codesLeft={twoStep.codesLeft}
        />
      </div>
      </div>
    </div>
  );
}
