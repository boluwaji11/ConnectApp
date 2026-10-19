"use client";

import * as React from "react";
import { Check, Copy, Download } from "lucide-react";
import { Banner, Button, Checkbox, Field, Input } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { startTwoStep, confirmTwoStep } from "./actions";

type Stage =
  | { at: "off" }
  | { at: "scan"; factorId: string; qr: string; secret: string }
  | { at: "code"; factorId: string }
  | { at: "codes"; codes: string[] };

/**
 * HRT-438. Setting up a second factor, on a screen somebody cannot leave.
 *
 * The same four steps as the one in settings, drawn for a person who did not
 * choose to be here. It says what the rule is for before it asks for
 * anything, because being stopped on the way to your own church's records
 * deserves a reason rather than an instruction.
 */
export function Enrol({
  next,
  alreadyOn,
}: {
  /** Where finishing goes. Always set: the page works it out. */
  next: string;
  /** True on a fresh visit by somebody who is already set up. */
  alreadyOn?: boolean;
}) {
  const [stage, setStage] = React.useState<Stage>({ at: "off" });
  const [manual, setManual] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [said, setSaid] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  const begin = () =>
    startTransition(async () => {
      setError(undefined);
      const started = await startTwoStep();
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

  const codes = stage.at === "codes" ? stage.codes : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A browser that refuses the clipboard still shows them on screen. */
    }
  };

  const download = () => {
    const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "connectapp-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {alreadyOn && stage.at === "off" ? (
        <div className="flex flex-col gap-4">
          <Banner tone="success">{t("twoStep.done")}</Banner>
          <Button type="button" full onClick={() => window.location.assign(next)}>
            {t("twoStep.required.continue")}
          </Button>
        </div>
      ) : null}

      {!alreadyOn && stage.at === "off" ? (
        <>
          <p className="text-sm text-fg-muted">
            {t("twoStep.appsLead")} {t("twoStep.appGoogle")}, {t("twoStep.appMicrosoft")},{" "}
            {t("twoStep.appsTail")}
          </p>
          <Button type="button" full onClick={begin} loading={pending} disabled={pending}>
            {t("twoStep.turnOn")}
          </Button>
        </>
      ) : null}

      {stage.at === "scan" ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-fg-muted">{t("twoStep.scan")}</p>

          {manual ? (
            <div className="w-full">
              <Field label={t("twoStep.secret")}>
                <Input readOnly value={stage.secret} className="text-center font-mono" />
              </Field>
            </div>
          ) : (
            /* Supabase hands the QR back as a data URI, which next/image
               refuses. An SVG inside an img cannot run script. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stage.qr} alt="" width={180} height={180} className="rounded-lg bg-white p-3" />
          )}

          <button
            type="button"
            onClick={() => setManual((was) => !was)}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {manual ? t("twoStep.manualHide") : t("twoStep.manual")}
          </button>

          <Button
            type="button"
            full
            onClick={() => setStage({ at: "code", factorId: stage.factorId })}
          >
            {t("twoStep.next")}
          </Button>
        </div>
      ) : null}

      {stage.at === "code" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">{t("twoStep.enterLede")}</p>
          <Field label={t("twoStep.code")} required>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="text-center text-xl tracking-[0.4em]"
            />
          </Field>
          <Button
            type="button"
            full
            onClick={confirm}
            loading={pending}
            disabled={pending || code.replace(/\D/g, "").length !== 6}
          >
            {t("twoStep.confirm")}
          </Button>
        </div>
      ) : null}

      {stage.at === "codes" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">{t("twoStep.codesLede")}</p>

          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-line bg-sunken p-4 font-mono text-sm">
            {codes.map((one) => (
              <li key={one}>{one}</li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? <Check /> : <Copy />}{" "}
              {copied ? t("twoStep.copied") : t("twoStep.codesCopy")}
            </Button>
            <Button type="button" variant="secondary" onClick={download}>
              <Download /> {t("twoStep.codesDownload")}
            </Button>
          </div>

          <Banner tone="warning">{t("twoStep.codesWarn")}</Banner>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox checked={said} onCheckedChange={(to) => setSaid(to === true)} />
            <span>{t("twoStep.codesConfirm")}</span>
          </label>

          {/* A full load rather than a router push: the gate that sent them
              here is read on the server, on every request. */}
          <Button
            type="button"
            full
            disabled={!said}
            onClick={() => window.location.assign(next)}
          >
            <Check /> {t("twoStep.required.continue")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
