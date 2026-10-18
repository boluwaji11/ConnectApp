"use client";

import * as React from "react";
import { Banner, Button, Field, Input } from "@connectapp/ui";
import { submitCode } from "./actions";

/** HRT-439. The six digits that finish signing in to the portal. */
export function CodeForm() {
  const [error, setError] = React.useState<string>();
  const [code, setCode] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const send = (data: FormData) =>
    startTransition(async () => {
      setError(undefined);
      const result = await submitCode(data);
      setError(result?.error);
    });

  return (
    <form noValidate action={send} className="flex flex-col gap-4" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <Field label="Six-digit code" required>
        <Input
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, "").slice(0, 7))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="text-center text-title tracking-[0.4em]"
        />
      </Field>

      <Button
        type="submit"
        full
        loading={pending}
        disabled={pending || code.replace(/\D/g, "").length !== 6}
      >
        Confirm
      </Button>
    </form>
  );
}
