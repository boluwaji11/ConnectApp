"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, ExternalLink, Mail, Send, Server, Unplug } from "lucide-react";
import {
  Banner, Button, Card, Field, IconButton, Input, Tooltip, Working,
  Dialog, DialogTrigger, DialogContent, DialogFooter,
  Sheet, SheetTrigger, SheetContent,
} from "@connectapp/ui";
import { plural, t } from "@connectapp/i18n";
import type { EmailProvider, PlannedRecord } from "@connectapp/db";
import { usePanelGuard } from "@/components/panel-guard";
import { useAnswered } from "@/components/form-actions";
import { when } from "@/lib/when";
import { Stages } from "@/components/stages";
import { StepUpDialog } from "@/components/step-up";
import type { StepUp } from "@/lib/step-up";
import {
  connectSmtp, checkRecords, disconnectEmail, sendTest, type EmailResult,
} from "./actions";

/** The sending domain as the screen reads it, with the date already a string. */
export interface DomainState {
  id: string;
  domain: string;
  state: string;
  records: PlannedRecord[];
  checkedAt: string | null;
  failureReason: string | null;
}

/**
 * HRT-287, R16.1. Connecting the account a church's email leaves through.
 *
 * Not connected, it offers the two ways in. Connected, it says which account
 * and what mail goes out as, and for Resend it holds the three records until
 * they are published.
 */
