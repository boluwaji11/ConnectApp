"use client";

import * as React from "react";
import { Field, Input } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import type { Campus } from "@connectapp/db";

/**
 * R1.2. Where this church meets.
 *
 * One campus, named. No campus picker anywhere: a church of 180 has one site,
 * and a question with one answer is not a question. Every person, household,
 * team, group and check-in room carries this campus, so the name is the one
 * thing worth editing. The schema holds the shape for the day that changes.
 *
 * The places inside a campus come back with facility booking (R15.4), which is
 * where a place is the thing somebody reserves a room inside.
 */
export function Places({
  campus,
  canEdit,
  editing,
}: {
  campus: Campus | null;
  canEdit: boolean;
  /** Driven by the pencil on Details, so one press opens the whole page. */
  editing: boolean;
}) {
  if (!campus) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-5">
      <span className="font-semibold text-fg">{t("place.title")}</span>

      {editing && canEdit ? (
        /*
         * R24.6. This box belongs to the church form beside it.
         *
         * It used to save itself on blur, so Save changes never noticed it had
         * been typed in and stayed greyed out while the screen clearly held an
         * edit. `form` associates an input with a form it is not inside:
         * `new FormData(form)` picks it up, which is what the dirty check
         * reads, and it is submitted with everything else.
         */
        <Field label={t("place.campus")} required>
          <Input
            name="campusName"
            form="church-form"
            defaultValue={campus.name}
            autoComplete="off"
          />
        </Field>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="text-label text-fg-subtle">{t("place.campus")}</span>
          <span className="text-[length:var(--d-text-body)] text-fg">{campus.name}</span>
        </div>
      )}
    </section>
  );
}
