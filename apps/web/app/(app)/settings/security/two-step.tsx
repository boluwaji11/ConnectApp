"use client";

import * as React from "react";
import { Check, Copy, Download, Fingerprint, ShieldCheck } from "lucide-react";
import {
  Banner, Button, Checkbox, Dialog, DialogContent, DialogFooter, Field, Input,
} from "@connectapp/ui";
import { t, plural } from "@connectapp/i18n";
import { SettingCard } from "../card";
import {
  startTwoStep, confirmTwoStep, stopTwoStep, newRecoveryCodes, completePasskey,
} from "./actions";
import { registerPasskey, type RelyingParty } from "@/lib/passkey-client";
import { useFormError } from "@/lib/form-error";

/**
 * R1.8, R21.4. Two-step verification.
 *
 * The card carries the state and the way in. Setting it up happens in a box
 * over the screen, because it is a short flow with its own steps and a person
 * part way through it should not be able to scroll away from it and leave an
 * unverified factor behind. The card itself stays a card: a status, a
 * sentence, and a button.
 *
 * Two ways to do it. An authenticator app works anywhere and is the one most
 * people will use. A passkey is the device itself, which is stronger and needs
 * nothing installed, and is offered only where the key can be bound to one of
 * our own names. See lib/passkey.ts for why that condition exists.
 */
type Stage =
  | { at: "shut" }
  | { at: "scan"; factorId: string; qr: string; secret: string }
  | { at: "code"; factorId: string }
  | { at: "codes"; codes: string[] }
  | { at: "turnOff" };

const APP_LINK = "font-medium text-primary underline-offset-4 hover:underline";

/**
 * R1.8. The two apps most people already have, as links to the real thing.
 *
 * Both point at the maker's own page rather than at a store, because the store
 * a person needs depends on the phone in their hand and these pages carry
 * both. Naming an app without a way to get it leaves somebody to search for
 * "google authenticator" and meet whatever is top of the results, which on an
 * app store is where the copies live.
 */
function AuthenticatorApps() {
  return (
    <p className="text-sm text-muted-foreground">
      {t("twoStep.appsLead")}{" "}
      <a
        href="https://support.google.com/accounts/answer/1066447"
        target="_blank"
        rel="noreferrer noopener"
        className={APP_LINK}
      >
        {t("twoStep.appGoogle")}
      </a>
      ,{" "}
      <a
        href="https://www.microsoft.com/en-us/security/mobile-authenticator-app"
        target="_blank"
        rel="noreferrer noopener"
        className={APP_LINK}
      >
        {t("twoStep.appMicrosoft")}
      </a>
      , {t("twoStep.appsTail")}
    </p>
  );
}

/**
 * The codes, as a block somebody can take away.
 *
 * `onSaid` is the confirmation, not the dismissal. Shown once and never again
 * is only true if somebody has actually taken them, and a button that closes
 * the box is pressed by everybody whether they have or not. The tick is a
 * moment's friction in the one place where the cost of skipping is losing the
 * account.
 */
function Codes({
  codes,
  said,
  onSaid,
}: {
  codes: string[];
  said: boolean;
  onSaid: (to: boolean) => void;
}) {
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

      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-sunken p-4 font-mono text-sm">
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
      </div>

      <Banner tone="warning">{t("twoStep.codesWarn")}</Banner>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox checked={said} onCheckedChange={(to) => onSaid(to === true)} />
        <span>{t("twoStep.codesConfirm")}</span>
      </label>
    </div>
  );
}

