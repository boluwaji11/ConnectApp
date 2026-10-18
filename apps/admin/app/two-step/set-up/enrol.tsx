"use client";

import * as React from "react";
import { Banner, Button, Field, Input } from "@connectapp/ui";
import { startTwoStep, confirmTwoStep } from "../actions";

type Stage =
  | { at: "off" }
  | { at: "scan"; factorId: string; qr: string; secret: string }
  | { at: "code"; factorId: string }
  | { at: "codes"; codes: string[] };

/**
 * HRT-439. Setting up the portal's second factor, which is not optional.
 *
 * The same factor as the church product's: it lives on the account rather
 * than on an app, so an operator who set it up there is already enrolled and
 * never sees this screen.
 */
export function Enrol({
  alreadyOn,
  codesLeft,
}: {
  /** True on a fresh visit by somebody who is already set up. */
  alreadyOn: boolean;
  codesLeft: number;
}) {
  const [stage, setStage] = React.useState<Stage>({ at: "off" });
  const [manual, setManual] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [said, setSaid] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  const begin = () =>
    startTransition(async () => {
      setError(undefined);
      const started = await startTwoStep();
      /* `Done` carries an optional error, so `"error" in it` narrows nothing.
         The shape that succeeded is the one with a QR in it. */
      if (!("qr" in started)) return setError(started.error);
      setStage({ at: "scan", ...started });
    });

  const confirm = () => {
    if (stage.at !== "code") return;
    const factorId = stage.factorId;
    startTransition(async () => {
      setError(undefined);
      const done = await confirmTwoStep(factorId, code);
      if (!("codes" in done)) return setError(done.error);
      setCode("");
      setStage({ at: "codes", codes: done.codes });
    });
  };

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {/* Arrived already set up, rather than having just finished. The
          client's own state wins while a flow is in progress. */}
      {alreadyOn && stage.at === "off" ? (
        <div className="flex flex-col gap-4">
          <Banner tone="success">
            Two-step verification is on for this account, with {codesLeft} recovery{" "}
            {codesLeft === 1 ? "code" : "codes"} left.
          </Banner>
          <Button type="button" full onClick={() => window.location.assign("/")}>
            Open the portal
          </Button>
        </div>
      ) : null}

      {!alreadyOn && stage.at === "off" ? (
        <>
          <p className="text-caption text-fg-muted">
            Works with Google Authenticator, Microsoft Authenticator, and other compatible apps.
          </p>
          <Button type="button" full onClick={begin} loading={pending} disabled={pending}>
            Set up verification
          </Button>
        </>
      ) : null}

      {stage.at === "scan" ? (
        <div className="flex flex-col items-center gap-4 text-center">
          {manual ? (
            <div className="w-full">
              <Field label="Setup key">
                <Input readOnly value={stage.secret} className="text-center font-mono" />
              </Field>
            </div>
          ) : (
            /* Supabase hands the QR back as a data URI, which next/image
               refuses outright. An SVG in an img cannot run script. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stage.qr} alt="" width={180} height={180} className="rounded-lg bg-white p-3" />
          )}

          <button
            type="button"
            onClick={() => setManual((was) => !was)}
            className="text-caption font-medium text-primary underline-offset-4 hover:underline"
          >
            {manual ? "Scan the QR code instead" : "Enter code manually instead"}
          </button>

          <Button
            type="button"
            full
            onClick={() => setStage({ at: "code", factorId: stage.factorId })}
          >
            Next
          </Button>
        </div>
      ) : null}

      {stage.at === "code" ? (
        <div className="flex flex-col gap-4">
          <Field label="Six-digit code" required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="text-center text-title tracking-[0.4em]"
            />
          </Field>
          <Button
            type="button"
            full
            onClick={confirm}
            loading={pending}
            disabled={pending || code.replace(/\D/g, "").length !== 6}
          >
            Confirm
          </Button>
        </div>
      ) : null}

      {stage.at === "codes" ? (
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fg-muted">
            If you lose access to your authenticator app, you can use these codes to sign in.
            Each code works only once, and you won&apos;t be able to view them again after
            leaving this screen.
          </p>

          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-line bg-sunken p-4 font-mono text-caption">
            {stage.codes.map((one) => (
              <li key={one}>{one}</li>
            ))}
          </ul>

          <Banner tone="warning">
            Keep them somewhere private. Anyone with a recovery code and your password can get
            into the portal.
          </Banner>

          <label className="flex cursor-pointer items-start gap-3 text-caption">
            <input
              type="checkbox"
              checked={said}
              onChange={(e) => setSaid(e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>I&apos;ve saved my recovery codes in a safe place.</span>
          </label>

          {/* A full load rather than a router push: the gate that sent them
              here is read on the server, on every request. */}
          <Button
            type="button"
            full
            disabled={!said}
            onClick={() => window.location.assign("/")}
          >
            Finish setup
          </Button>
        </div>
      ) : null}
    </div>
  );
}
