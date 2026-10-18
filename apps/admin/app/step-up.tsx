"use client";

import * as React from "react";
import { Banner, Button, Dialog, DialogContent, DialogFooter, Field, Input } from "@connectapp/ui";
import { proveItIsStillYou } from "./actions";

/**
 * HRT-442, R1.8, R21.4. The code again, in front of the presses that reach
 * every church.
 *
 * Getting into the portal already needs a second factor. This asks whether
 * the operator who presented it is still here, because handing somebody the
 * portal, taking it away, or clearing an owner's second factor are each one
 * press and none of them is undone from a screen.
 *
 * No recovery code. One of those turns two-step off, which is the way back in
 * for a lost phone and not a way past a question asked here.
 */
export function StepUpDialog({
  open,
  onDone,
  onCancel,
}: {
  open: boolean;
  /** The code was accepted. The caller presses its action again. */
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setCode("");
      setError(undefined);
    }
  }, [open]);

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
    <Dialog open={open} onOpenChange={(on) => (on ? null : onCancel())}>
      <DialogContent title="Enter your verification code" closeLabel="Close">
        <div className="flex flex-col gap-4">
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <p className="m-0 text-[13px] text-fg-muted">
            This action reaches every church, so we check it is still you.
          </p>

          <Field label="Six-digit code" required>
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
              Cancel
            </Button>
            <Button disabled={!ready || pending} loading={pending} onClick={send}>
              Verify and continue
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The whole dance, for a press that may be asked for a code.
 *
 * Call `go()`. If the action comes back asking, the box opens and the same
 * press is repeated with the same arguments once the code is right.
 */
export function useStepUp<A extends unknown[], R extends { stepUp?: "code" }>(
  run: (...args: A) => Promise<R>,
) {
  const [open, setOpen] = React.useState(false);
  const again = React.useRef<{ args: A; settle: (value: R | null) => void } | null>(null);

  const go = React.useCallback(
    async (...args: A): Promise<R | null> => {
      const answer = await run(...args);
      if (!answer.stepUp) return answer;
      setOpen(true);
      return new Promise<R | null>((settle) => {
        again.current = { args, settle };
      });
    },
    [run],
  );

  const dialog = (
    <StepUpDialog
      open={open}
      onDone={() => {
        setOpen(false);
        const waiting = again.current;
        again.current = null;
        if (!waiting) return;
        void run(...waiting.args).then(waiting.settle);
      }}
      onCancel={() => {
        setOpen(false);
        const waiting = again.current;
        again.current = null;
        /* Nothing happened, so nothing is reported. */
        waiting?.settle(null);
      }}
    />
  );

  return { go, dialog };
}
