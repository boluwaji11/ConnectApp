"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check, CircleCheck, Copy, Download, ExternalLink, Landmark, Link2, Loader2, Printer,
  QrCode, } from "lucide-react";
import { Banner, Button, Card, Tooltip } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { StripeWordmark } from "@/components/stripe-wordmark";
import { Steps, Step } from "@/components/steps";
import type { ChurchStripeAccountRead } from "@connectapp/db";
import type { AccountFace } from "./actions";
import { connectStripe, refreshStripe } from "./actions";
import { StepUpDialog } from "@/components/step-up";
import type { StepUp } from "@/lib/step-up";
import { NonprofitRate } from "./nonprofit-rate";

/**
 * Stripe's own mark, drawn rather than fetched.
 *
 * Nothing on this product loads a third party's image, and a church looking at
 * this card should see the name of the company it is about to hold an account
 * with rather than a generic card icon.
 */
/** The giving address, with the two things anybody does to it. */
function Address({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="flex items-center gap-1 rounded-[var(--d-radius-control)] border border-line-strong bg-surface pr-1">
      <input
        readOnly
        value={value}
        aria-label={t("give.link")}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-[13px] text-fg outline-none"
      />
      <Tooltip content={copied ? t("joining.copied") : t("joining.copy")}>
      <button
        type="button"
        aria-label={copied ? t("joining.copied") : t("joining.copy")}
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-sunken hover:text-fg [&_svg]:size-4"
      >
        {copied ? <Check className="text-primary" /> : <Copy />}
      </button>
      </Tooltip>
      <a
        href={value}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={t("stripe.open")}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-sunken hover:text-fg [&_svg]:size-4"
      >
        <ExternalLink />
      </a>
    </div>
  );
}

/**
 * R13.1, R13.6, R13.7. Taking a gift by card: the account, the address, the code.
 *
 * One card read top to bottom, because that is the order a church does it in:
 * connect Stripe, hand out the address, put the code on the bulletin. The
 * thread down the left says so, and a completed step is drawn in green.
 */
/**
 * What the action came back with, as a sentence.
 *
 * An action answers either with a catalogue key, for the outcomes it knows
 * about, or with a sentence `explain` already wrote. Anything unrecognised is
 * the second kind and goes through as it is.
 */
const SAID = {
  "stripe.unconfigured": true,
  "stripe.unreachable": true,
  "stripe.refused": true,
} as const;

const said = (error: string): string =>
  error in SAID ? t(error as keyof typeof SAID) : error;

