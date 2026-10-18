import * as React from "react";
import { Play } from "lucide-react";
import { Button, cn } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { DEMO_HOST } from "@/lib/demo-host";

/**
 * HRT-416. The way into the demo, which is now a place rather than a press.
 *
 * It used to call a server action that built a church while the visitor
 * watched a button say "Starting", because building one took the best part of
 * a minute. The demo lives at its own address now and a church is a copy
 * rather than a build, so this is a link: arriving there is starting, and it
 * is already inside the product by the time the page paints.
 *
 * A plain link also means this is no longer a client component, so the
 * marketing page carries no JavaScript for it at all.
 */
export function StartDemoButton({
  className,
  children,
}: {
  className?: string;
  /** Given, this is what the press looks like: a screen rather than a label. */
  children?: React.ReactNode;
}) {
  return (
    <Button
      asChild
      variant="secondary"
      aria-label={children ? t("site.shot.office") : undefined}
      className={cn(className)}
    >
      <a href={`https://${DEMO_HOST}/`}>
        {children ?? (
          <>
            <Play className="size-4" aria-hidden />
            {t("demo.start")}
          </>
        )}
      </a>
    </Button>
  );
}