export function TwoStep({
  enrolled,
  codesLeft,
  passkey,
}: {
  enrolled: boolean;
  codesLeft: number;
  /** Null where a passkey cannot be bound to one of our own names. */
  passkey: RelyingParty | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>({ at: "shut" });
  const [manual, setManual] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [error, setError] = useFormError(stage.at);
  const [cardError, setCardError] = useFormError(open);
  const [pending, startTransition] = React.useTransition();
  /* The server's answer, which this card redraws from without a reload. */
  const [isOn, setIsOn] = React.useState(enrolled);
  const [left, setLeft] = React.useState(codesLeft);
  /* R1.8. Reset with every set, so a reissue is confirmed on its own. */
  const [said, setSaid] = React.useState(false);

  const shut = () => {
    setStage({ at: "shut" });
    setManual(false);
    setCode("");
    setSaid(false);
    setError(undefined);
  };

  const begin = () => {
    startTransition(async () => {
      setCardError(undefined);
      const started = await startTwoStep();
      if ("error" in started) return setCardError(started.error);
      setStage({ at: "scan", ...started });
    });
  };

  /*
   * R1.8. The passkey ceremony runs in the browser and cannot run anywhere
   * else: the private key never leaves the device. The server is asked
   * afterwards, and it reads the factor from Supabase rather than believing
   * what the browser says happened.
   */
  const usePasskey = () => {
    if (!passkey) return;
    startTransition(async () => {
      setCardError(undefined);
      const made = await registerPasskey(passkey);
      if (made.error) return setCardError(t(made.error));

      const done = await completePasskey();
      if ("error" in done) return setCardError(done.error);
      setIsOn(true);
      setLeft(done.codes.length);
      setSaid(false);
      setStage({ at: "codes", codes: done.codes });
    });
  };

  const confirm = () => {
    if (stage.at !== "code") return;
    const factorId = stage.factorId;
    startTransition(async () => {
      setError(undefined);
      const done = await confirmTwoStep(factorId, code);
      if ("error" in done) return setError(done.error);
      setIsOn(true);
      setLeft(done.codes.length);
      setCode("");
      setSaid(false);
      setStage({ at: "codes", codes: done.codes });
    });
  };

  const turnOff = (data: FormData) => {
    startTransition(async () => {
      setCardError(undefined);
      const result = await stopTwoStep(data);
      if (result.error) return setError(result.error);
      setIsOn(false);
      setLeft(0);
      shut();
    });
  };

  const reissue = (data: FormData) => {
    startTransition(async () => {
      setCardError(undefined);
      const result = await newRecoveryCodes(data);
      if ("error" in result) return setCardError(result.error);
      setLeft(result.codes.length);
      setSaid(false);
      setStage({ at: "codes", codes: result.codes });
    });
  };

  const sixDigits = code.replace(/\D/g, "").length === 6;

  const title =
    stage.at === "codes" ? t("twoStep.codesTitle")
      : stage.at === "code" ? t("twoStep.enterTitle")
        : stage.at === "turnOff" ? t("twoStep.offConfirm")
          : t("twoStep.setUp");

  return (
    <>
      <SettingCard
        icon={<ShieldCheck />}
        title={t("twoStep.row")}
        lede={
          isOn
            ? `${t("twoStep.on")} · ${plural("twoStep.codesLeft", left)}`
            : t("twoStep.off")
        }
        onPress={() => setOpen((was) => !was)}
        expanded={open}
      >
        {open ? (
          <div className="flex flex-col gap-5" aria-busy={pending}>
            {cardError ? <Banner tone="danger">{cardError}</Banner> : null}

            {!isOn ? (
              <div className="flex flex-col items-start gap-4">
                {/* What it does, then what it needs. A card that opened on a
                    list of app names said which key to buy without saying what
                    the lock was for. */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-fg">{t("twoStep.lede")}</p>
                  <AuthenticatorApps />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={begin} loading={pending} disabled={pending}>
                    {t("twoStep.turnOn")}
                  </Button>
                  {passkey ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={usePasskey}
                      disabled={pending}
                    >
                      <Fingerprint /> {t("twoStep.usePasskey")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              /*
                * Two things somebody comes back for, and they are not the same
                * kind of thing. Side by side as two password boxes, the screen
                * asked for the password twice and said nothing about why, and
                * the destructive one was no harder to reach than the routine
                * one. Each gets a heading that says what it does, and turning
                * it off asks in a box of its own.
                */
              <div className="flex flex-col gap-6">
                <section className="flex flex-col gap-3">
                  <div>
                    <h3 className="font-semibold text-fg">{t("twoStep.codesSection")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("twoStep.codesSectionLede")}
                    </p>
                  </div>
                  <form noValidate action={reissue} className="flex flex-col items-start gap-3">
                    <div className="w-full max-w-sm">
                      <Field label={t("twoStep.confirmPassword")} required>
                        <Input name="password" type="password" autoComplete="current-password" />
                      </Field>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("twoStep.codesInvalidate")}
                    </p>
                    <Button type="submit" variant="secondary" disabled={pending}>
                      {t("twoStep.generate")}
                    </Button>
                  </form>
                </section>

                <div className="border-t" />

                <section className="flex flex-col gap-3">
                  <div>
                    <h3 className="font-semibold text-fg">{t("twoStep.offSection")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("twoStep.offSectionLede")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="self-start text-danger"
                    disabled={pending}
                    onClick={() => setStage({ at: "turnOff" })}
                  >
                    {t("twoStep.offButton")}
                  </Button>
                </section>
              </div>
            )}
          </div>
        ) : undefined}
      </SettingCard>

      {/*
        * The flow itself, over the screen. Dismissing it part way through
        * leaves an unverified factor behind, which the next start clears, so
        * walking away costs nothing.
        */}
      <Dialog open={stage.at !== "shut"} onOpenChange={(to) => (to ? undefined : shut())}>
        <DialogContent
          title={title}
          closeLabel={stage.at === "codes" ? undefined : t("common.close")}
          className="max-w-[460px]"
        >
          <div className="flex flex-col gap-5" aria-busy={pending}>
            {error ? <Banner tone="danger">{error}</Banner> : null}

            {stage.at === "scan" ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-muted-foreground">{t("twoStep.scan")}</p>
                  <AuthenticatorApps />
                </div>

                {manual ? (
                  <div className="w-full">
                    <Field label={t("twoStep.secret")}>
                      <Input readOnly value={stage.secret} className="text-center font-mono" />
                    </Field>
                  </div>
                ) : (
                  /*
                   * Supabase hands back the QR as an `image/svg+xml` data URI.
                   * `next/image` refuses a data URI outright, and an SVG
                   * through the optimizer needs `dangerouslyAllowSVG` turned
                   * on for every image in the product, which is a worse trade
                   * than one plain tag here. An SVG in an `img` cannot run
                   * script, and this one never leaves the response it arrived
                   * in.
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
              </div>
            ) : null}

            {stage.at === "code" ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <p className="text-sm text-muted-foreground">{t("twoStep.enterLede")}</p>
                <div className="w-full max-w-xs">
                  <Field label={t("twoStep.code")} required>
                    <Input
                      name="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      className="text-center text-xl tracking-[0.4em]"
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {stage.at === "codes"
              ? <Codes codes={stage.codes} said={said} onSaid={setSaid} />
              : null}

            {stage.at === "turnOff" ? (
              <form id="turn-off-two-step" noValidate action={turnOff} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">{t("twoStep.offConfirmBody")}</p>
                <Field label={t("twoStep.confirmPassword")} required>
                  <Input name="password" type="password" autoComplete="current-password" autoFocus />
                </Field>
              </form>
            ) : null}
          </div>

          <DialogFooter>
            {stage.at === "scan" ? (
              <Button
                type="button"
                full
                onClick={() => setStage({ at: "code", factorId: stage.factorId })}
              >
                {t("twoStep.next")}
              </Button>
            ) : null}

            {stage.at === "code" ? (
              <Button
                type="button"
                full
                onClick={confirm}
                loading={pending}
                disabled={pending || !sixDigits}
              >
                {t("twoStep.confirm")}
              </Button>
            ) : null}

            {stage.at === "codes" ? (
              <Button type="button" full onClick={shut} disabled={!said}>
                <Check /> {t("twoStep.codesKept")}
              </Button>
            ) : null}

            {stage.at === "turnOff" ? (
              <>
                <Button type="button" variant="ghost" onClick={shut} disabled={pending}>
                  {t("action.cancel")}
                </Button>
                <Button
                  type="submit"
                  form="turn-off-two-step"
                  variant="danger"
                  loading={pending}
                  disabled={pending}
                >
                  {t("twoStep.offButton")}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
