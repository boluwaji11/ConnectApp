import { Banner } from "@connectapp/ui";
import type { demoChurchInfo } from "@connectapp/db";
import { t } from "@connectapp/i18n";

/**
 * R19.7. Says, on every page of a demo, that it is one.
 *
 * In the header rather than on one screen, because somebody who lands three
 * pages deep should never have to wonder whether these members are real. The
 * whole reason the demo is a separate church is that nobody can mistake it for
 * their own, and saying so is the cheap half of that.
 *
 * HRT-459. It says that and nothing else. It used to carry a button to
 * create a church, which turned the one screen whose job is to show the
 * product into a screen asking for a sign-up, on every page of it. Somebody
 * who wants an account goes and gets one; the demo does not have to sell.
 */
export async function DemoBanner({
  info,
}: {
  info: Awaited<ReturnType<typeof demoChurchInfo>>;
}) {
  if (!info.isDemo || !info.expiresAt) return null;

  return (
    <Banner tone="warning" title={t("demo.banner.title")} className="rounded-none border-x-0 border-t-0">
      {t("demo.banner.body")}
    </Banner>
  );
}
