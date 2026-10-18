"use client";

import * as React from "react";
import { Check, Copy, Download, ShieldCheck } from "lucide-react";
import { Banner, Button, Field, Input } from "@connectapp/ui";
import { t, plural } from "@connectapp/i18n";
import { SettingCard } from "../card";
import { startTwoStep, confirmTwoStep, stopTwoStep, newRecoveryCodes } from "./actions";
import { useFormError } from "@/lib/form-error";

/**
 * R1.8, R21.4. Two-step verification, set up on the screen it belongs to.
 *
 * Four states in one card rather than a flow of its own: off, the QR code, the
 * first code out of their app, and the recovery codes. It expands in place the
 * way the email and password rows beside it do, so this screen stays one
 * screen.
 *
 * The secret is held in this component's state for as long as the card is
 * open and is never sent anywhere. Supabase draws the QR itself, so no code
 * here turns a secret into an image.
 */
type Stage =
  | { at: "off" }
  | { at: "scan"; factorId: string; qr: string; secret: string }
  | { at: "code"; factorId: string }
  | { at: "codes"; codes: string[] };

/** The codes, as a block somebody can take away. */
function Codes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = React.useState(false);

  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A browser that refuses the clipboard still shows the codes on screen. */
    }
  };

  const download = () => {
    const blob = new Blob([`${text}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "connectapp-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("twoStep.codesLede")}</p>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? t("twoStep.copied") : t("twoStep.codesCopy")}
        </Button>
        <Button type="button" variant="secondary" onClick={download}>
          <Download /> {t("twoStep.codesDownload")}
        </Button>
        <Button type="button" onClick={onDone}>
          <Check /> {t("twoStep.codesKept")}
        </Button>
      </div>
    </div>
  );
}

export function TwoStep({
  enrolled,
  codesLeft,
}: {
  enrolled: boolean;
  codesLeft: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>({ at: "off" });
  const [manual, setManual] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [error, setError] = useFormError(stage.at);
  const [pending, startTransition] = React.useTransition();
  /* The server's answer, which this card redraws from without a reload. */
  const [isOn, setIsOn] = React.useState(enrolled);
  const [left, setLeft] = React.useState(codesLeft);

  const shut = () => {
    setOpen(false);
    setStage({ at: "off" });
    setManual(false);
    setCode("");
    setError(undefined);
  };

  const toggle = () => {
    setError(undefined);
    if (open) return shut();
    setOpen(true);
  };

  const begin = () => {
    startTransition(async () => {
      setError(undefined);
      const started = await startTwoStep();
      if ("error" in started) return setError(started.error);
      setStage({ at: "scan", ...started });
    });
  };

  const confirm = () => {
    if (stage.at !== "code" && stage.at !== "scan") return;
    const factorId = stage.factorId;
    startTransition(async () => {
      setError(undefined);
      const done = await confirmTwoStep(factorId, code);
      if ("error" in done) return setError(done.error);
      setIsOn(true);
      setLeft(done.codes.length);
      setCode("");
      setStage({ at: "codes", codes: done.codes });
    });
  };

  const turnOff = (data: FormData) => {
    startTransition(async () => {
      setError(undefined);
      const result = await stopTwoStep(data);
      if (result.error) return setError(result.error);
      setIsOn(false);
      setLeft(0);
      shut();
    });
  };

  const reissue = (data: FormData) => {
    startTransition(async () => {
      setError(undefined);
      const result = await newRecoveryCodes(data);
      if ("error" in result) return setError(result.error);
      setLeft(result.codes.length);
      setStage({ at: "codes", codes: result.codes });
    });
  };

  const sixDigits = code.replace(/\D/g, "").length === 6;

  return (
    <SettingCard
      icon={<ShieldCheck />}
      title={t("twoStep.row")}
      lede={
        isOn
          ? `${t("twoStep.on")} · ${plural("twoStep.codesLeft", left)}`
          : t("twoStep.off")
      }
      onPress={toggle}
      expanded={open}
    >
      {open ? (
        <div className="flex flex-col gap-5" aria-busy={pending}>
          {error ? <Banner tone="danger">{error}</Banner> : null}

          {/* Setting it up, which is the Stripe-shaped part: a QR code, a way
              to type the key by hand, and then the first code from the app. */}
          {!isOn && stage.at === "off" ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">{t("twoStep.apps")}</p>
              <Button type="button" onClick={begin} loading={pending} disabled={pending}>
                {t("twoStep.turnOn")}
              </Button>
            </div>
          ) : null}

          {stage.at === "scan" ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("twoStep.scan")} {t("twoStep.apps")}
              </p>

              {manual ? (
                <div className="w-full max-w-sm">
                  <Field label={t("twoStep.secret")}>
                    <Input readOnly value={stage.secret} className="text-center font-mono" />
                  </Field>
                </div>
              ) : (
                /*
                 * Supabase hands back the QR as an `image/svg+xml` data URI.
                 * `next/image` refuses a data URI outright, and an SVG through
                 * the optimizer needs `dangerouslyAllowSVG` turned on for every
                 * image in the product, which is a worse trade than one plain
                 * tag here. An SVG in an `img` cannot run script, and this one
                 * never leaves the response it arrived in.
                 */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stage.qr}
                  alt=""
                  width={180}
                  height={180}
                  className="rounded-lg bg-white p-3"
                />
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
                className="max-w-sm"
                onClick={() => setStage({ at: "code", factorId: stage.factorId })}
              >
                {t("twoStep.next")}
              </Button>
            </div>
          ) : null}

          {stage.at === "code" ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">{t("twoStep.enterLede")}</p>
              <div className="w-full max-w-xs">
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
              </div>
              <Button
                type="button"
                full
                className="max-w-sm"
                onClick={confirm}
                loading={pending}
                disabled={pending || !sixDigits}
              >
                {t("twoStep.confirm")}
              </Button>
            </div>
          ) : null}

          {stage.at === "codes" ? <Codes codes={stage.codes} onDone={shut} /> : null}

          {/* On, and not in the middle of anything. The two things somebody
              comes back to this card for. */}
          {isOn && stage.at === "off" ? (
            <div className="flex flex-col gap-6">
              <form
                noValidate
                action={reissue}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="min-w-48 flex-1">
                  <Field label={t("twoStep.password")} required>
                    <Input name="password" type="password" autoComplete="current-password" />
                  </Field>
                </div>
                <Button type="submit" variant="secondary" disabled={pending}>
                  {t("twoStep.reissue")}
                </Button>
              </form>

              <form noValidate action={turnOff} className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <Field label={t("twoStep.password")} required>
                    <Input name="password" type="password" autoComplete="current-password" />
                  </Field>
                </div>
                <Button type="submit" variant="danger" disabled={pending}>
                  {t("twoStep.turnOff")}
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      ) : undefined}
    </SettingCard>
  );
}