export function EmailSetup({
  provider,
  domain,
  church,
  signedInAs,
  registrar,
  console_,
  steps,
  onepress,
}: {
  provider: EmailProvider | null;
  domain: DomainState | null;
  /** R16.1. What the church already told us, so nothing is asked twice. */
  church: { name: string; email: string };
  /** Where a test message goes, which is whoever is pressing the button. */
  signedInAs: string;
  /** R22.2. Who answers for the domain, and where its settings are typed. */
  registrar: string | null;
  console_: string | null;
  /** What to press at this company, in its own menu words. */
  steps: string;
  onepress: string | null;
}) {
  const router = useRouter();
  /*
   * Which way the church is going, once it has picked. Resend is two things in
   * order and gets a path of its own rather than a panel, because a church
   * that has done the first half should see the second half waiting rather
   * than a screen that looks finished with it.
   */
  const [way, setWay] = React.useState<"resend" | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  /*
   * The reading of DNS that the screen does on its own. No panel over the page
   * and no error banner: nobody asked for it, and a church that has not added
   * the records yet is not looking at a fault.
   */
  const quietly = async (run: () => Promise<EmailResult>) => {
    const answer = await run();
    if (!answer.error) router.refresh();
  };

  /* R16.1. What arrived, rather than what was accepted. */
  const [sent, setSent] = React.useState<string | null>(null);
  const test = async (to: string) => {
    setSent(null);
    const data = new FormData();
    data.set("to", to);
    const ok = await act(() => sendTest(data), t("email.test.sending"));
    if (ok) setSent(t("email.test.sent", { address: to }));
  };

  /*
   * R1.8, R21.4. Connecting or withdrawing the sending account asks for the
   * code again: these credentials send mail as the church to everybody in it.
   * Held here rather than at each press, because both go through `act`.
   */
  const [need, setNeed] = React.useState<StepUp | null>(null);
  const again = React.useRef<(() => Promise<EmailResult>) | null>(null);
  const label = React.useRef<string>("");

  const act = async (run: () => Promise<EmailResult>, busyLabel: string): Promise<boolean> => {
    setBusy(busyLabel);
    setError(null);
    const answer = await run();
    setBusy(null);
    if (answer.stepUp) {
      again.current = run;
      label.current = busyLabel;
      setNeed(answer.stepUp);
      return false;
    }
    if (answer.error) {
      setError(answer.error);
      return false;
    }
    /*
     * R16.1. A disconnect leaves the round trip's message in the address,
     * where a reload would bring it back. The screen is the same one, so the
     * address is tidied rather than navigated.
     */
    if (answer.went && typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    router.refresh();
    return true;
  };

  const codeBox = (
    <StepUpDialog
      need={need}
      onDone={() => {
        setNeed(null);
        const waiting = again.current;
        again.current = null;
        if (waiting) void act(waiting, label.current);
      }}
      onCancel={() => {
        setNeed(null);
        again.current = null;
      }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <Working open={busy !== null} label={busy ?? ""} />
      {codeBox}

      {/* R16.1. The vendor's own words. A volunteer whose app password was
          refused needs to read "Username and Password not accepted" rather
          than a sentence of ours that stands in front of it. */}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {sent ? <Banner tone="success">{sent}</Banner> : null}

      {provider ? (
        <Connected
          provider={provider}
          domain={domain}
          registrar={registrar}
          console_={console_}
          steps={steps}
          onepress={onepress}
          signedInAs={signedInAs}
          busy={busy !== null}
          onCheck={() => void quietly(checkRecords)}
          onTest={(to) => void test(to)}
          onDisconnect={() => void act(disconnectEmail, t("email.saving"))}
        />
      ) : way === "resend" ? (
        <ResendPath
          church={church}
          busy={busy !== null}
          onBack={() => setWay(null)}
        />
      ) : (
        <section className="flex flex-col gap-4">
          {/* R24.6. The screen opens on the question rather than on two cards
              a church has to work out the point of. */}
          <h3 className="m-0 font-display text-[18px] leading-6 text-fg">{t("email.choose")}</h3>

          <div className="grid gap-4 md:grid-cols-2" data-guide="connect-email">
            {/* A church picking between its own mail server and a sending
                service cannot pick without being told the difference, so each
                card says what that option does. */}
            <Choice
              icon={<Server />}
              title={t("email.smtp.title")}
              what={t("email.smtp.what")}
              action={
                <SmtpSheet
                  church={church}
                  busy={busy !== null}
                  onSave={(data) => act(() => connectSmtp(data), t("email.testing"))}
                />
              }
            />
            <Choice
              icon={<Mail />}
              title={t("email.resend.title")}
              what={t("email.resend.what")}
              /* Nobody has heard of Resend, so the card offers a look at it
                 before it asks a church to open an account there. */
              learn={{ href: "https://resend.com", label: t("email.resend.learn") }}
              action={
                <Button onClick={() => setWay("resend")}>{t("email.resend.connect")}</Button>
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Choice({
  icon,
  title,
  what,
  learn,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  what: string;
  /** Somewhere to read about a company a church has never heard of. */
  learn?: { href: string; label: string };
  action: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <span className="grid size-9 place-items-center rounded-[10px] bg-sunken text-fg-muted [&_svg]:size-[18px]">
        {icon}
      </span>
      <h3 className="m-0 font-display text-[17px] leading-6 text-fg">{title}</h3>
      <p className="m-0 flex-1 text-fg-muted">{what}</p>

      {learn ? (
        <a
          href={learn.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 self-start font-medium text-primary underline-offset-2 hover:underline"
        >
          {learn.label} <ExternalLink className="size-[14px]" aria-hidden />
        </a>
      ) : null}

      <div className="flex">{action}</div>
    </Card>
  );
}

function Connected({
  provider,
  domain,
  registrar,
  console_,
  steps,
  onepress,
  signedInAs,
  busy,
  onCheck,
  onTest,
  onDisconnect,
}: {
  provider: EmailProvider;
  signedInAs: string;
  domain: DomainState | null;
  registrar: string | null;
  console_: string | null;
  /** What to press at this company, in its own menu words. */
  steps: string;
  onepress: string | null;
  busy: boolean;
  onCheck: () => void;
  onTest: (to: string) => void;
  onDisconnect: () => void;
}) {
  /* A church connected to Resend with nothing published yet is not sending,
     and a card headed "Sending through Resend" over a list of settings it has
     not added says the opposite of what is true. */
  const waiting = provider.vendor === "resend" && domain !== null && domain.state !== "verified";

  return (
    <Card className="flex flex-col gap-5 p-5">
      {/* R24.6. Resend is three stages, and a church part way through wants to
          see which one it is on rather than wonder whether the screen is
          finished with it. The mail server a church already has is one thing,
          so it shows none of this. */}
      {provider.vendor === "resend" ? (
        <div className="mx-auto w-full max-w-[520px] px-6 pb-1 pt-1">
          <Stages labels={RESEND_STAGES} at={waiting ? 2 : 3} />
        </div>
      ) : null}

      {waiting && domain ? (
        <Records
          domain={domain}
          registrar={registrar}
          console_={console_}
          steps={steps}
          onepress={onepress}
          onCheck={onCheck}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="inline-flex items-center gap-2 font-display text-[17px] leading-6 text-fg">
              <Check className="size-4 text-primary" aria-hidden />
              {provider.vendor === "smtp"
                ? t("email.connected.smtp", { host: provider.settings?.host ?? "" })
                : t("email.connected.resend")}
            </span>
            <span className="text-fg-muted">
              {t("email.sendingAs")}{" "}
              <span className="font-medium text-fg">
                {provider.fromName
                  ? `${provider.fromName} <${provider.fromAddress ?? ""}>`
                  : (provider.fromAddress ?? "")}
              </span>
            </span>
          </div>

        </div>
      )}

      {/* R24.6. Rare, final, and nothing to do with the stage the church is
          on, so it sits under the work rather than in the row of things the
          church came here to press. The test sits beside it, offered only once
          there is something that could actually carry a message. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {waiting ? <span /> : (
          <TestDialog signedInAs={signedInAs} busy={busy} onSend={onTest} />
        )}
        <DisconnectDialog vendor={provider.vendor} busy={busy} onConfirm={onDisconnect} />
      </div>
    </Card>
  );
}

/**
 * HRT-290, R24.6. Where the test goes.
 *
 * A dialog rather than a panel, because nothing is being written down: it is a
 * press with one question attached, and the answer is usually the address
 * already in the box.
 */
function TestDialog({
  signedInAs,
  busy,
  onSend,
}: {
  signedInAs: string;
  busy: boolean;
  onSend: (to: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState(signedInAs);

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setTo(signedInAs); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={busy}>
          <Send aria-hidden /> {t("email.test")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("email.test")} closeLabel={t("common.close")}>
        <Field label={t("email.test.to")} required>
          <Input
            value={to}
            onChange={(e) => setTo(e.currentTarget.value)}
            inputMode="email"
            autoComplete="off"
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!to.trim()}
            onClick={() => {
              setOpen(false);
              onSend(to.trim());
            }}
          >
            {t("email.test")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisconnectDialog({
  vendor,
  busy,
  onConfirm,
}: {
  vendor: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* A standalone action, so it keeps its words. */}
        <LinkButton disabled={busy} className="gap-1.5 text-fg-muted no-underline hover:underline">
          <Unplug className="size-[15px]" aria-hidden />
          {t(`email.disconnect.${vendor === "resend" ? "resend" : "smtp"}` as never)}
        </LinkButton>
      </DialogTrigger>
      {/* R24.6. A destructive confirmation earns its title and its buttons.
          The sentence that was under it said what Disconnect plainly does. */}
      <DialogContent
        title={t(`email.disconnect.ask.${vendor === "resend" ? "resend" : "smtp"}` as never)}
        closeLabel={t("common.close")}
      >
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {t("email.disconnect")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * R16.1. The three settings, exactly as Resend generated them.
 *
 * The key goes at the root and the other two on a `send.` name, so the
 * church's own mail, the one its inbox runs on, is never touched.
 *
 * No banner over them. Where the church has got to is the stages at the top of
 * the card, and saying it twice in a coloured strip put two answers to one
 * question on one screen.
 */
function Records({
  domain,
  registrar,
  console_,
  steps,
  onepress,
  onCheck,
}: {
  domain: DomainState;
  /** R22.2. The company that answers for the domain, where we know it. */
  registrar: string | null;
  /** The page at that company where these are typed in. */
  console_: string | null;
  /** The catalogue key for what to press once they are there. */
  /** What to press at this company, in its own menu words. */
  steps: string;
  /** R22.2. Where the DNS company can write them itself, the address to send
      the church to. Null everywhere else, and the press is not drawn. */
  onepress: string | null;
  onCheck: () => void;
}) {
  /*
   * R24.6. It reads DNS itself rather than asking the church to press a thing
   * called Check again.
   *
   * A church adds the records in another tab and comes back to this one, so
   * coming back is read straight away, and a tab left open reads every half
   * minute. Nothing is read while the tab is in the background: a screen
   * nobody is looking at has nobody to tell.
   */
  const check = React.useRef(onCheck);
  check.current = onCheck;

  React.useEffect(() => {
    const read = () => {
      if (document.visibilityState === "visible") check.current();
    };
    const timer = window.setInterval(read, 30_000);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* R22.2. Named, because "your domain provider" is still a company
            somebody has to recognise before they can open it. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="m-0 text-fg">
            {/* However many Resend asked for. It was three when this was
                written and is four now, and a church counting the rows
                against the sentence is a church that stops trusting it. */}
            {registrar
              ? plural("email.records.lead", domain.records.length, { name: registrar })
              : plural("email.records.leadPlain", domain.records.length)}
          </p>
          {/* R22.2. What to press once they are there, in that company's own
              menu words. A church told to "add a TXT record at your DNS
              provider" goes looking for a thing called DNS on a screen that
              calls it something else. */}
          <p className="m-0 text-fg-muted">{steps}</p>
        </div>
        {onepress ? null : registrar && console_ ? (
          <a
            href={console_}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1.5 font-medium text-primary underline underline-offset-4 hover:no-underline"
          >
            {t("email.records.open", { name: registrar })}
            <ExternalLink className="size-[14px]" aria-hidden />
          </a>
        ) : null}
      </div>

      {/* R22.2. Where the company can do it, the three rows are still there,
          because a church that would rather look first should be able to.
          They sit under the press rather than in front of it. */}
      {onepress ? (
        <div className="flex flex-col items-start gap-2 rounded-[12px] border border-line bg-sunken/40 p-4">
          <Button asChild>
            <a href={onepress}>{t("email.records.onepress")}</a>
          </Button>
          <span className="text-fg-muted">{t("email.records.onepressWhat")}</span>
        </div>
      ) : null}

      {/* One row a setting: the kind, the name, the value. A registrar's form
         asks for those three and nothing else, and three bordered blocks for
         three short values filled the screen with edges. */}
      <ul className="m-0 flex list-none flex-col divide-y divide-line rounded-[12px] border border-line p-0">
        {domain.records.map((record) => (
          <li
            key={`${record.type}-${record.host}`}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2"
          >
            <span className="w-[58px] shrink-0 font-mono text-[11px] text-fg-subtle">
              {record.type}
            </span>
            <Copyable value={record.host} label={t("email.record.host")} width="w-[180px]" />
            <Copyable value={record.value ?? ""} label={t("email.record.value")} />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle">
          {plural("email.watching", domain.records.length)}
          {domain.checkedAt ? ` · ${t("email.checkedAt", { when: when(domain.checkedAt) })}` : ""}
        </span>
      </div>
    </section>
  );
}

/**
 * R24.6. An action in a row of links, drawn as one.
 *
 * Beside "Open Vercel", a ghost button is a word in the body colour with no
 * mark on it, and the two read as a link and a label rather than as two things
 * to press.
 */
const LinkButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function LinkButton({ className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={[
        "inline-flex min-h-[var(--d-tap)] cursor-pointer items-center rounded-md px-2",
        "font-medium text-primary underline underline-offset-4",
        "hover:no-underline disabled:cursor-default disabled:opacity-45",
        className ?? "",
      ].join(" ")}
      {...rest}
    />
  );
});

/** A value somebody retypes somewhere else, which means they copy it. */
function Copyable({
  label,
  value,
  width,
}: {
  label: string;
  value: string;
  /** The name is short and the value is long, so they are not given equal room. */
  width?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className={`flex min-w-0 items-center gap-1 ${width ?? "flex-1"}`}>
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-[var(--d-radius-control)] border border-line bg-sunken/40 px-2 py-1 font-mono text-[11px] text-fg outline-none"
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
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-sunken hover:text-fg [&_svg]:size-3.5"
        >
          {copied ? <Check className="text-primary" /> : <Copy />}
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * The two fields both vendors need, asked in the same words in both panels.
 *
 * Filled in from what the church already told us on its own profile, because
 * asking a church its own name twice is asking it to wonder which answer this
 * screen means.
 */
function Sender({ church }: { church: { name: string; email: string } }) {
  return (
    <>
      <Field label={t("email.from.name")}>
        <Input
          name="fromName"
          defaultValue={church.name}
          autoComplete="off"
          placeholder={t("email.from.namePlaceholder")}
        />
      </Field>
      <Field label={t("email.from.address")} required>
        <Input
          data-guide="email-from"
          name="fromAddress"
          defaultValue={church.email}
          autoComplete="off"
          inputMode="email"
          placeholder={t("email.from.addressPlaceholder")}
        />
      </Field>
    </>
  );
}

function SmtpSheet({
  church,
  busy,
  onSave,
}: {
  church: { name: string; email: string };
  busy: boolean;
  onSave: (data: FormData) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const formId = React.useId();
  const full = useAnswered(formId, open);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setDirty(false);
  };
  const { onOpenChange, guard } = usePanelGuard({ dirty, setOpen: close });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button>{t("email.smtp.connect")}</Button>
      </SheetTrigger>
      <SheetContent
        title={t("email.smtp.connect")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              {t("action.cancel")}
            </Button>
            <Button data-guide="email-connect" type="submit" form={formId} disabled={busy || !dirty || !full}>
              {t("email.connect")}
            </Button>
          </>
        }
      >
        {guard}

        <form
          id={formId}
          onInput={() => setDirty(true)}
          /*
           * Submitted by hand rather than through the form's `action`, because
           * React empties an uncontrolled form once an action returns. A mail
           * server that refused the password would have left the volunteer
           * retyping the host, the port and the username to change one field.
           */
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onSave(data).then((ok) => {
              if (ok) close(false);
            });
          }}
          noValidate
          className="flex flex-col gap-4"
        >
          <Sender church={church} />

          <Field label={t("email.smtp.host")} required>
            <Input data-guide="smtp-host" name="host" autoComplete="off" placeholder={t("email.smtp.hostPlaceholder")} />
          </Field>

          {/* Typed rather than chosen. 587 and 465 cover nearly every church,
              and the ones they do not cover are on 2525 or 2587 because their
              host blocks the usual two, which a list of three would refuse. */}
          <Field label={t("email.smtp.port")} required>
            <Input data-guide="smtp-port" name="port" defaultValue="587" inputMode="numeric" autoComplete="off" />
          </Field>

          <Field label={t("email.smtp.username")} required>
            <Input
              data-guide="smtp-username"
              name="username"
              autoComplete="off"
              placeholder={t("email.smtp.usernamePlaceholder")}
            />
          </Field>

          <Field label={t("email.smtp.password")} required>
            <Input data-guide="smtp-password" name="password" type="password" autoComplete="new-password" />
          </Field>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * R22.2. The four stages of connecting Resend, in one place.
 *
 * Both cards draw them, the one before the connection and the one after, so
 * a church reads the same four words wherever it has got to.
 */
const RESEND_STAGES = [
  t("email.stage.connect"),
  t("email.stage.records"),
  t("email.stage.done"),
];

/**
 * HRT-288, R16.1. The Resend path, which is two things in order.
 *
 * On the screen rather than in a panel, because the second thing happens
 * somewhere else entirely, at the company that answers for the church's
 * domain, and a church comes back to this screen to finish it. A panel that
 * opened, sent somebody to Resend and was gone when they returned would have
 * told them nothing about where they had got to.
 */
function ResendPath({
  church,
  busy,
  onBack,
}: {
  church: { name: string; email: string };
  busy: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  /* Where Resend was sent to, kept so the consent screen can be opened again
     without the church retyping anything. */
  const [going, setGoing] = React.useState<string | null>(null);
  /*
   * R22.2. Signing in at Resend is its own step, ahead of everything else.
   *
   * Resend's consent screen handles a sign-in and does not handle a sign-up:
   * a church with no account is taken through one and left on a dashboard,
   * with the permission never asked for. Getting that out of the way first
   * means the press that matters meets a church Resend already knows.
   */
  const [signedIn, setSignedIn] = React.useState(false);
  const formId = React.useId();
  const full = useAnswered(formId);

  /*
   * R16.1. Resend is opened in a tab of its own, so this one is still here
   * when the church comes back.
   *
   * It matters most to a church that has no Resend account yet: Resend asks
   * them to sign up, lands them on its own dashboard rather than back on the
   * consent screen, and the tab they started in would have gone with it.
   * This one waits, says what to do, and reads again when they return to it.
   */
  React.useEffect(() => {
    if (!going) return;
    const look = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", look);
    return () => {
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", look);
    };
  }, [going, router]);

  /*
   * R16.1. One tab for Resend, reused.
   *
   * Every press mints a fresh authorisation request, and Resend retires the
   * one before it. Opening a tab each time left the earlier ones sitting on
   * a dead request, saying "This authorization request is no longer active"
   * at somebody who had done nothing wrong. A named target puts the new
   * request in the tab the old one was in.
   */
  const open = (where: string) => {
    /*
     * `noopener` in the features string makes the browser ignore the name and
     * create a new context every time, and clearing the opener afterwards
     * removes the window from the browsing context group the name is looked up
     * in. Neither is used, because reusing the named tab is the point here and
     * the target is Resend.
     */
    window.open(where, "connectapp-resend");
  };

  /*
   * R22.2. Connecting is one errand with two parts, in one card.
   *
   * Signing in at Resend has to happen first: its consent screen handles a
   * sign-in but not a sign-up, so a church sent straight there lands on a
   * dashboard with the permission never requested. Splitting that into two
   * stages reads as twice the work, so one card reveals the second part once
   * the first is answered.
   *
   * Nothing here can tell whether they really signed in. Resend is somewhere
   * else and we cannot see their session. What answers that question is the
   * consent screen itself, which is why the way back to these two doors
   * stays on the card after they say they are through.
   */
  if (!going) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        {/* R24.6. The way out, where a reader looks for it. */}
        <IconButton
          label={t("action.back")}
          variant="ghost"
          className="-mt-1 -ml-1 self-start"
          onClick={onBack}
        >
          <ArrowLeft />
        </IconButton>

        <div className="mx-auto w-full max-w-[460px] px-6 pt-1">
          <Stages labels={RESEND_STAGES} at={1} />
        </div>

        {/* R22.2. The doors into Resend, until the church says it is through
            them. Once it has, this is answered and what is left is the one
            thing still to fill in. */}
        {signedIn ? null : (
          <div className="mx-auto flex w-full max-w-[460px] flex-col gap-4">
            {/* The sentence says what to do and the dots say which stage this
                is, so a heading repeating the first door's words sat between
                them saying neither. */}
            <p className="m-0 text-fg-muted">{t("email.resend.signin.body")}</p>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* R22.2. Two doors rather than one, because a church that has no
                  account and a church that has one are looking for different
                  words. They stay here once the form is open: somebody who said
                  they were through and was not comes back to them. */}
              <Button
                type="button"
                variant="secondary"
                onClick={() => open("https://resend.com/signup")}
              >
                {t("email.resend.signin.up")}
                <ExternalLink className="size-[14px]" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => open("https://resend.com/login")}
              >
                {t("email.resend.signin.in")}
                <ExternalLink className="size-[14px]" aria-hidden />
              </Button>
              {signedIn ? null : (
                <Button
                  data-guide="resend-signedin"
                  /* The other two doors are to its left, so the card goes
                     underneath rather than over them. */
                  data-guide-side="below"
                  type="button"
                  onClick={() => setSignedIn(true)}
                >
                  {t("email.resend.signin.done")}
                </Button>
              )}
            </div>
          </div>
        )}

        {signedIn ? (
          <>
            <form
              id={formId}
              /* It leaves the product rather than saving anything, and the
                 whole handshake is set up on the server: the browser never
                 holds anything Resend would accept. */
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const where = new URL("/api/providers/resend/start", window.location.origin);
                where.searchParams.set("from", String(data.get("fromAddress") ?? ""));
                where.searchParams.set("name", String(data.get("fromName") ?? ""));
                setGoing(where.toString());
                open(where.toString());
              }}
              noValidate
              className="mx-auto flex w-full max-w-[460px] flex-col gap-4"
            >
              {/* R21.15. What the church is agreeing to is on Resend's own
                  screen, in its words, at the moment it is agreed to. Saying
                  it here as well was a banner over a form with two boxes in
                  it. */}
              <Sender church={church} />

              <p className="m-0 text-fg-muted">{t("email.resend.free")}</p>

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button data-guide="resend-go" type="submit" disabled={busy || !full}>
                  {t("email.resend.go")}
                </Button>
              </div>
            </form>
          </>
        ) : null}
      </Card>
    );
  }

  if (going) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        {/* R24.6. Nothing is behind this on the dots, so the way out is here:
            a church that cannot finish at Resend has to be able to leave. */}
        <IconButton
          label={t("action.back")}
          variant="ghost"
          className="-mt-1 -ml-1 self-start"
          onClick={() => setGoing(null)}
        >
          <ArrowLeft />
        </IconButton>

        <div className="mx-auto w-full max-w-[460px] px-6 pt-1">
          <Stages labels={RESEND_STAGES} at={1} />
        </div>

        <div className="mx-auto flex w-full max-w-[460px] flex-col gap-4">
          <span className="inline-flex items-center gap-2 font-display text-[17px] leading-6 text-fg">
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
            />
            {t("email.resend.waiting")}
          </span>
          <p className="m-0 text-fg-muted">{t("email.resend.waitingBody")}</p>

          {/* R22.2. The other way this goes, said before the church has to
              work it out: Resend takes a new account through sign-up and
              leaves it on a dashboard, with the permission never asked for. */}
          <Banner tone="info">{t("email.resend.waitingNew")}</Banner>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                {t("email.resend.waitingCheck")}
              </Button>
              <Button data-guide="resend-authorise" type="button" onClick={() => open(going)}>
                {t("email.resend.waitingAgain")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return null;
}
