"use client";

import * as React from "react";
import { ShieldOff } from "lucide-react";
import {
  Badge, Banner, Button, Dialog, DialogContent, DialogFooter, Field, Input,
} from "@connectapp/ui";
import type { platform } from "@connectapp/db";
import { Panel } from "@/components/screen";
import { findTwoStep, clearTwoStep } from "@/app/actions";

/**
 * HRT-441, R1.8, R21.4. The way back in for somebody locked out of two-step.
 *
 * A church's first owner has nobody above them. They hold the ten recovery
 * codes they were given and nothing else, so an owner who loses the phone and
 * the codes is outside their own church for good. This is the last resort,
 * and it is why it exists before a second factor is ever required of anybody.
 *
 * It lets nobody in. It puts the account back to a password and asks them to
 * set two-step up again, and it writes the address and the reason into the
 * log no application role can edit.
 */
export function LockedOut() {
  const [found, setFound] = React.useState<platform.TwoStepLookup | null>();
  const [searched, setSearched] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [said, setSaid] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  const look = (data: FormData) =>
    startTransition(async () => {
      setError(undefined);
      setSaid(undefined);
      const result = await findTwoStep(data);
      if (result.error) return setError(result.error);
      setFound(result.found ?? null);
      setSearched(true);
    });

  const clear = () =>
    startTransition(async () => {
      if (!found) return;
      setError(undefined);
      const result = await clearTwoStep(found.userId, reason);
      if (result.error) return setError(result.error);
      setSaid(`Two-step verification is off for ${found.email}. They can set it up again.`);
      setAsking(false);
      setReason("");
      setFound({ ...found, enrolledAt: null, codesLeft: 0 });
    });

  return (
    <Panel className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {said ? <Banner tone="success">{said}</Banner> : null}

      <form action={look} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label="Email address" hint="The address they sign in with.">
            <Input name="email" type="email" autoComplete="off" placeholder="name@church.org" />
          </Field>
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Look up
        </Button>
      </form>

      {searched && found === null ? (
        <p className="text-caption text-fg-muted">
          No account signs in with that address.
        </p>
      ) : null}

      {found ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">{found.name ?? found.email}</span>
              <span className="block text-caption text-fg-subtle">{found.email}</span>
              {found.churches.length > 0 ? (
                <span className="block text-caption text-fg-subtle">
                  {found.churches.join(", ")}
                </span>
              ) : null}
            </span>
            {found.enrolledAt ? (
              <Badge tone="success">Two-step on</Badge>
            ) : (
              <Badge>Two-step off</Badge>
            )}
          </div>

          {found.enrolledAt ? (
            <>
              <p className="text-caption text-fg-muted">
                {found.codesLeft === 0
                  ? "No recovery codes left, so this account cannot get in without help."
                  : `${found.codesLeft} recovery ${found.codesLeft === 1 ? "code" : "codes"} left. Ask them to try one before you turn this off.`}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="self-start text-danger-text"
                disabled={pending}
                onClick={() => setAsking(true)}
              >
                <ShieldOff /> Turn off their two-step
              </Button>
            </>
          ) : (
            <p className="text-caption text-fg-muted">
              This account has no two-step verification on, so there is nothing to clear.
            </p>
          )}
        </div>
      ) : null}

      <Dialog open={asking} onOpenChange={(to) => (to ? undefined : setAsking(false))}>
        <DialogContent title="Turn off their two-step verification?" closeLabel="Close">
          <div className="flex flex-col gap-4">
            <p className="text-fg">
              {found?.email} will sign in with their password alone until they set it up
              again. Check who you are speaking to before you do this.
            </p>
            <Field label="Why" hint="Written into the log, with the address.">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Called about a lost phone"
                autoFocus
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={pending}
              disabled={pending || reason.trim().length < 4}
              onClick={clear}
            >
              Turn it off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
