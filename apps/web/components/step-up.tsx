"use client";

import * as React from "react";
import Link from "next/link";
import { Banner, Button, Dialog, DialogContent, DialogFooter, Field, Input } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { proveItIsStillYou } from "@/app/(app)/step-up-actions";
import type { StepUp } from "@/lib/step-up";

/**
 * R1.8, R21.4. The code asked for again, in front of a short list of actions.
 *
 * A centre dialog rather than a panel, because this is a confirmation and the
 * record is already written: what the person typed stays on the screen behind
 * it and the action is tried again once the code is right.
 *
 * It never offers a recovery code. One of those turns two-step off, which is
 * the right answer to a lost phone at sign-in and the wrong answer to a
 * question asked in front of a refund.
 */
export function StepUpDialog({
  need,
  onDone,
  onCancel,
}: {
  /** What the action asked for, or null when nothing is being asked. */
  need: StepUp | null;
  /** The code was accepted. The caller tries its action again. */
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (need) {
      setCode("");
      setError(undefined);
    }
  }, [need]);

  const ready = code.replace(/\D/g, "").length === 6;

  const send = () => {
    const data = new FormData();
    data.set("code", code);
    startTransition(async () => {
      setError(undefined);
      const result = await proveItIsStillYou(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  };

  return (
    <Dialog open={need !== null} onOpenChange={(on) => (on ? null : onCancel())}>
      <DialogContent
        title={t(need === "enrol" ? "stepUp.setUpTitle" : "stepUp.title")}
        closeLabel={t("common.close")}
      >
        {need === "enrol" ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-[13px] text-fg-muted">{t("stepUp.setUpLede")}</p>
            <DialogFooter>
              <Button variant="ghost" data-dismiss onClick={onCancel}>
                {t("action.cancel")}
              </Button>
              <Button asChild>
                <Link href="/settings/security">{t("stepUp.setUp")}</Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <p className="m-0 text-[13px] text-fg-muted">{t("stepUp.lede")}</p>

            <Field label={t("twoStep.code")} required>
              {/* The same box the sign-in screen uses: a phone offers the code
                  from its notification, and a paste of "123 456" works. */}
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && ready && !pending) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
            </Field>

            <DialogFooter>
              <Button variant="ghost" data-dismiss onClick={onCancel}>
                {t("action.cancel")}
              </Button>
              <Button disabled={!ready || pending} loading={pending} onClick={send}>
                {t("stepUp.confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The whole dance, for a screen that presses one guarded action.
 *
 * `run` is the action. Call `go()` and it runs; if it comes back asking for a
 * code the dialog opens, and once the code is right it runs again with the
 * same arguments. The caller sees one promise and never has to know a dialog
 * happened.
 */
export function useStepUp<A extends unknown[], R extends { stepUp?: StepUp }>(
  run: (...args: A) => Promise<R>,
) {
  const [need, setNeed] = React.useState<StepUp | null>(null);
  /* What to try again once the code is accepted. Held rather than passed back
     through the dialog, so the arguments cannot be changed in between. */
  const again = React.useRef<{ args: A; settle: (value: R | null) => void } | null>(null);

  const go = React.useCallback(
    async (...args: A): Promise<R | null> => {
      const answer = await run(...args);
      if (!answer.stepUp) return answer;

      setNeed(answer.stepUp);
      return new Promise<R | null>((settle) => {
        again.current = { args, settle };
      });
    },
    [run],
  );

  const dialog = (
    <StepUpDialog
      need={need}
      onDone={() => {
        setNeed(null);
        const waiting = again.current;
        again.current = null;
        if (!waiting) return;
        void run(...waiting.args).then(waiting.settle);
      }}
      onCancel={() => {
        setNeed(null);
        const waiting = again.current;
        again.current = null;
        /* Cancelled, so nothing happened and nothing is reported. The screen
           behind still holds whatever was typed into it. */
        waiting?.settle(null);
      }}
    />
  );

  return { go, dialog };
}
