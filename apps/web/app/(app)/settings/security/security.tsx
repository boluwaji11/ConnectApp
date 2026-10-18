"use client";

import * as React from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { Banner, Button, Field, Input } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { Said } from "@/components/said";
import { SettingCard } from "../card";
import { changeEmail, changePassword, emailMeALink } from "./actions";
import { useFormError } from "@/lib/form-error";
import { useAnswered } from "@/components/form-actions";

/**
 * R1.8. The two things somebody changes about how they get in.
 *
 * Both are shut until they are asked for. A screen that opens with a password
 * box and an email box on it reads as a form to fill in, and this is a screen
 * most members open to check something rather than to change it.
 *
 * Both ask for the current password. Supabase will take either change on the
 * strength of an open session, and an open session is a laptop somebody walked
 * away from.
 */
export function Security({
  email,
  open,
  onOpen,
}: {
  email: string;
  /** Which card is open, decided above so only one ever is. */
  open: "email" | "password" | null;
  onOpen: (which: "email" | "password" | null) => void;
}) {
  const [error, setError] = useFormError(open);
  const [message, setMessage] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();
  /* Which of the three was pressed, so the other two stay as they are. */
  const [doing, setDoing] = React.useState<string>();

  const emailForm = React.useId();
  const passwordForm = React.useId();
  const emailFull = useAnswered(emailForm, open === "email");
  const passwordFull = useAnswered(passwordForm, open === "password");

  React.useEffect(() => {
    if (!pending) setDoing(undefined);
  }, [pending]);

  const run = (key: string, work: () => Promise<{ error?: string }>, said: string) => {
    setDoing(key);
    startTransition(async () => {
      setError(undefined);
      setMessage(undefined);
      const result = await work();
      setError(result.error);
      if (!result.error) {
        setMessage(said);
        onOpen(null);
      }
    });
  };

  const toggle = (which: "email" | "password") => {
    setError(undefined);
    setMessage(undefined);
    onOpen(open === which ? null : which);
  };

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Said message={message} onClose={() => setMessage(undefined)} />

      <SettingCard
        icon={<Mail />}
        title={t("email.title")}
        lede={email}
        onPress={() => toggle("email")}
        expanded={open === "email"}
      >
        {open === "email" ? (
          <form
            id={emailForm}
            noValidate
            action={(data) => run("email", () => changeEmail(data), t("email.sent"))}
            className="flex flex-col gap-4"
          >
            <div>
              <h3 className="text-[15px] font-bold text-fg">{t("email.changeTitle")}</h3>
              <p className="text-[13px] text-fg-muted">{t("email.changeLede")}</p>
            </div>

            <Field label={t("email.new")} required>
              <Input name="email" type="email" autoComplete="email" placeholder={t("email.hint")} autoFocus />
            </Field>

            <Field label={t("twoStep.confirmPassword")} required>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={t("email.passwordHint")}
              />
            </Field>

            <Button
              type="submit"
              className="self-start"
              loading={doing === "email"}
              disabled={pending || !emailFull}
            >
              {t("email.save")}
            </Button>
          </form>
        ) : undefined}
      </SettingCard>

      <SettingCard
        icon={<KeyRound />}
        title={t("password.title")}
        lede={t("password.cardLede")}
        onPress={() => toggle("password")}
        expanded={open === "password"}
      >
        {open === "password" ? (
          <div className="flex flex-col gap-4">
            <form
              id={passwordForm}
              noValidate
              action={(data) => run("password", () => changePassword(data), t("password.changed"))}
              className="flex flex-col gap-4"
            >
              <div>
                <h3 className="text-[15px] font-bold text-fg">{t("password.changeTitle")}</h3>
                <p className="text-[13px] text-fg-muted">{t("password.changeLede")}</p>
              </div>

              <Field label={t("password.current")} required>
                <Input
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t("password.current")}
                  autoFocus
                />
              </Field>

              <Field label={t("password.new")} required hint={t("password.newHint")}>
                <Input
                  name="next"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("password.new")}
                />
              </Field>

              <Field label={t("password.confirm")} required>
                <Input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("password.confirmHint")}
                />
              </Field>

              <Button
                type="submit"
                className="self-start"
                loading={doing === "password"}
                disabled={pending || !passwordFull}
              >
                {t("password.update")}
              </Button>
            </form>

            {/* R1.8. For somebody who has only ever signed in by email link and
                has no current password to type above. */}
            <button
              type="button"
              onClick={() => run("link", () => emailMeALink(), t("email.sent"))}
              disabled={pending}
              className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("password.forgot")} <ArrowRight aria-hidden className="size-4" />
            </button>
          </div>
        ) : undefined}
      </SettingCard>
    </div>
  );
}