export function OnlineGiving({
  church,
  account,
  missing,
  configured,
  address,
  qr,
  face,
  signedInAs,
}: {
  church: string;
  account: ChurchStripeAccountRead | null;
  /** R13.1. What the church has not filled in, which Stripe will ask for. */
  missing: string[];
  /** Whether this platform has a Stripe key at all. */
  configured: boolean;
  /** The church's own giving address. */
  address: string;
  /** The same address as a code, where the account can take a gift. */
  qr: string | null;
  /** R13.1. What Stripe holds that a church would recognise. */
  face: AccountFace;
  /** Whoever is reading this, to sign off the email to Stripe. */
  signedInAs: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  const ready = Boolean(account?.chargesEnabled);
  /* HRT-386, R13.5. Which rate Stripe charges this church, as it told us. */
  const nonprofit = Boolean(account?.nonprofitRateAt);

  /*
   * R13.1. Stripe addresses each account by its id, so this goes to the
   * church's own, rather than to whichever account the browser happens to be
   * signed in to. Somebody who is not on that account is asked to sign in,
   * which is Stripe's business and not ours.
   */
  const inStripe = account
    ? `https://dashboard.stripe.com/${account.accountId}${account.livemode ? "" : "/test"}`
    : "https://dashboard.stripe.com/";
  const settling = Boolean(account && !account.chargesEnabled && account.detailsSubmitted);

  /*
   * R13.1. Stripe usually decides within seconds of the church finishing its
   * form, and occasionally the review needs a person. The screen polls rather
   * than leaving a button, and stops after thirty seconds, saying so instead
   * of spinning indefinitely.
   */
  const [watched, setWatched] = React.useState(false);
  React.useEffect(() => setWatched(false), [settling]);

  React.useEffect(() => {
    if (!settling || watched) return;
    let stop = false;

    const timer = window.setInterval(async () => {
      if (stop) return;
      const answer = await refreshStripe();
      if (!answer.error) router.refresh();
    }, 2500);
    const give = window.setTimeout(() => {
      stop = true;
      window.clearInterval(timer);
      setWatched(true);
    }, 30_000);

    return () => {
      stop = true;
      window.clearInterval(timer);
      window.clearTimeout(give);
    };
  }, [settling, watched, church, router]);

  /** Looking once, by hand, after the watching has stopped. */
  const lookAgain = () =>
    startTransition(async () => {
      await refreshStripe();
      router.refresh();
      setWatched(false);
    });

  /* Only while something is actually being watched for. */
  const checking = settling && !watched;

  /*
   * R13.1, R22.2. Stripe opens in a tab of its own.
   *
   * Its form is long, it asks for papers somebody may have to go and find,
   * and taking this tab with it meant coming back to whatever Stripe decided
   * to show rather than to the screen the church started on. One named tab,
   * reused, so pressing again replaces it rather than leaving another behind.
   */
  const [waiting, setWaiting] = React.useState(false);
  /* R1.8, R21.4. The link this press returns is how the bank account the
     church's giving settles into gets set. */
  const [need, setNeed] = React.useState<StepUp | null>(null);

  const go = () => {
    /*
     * The tab is opened on the press, while the press is still what the
     * browser is answering. Asking for the link first and opening afterwards
     * is a window.open with no gesture behind it, which every browser blocks,
     * and the church presses a button that does nothing at all.
     */
    const tab = window.open("", "connectapp-stripe");

    startTransition(async () => {
      const result = await connectStripe();
      /*
       * R1.8, R21.4. Asked for the code, so the tab goes and they press again.
       *
       * Not retried for them, deliberately. The tab above is opened while the
       * browser is still answering the press; a tab opened after a dialog has
       * no gesture behind it and every browser blocks it, which would be a
       * button that does nothing.
       */
      if (result.stepUp) {
        tab?.close();
        setNeed(result.stepUp);
        return;
      }
      if (result.error) {
        tab?.close();
        setError(said(result.error));
        return;
      }
      if (!result.url) {
        tab?.close();
        return;
      }

      setWaiting(true);
      /* Blocked anyway, by a setting rather than by the rule above: this tab
         goes instead, which is what it used to do. */
      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    });
  };

  /*
   * R13.1. And this tab reads again when the church comes back to it, which
   * is the moment they have finished over there. At most once every five
   * seconds, so returning to the tab is not a way to make Stripe work.
   */
  React.useEffect(() => {
    if (!waiting) return;
    let last = 0;
    const look = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 5000) return;
      last = Date.now();
      void refreshStripe().then(() => router.refresh());
    };
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, [waiting, router]);

  return (
    <div className="flex max-w-[1120px] flex-col gap-4">
      <StepUpDialog need={need} onDone={() => setNeed(null)} onCancel={() => setNeed(null)} />

      {/* R24.6. The account and the rate stand side by side and end level,
          because neither is a footnote to the other. */}
      <div className="grid items-stretch gap-5 xl:[grid-template-columns:minmax(0,1fr)_minmax(300px,380px)]">
      <div className="flex min-w-0 flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {configured ? null : (
        <Banner tone="info" title={t("stripe.title")}>{t("stripe.unconfigured")}</Banner>
      )}

      <Card className="flex h-full flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Stripe's own wordmark, white on their blurple, which is one of
              the three their brand rules allow. */}
          <span
            className="grid h-9 w-[76px] shrink-0 place-items-center rounded-[10px] px-2.5 text-white"
            style={{ background: "#635BFF" }}
          >
            <StripeWordmark className="h-4 w-full" />
          </span>

          <span className="flex min-w-0 flex-1 flex-col">
            {/* The church's own account, where there is one. The badge
                beside it already says whose rails these are. */}
            {face.name ? (
              <span className="truncate font-semibold text-fg">{face.name}</span>
            ) : null}
            {/* R13.1. The account the money lands in. How often Stripe moves
                it is Stripe's own screen to answer. */}
            {account ? (
              <span className="truncate text-[12px] text-fg-subtle">
                {[
                  face.bank ? t("stripe.payingTo", { bank: face.bank }) : null,
                  account.livemode ? null : t("stripe.test"),
                ]
                  .filter(Boolean)
                  .join(" \u00b7 ")}
              </span>
            ) : null}
          </span>

          {/* R24.6. Green when it is working, and it says which. */}
          <span
            className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold"
            style={
              ready
                ? { background: "var(--hue-fern-tint)", color: "var(--hue-fern-key)" }
                : { background: "var(--color-sunken)", color: "var(--color-fg-muted)" }
            }
          >
            {checking ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {ready ? <CircleCheck className="size-3.5" aria-hidden /> : null}
            {!account
              ? t("stripe.state.none")
              : ready
                ? t("stripe.state.ready")
                : checking
                  ? t("stripe.state.settling")
                  : settling
                    ? t("stripe.state.waiting")
                  : t("stripe.state.pending")}
          </span>
        </div>

        <Steps>
          <Step icon={<Landmark />} title={t("stripe.step.account")} done={ready}>
            {ready ? (
              <div className="flex flex-col gap-1.5">
                <a
                  href={inStripe}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex w-fit items-center gap-1.5 font-medium text-primary no-underline"
                >
                  <ExternalLink className="size-4" aria-hidden /> {t("stripe.open")}
                </a>
                {/* The token Stripe's own support asks for, and nothing a
                    church needs to read otherwise. */}
                <span className="font-mono text-[11px] text-fg-subtle">
                  {t("stripe.account", { id: account!.accountId })}
                </span>
              </div>
            ) : (
              <>
                {missing.length > 0 ? (
                  <div className="flex flex-col gap-1 text-[13px] text-fg-muted">
                    {/* R12.x. One line rather than a list of the fields that
                        happen to be blank: a church reads what Stripe is
                        going to want, not which of three boxes we noticed. */}
                    <span>{t("stripe.missing")}</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  {/* R13.1. Pressable while Stripe is still deciding: an
                      account waiting on one more paper is an account whose
                      church needs the way back to it, and a button that is
                      busy for as long as Stripe takes is a dead end. */}
                  <Button
                    disabled={pending || !configured || checking}
                    loading={pending || checking}
                    onClick={go}
                    data-guide="connect-stripe"
                  >
                    {account ? t("stripe.continue") : t("stripe.connect")}
                  </Button>

                  {settling && watched ? (
                    <Button variant="secondary" disabled={pending} onClick={lookAgain}>
                      {t("stripe.lookAgain")}
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </Step>

          <Step icon={<Link2 />} title={t("give.link")} done={ready}>
            {ready ? (
              <Address value={address} />
            ) : (
              <span className="text-[13px] text-fg-muted">{t("stripe.step.later")}</span>
            )}
          </Step>

          <Step icon={<QrCode />} title={t("give.qr.title")} done={ready} last>
            {ready && qr ? (
              <div className="flex flex-wrap items-center gap-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qr}
                  alt=""
                  className="size-[150px] rounded-lg border border-line bg-white p-2"
                />
                <div className="flex flex-col gap-3">
                  <a
                    href={qr}
                    download={`${church}-giving-qr.png`}
                    className="inline-flex w-fit items-center gap-1.5 font-medium text-primary no-underline"
                  >
                    <Download className="size-4" aria-hidden /> {t("give.qr.download")}
                  </a>
                  <a
                    href={"/giving/qr"}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex w-fit items-center gap-1.5 font-medium text-primary no-underline"
                  >
                    <Printer className="size-4" aria-hidden /> {t("give.qr")}
                  </a>
                </div>
              </div>
            ) : (
              <span className="text-[13px] text-fg-muted">{t("stripe.step.later")}</span>
            )}
          </Step>
        </Steps>
      </Card>

      </div>

      {/* R13.1. Stripe charges a church less once it has asked, and it does
          not backdate the answer, so this sits beside the account from the
          moment there is one. */}
      {ready && account && !nonprofit ? (
        <NonprofitRate
          church={face.name || church}
          accountId={account.accountId}
          signedInAs={signedInAs}
        />
      ) : null}
      </div>

      <p className="m-0 text-[13px] text-fg-muted">
        {t("stripe.fees.a")} <strong className="font-semibold text-fg underline underline-offset-4">
          {t("stripe.fees.takes")}
        </strong>{" "}
        {nonprofit ? t("stripe.fees.nonprofit") : t("stripe.fees.standard")}
      </p>
    </div>
  );
}
