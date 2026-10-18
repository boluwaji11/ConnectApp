"use client";

import * as React from "react";
import { Banner, Button, Field, Input } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { submitCode, submitRecovery } from "./actions";
import { useFormError } from "@/lib/form-error";

/**
 * R1.8. The second step of signing in.
 *
 * One box, six digits, and a way through when the phone is gone. The code box
 * takes a paste of a code with a space in it, because an authenticator app
 * shows "123 456" and that is what people copy.
 *
 * `inputMode="numeric"` and `autoComplete="one-time-code"` are what make a
 * phone offer the code from the notification instead of a keyboard.
 */
export function CodeForm({
  next,
  gone,
}: {
  next?: string;
  gone?: boolean;
}) {
  /* R1.8. Supabase holds no factor to present, so the recovery code is the
     only way through and the screen opens on it rather than on a box nothing
     can answer. */
  const [recovery, setRecovery] = React.useState(Boolean(gone));
  const [error, setError] = useFormError(recovery);
  const [pending, startTransition] = React.useTransition();
  const [code, setCode] = React.useState("");

  const ready = recovery ? code.trim().length > 0 : code.replace(/\D/g, "").length === 6;

  const send = (data: FormData) => {
    startTransition(async () => {
      setError(undefined);
      const result = recovery ? await submitRecovery(data) : await submitCode(data);
      setError(result?.error);
    });
  };


  const swap = () => {
    setError(undefined);
    setCode("");
    setRecovery((was) => !was);
  };

  return (
    <form noValidate action={send} className="flex flex-col gap-5" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {recovery ? (
        <>
          <p className="text-sm text-muted-foreground">{t("twoStep.recoveryLede")}</p>
          <Field label={t("twoStep.recoveryLabel")} required>
            <Input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoFocus
              spellCheck={false}
            />
          </Field>
        </>
      ) : (
        <Field label={t("twoStep.code")} required>
          <Input
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            spellCheck={false}
            className="text-center text-xl tracking-[0.4em]"
          />
        </Field>
      )}

      <Button type="submit" full loading={pending} disabled={pending || !ready}>
        {t("twoStep.confirm")}
      </Button>

      {gone ? null : (
      <button
        type="button"
        onClick={swap}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {recovery ? t("twoStep.useApp") : t("twoStep.useRecovery")}
      </button>
      )}
    </form>
  );
}
