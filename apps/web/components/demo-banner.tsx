import Link from "next/link";
import { Banner, Button } from "@connectapp/ui";
import type { demoChurchInfo } from "@connectapp/db";
import { t } from "@connectapp/i18n";

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

  /* "Monday at 1:22 AM". The day and the time, joined the way a person says
     it, because "Monday 1:22 AM" reads as two facts rather than one moment. */
  const day = info.expiresAt.toLocaleString(undefined, { weekday: "long" });
  const time = info.expiresAt.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
  const when = `${day} at ${time}`;

  return (
    <Banner tone="warning" title={t("demo.banner.title")} className="rounded-none border-x-0 border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span>{t("demo.banner.body", { when })}</span>
        <Button asChild variant="secondary">
          <Link href="/create-church">{t("demo.banner.signUp")}</Link>
        </Button>
      </div>
    </Banner>
  );
}
