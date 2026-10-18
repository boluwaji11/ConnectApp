import { Banner, Button } from "@connectapp/ui";
import type { demoChurchInfo } from "@connectapp/db";
import { t } from "@connectapp/i18n";

/** Where the product itself answers, which is not where the demo does. */
const PLATFORM_HOST = process.env["PLATFORM_HOST"] || "connectapp.church";

/**
 * R19.7. Says, on every page of a demo, that it is one.
 *
 * In the header rather than on one screen, because somebody who lands three
 * pages deep should never have to wonder whether these members are real. The
 * whole reason the demo is a separate church is that nobody can mistake it for
 * their own, and saying so is the cheap half of that.
 */
export function DemoBanner({
  info,
}: {
  info: Awaited<ReturnType<typeof demoChurchInfo>>;
}) {
  if (!info.isDemo || !info.expiresAt) return null;

  return (
    <Banner tone="warning" title={t("demo.banner.title")} className="rounded-none border-x-0 border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span>{t("demo.banner.body")}</span>
        {/* Absolute, and off this host. The demo's own address has no sign-up
            behind it: pressing this went to a sign-in screen on
            demo.connectapp.church, which is a dead end. */}
        <Button asChild variant="secondary">
          <a href={`https://${PLATFORM_HOST}/create-church`}>{t("demo.banner.signUp")}</a>
        </Button>
      </div>
    </Banner>
  );
}
