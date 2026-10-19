"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@connectapp/ui";
import { checkNow } from "./actions";

/**
 * HRT-394, HRT-463, R24.6. Ask every service again, now.
 *
 * The screen draws what was last written down, because the rail links here
 * from everywhere and opening a screen must not fire eight calls to other
 * people's APIs. This press is somebody asking for a reading taken now.
 *
 * It asks through an action rather than through the address. Putting it in the
 * address meant the probes ran inside the screen's own render, which is what
 * made the screen unopenable in production.
 *
 * It says it is working while it works: a press that looks like nothing
 * happened is a press somebody makes again.
 */
export function CheckAgain() {
  const [checking, start] = React.useTransition();
  const [trouble, setTrouble] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={checking}
        onClick={() =>
          start(async () => {
            setTrouble(null);
            const answer = await checkNow();
            if ("error" in answer) setTrouble(answer.error);
          })
        }
      >
        <RefreshCw className={checking ? "motion-safe:animate-spin" : undefined} />
        {checking ? "Checking" : "Check again"}
      </Button>
      {trouble ? <span className="text-caption text-danger">{trouble}</span> : null}
    </div>
  );
}
