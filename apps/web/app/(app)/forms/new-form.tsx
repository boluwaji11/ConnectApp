"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Sheet, SheetTrigger, SheetContent } from "@connectapp/ui";
import { t, plural, type MessageKey } from "@connectapp/i18n";
import { LibraryPicker } from "@/components/library-picker";
import { FORM_TEMPLATES } from "@connectapp/db/rules";
import { newForm } from "./actions";

/**
 * R4.1, R4.8. Where a form starts.
 *
 * A blank one, or one of the six a church writes anyway. The templates are the
 * point: a connection card that already asks for an email and already writes
 * it onto a person's record is a working form in one press, where a blank page
 * is an hour of guessing which questions matter.
 */
/*
 * R4.8, R20.1. The template names, written down beside the screen.
 *
 * `FORM_TEMPLATES` lives in `@connectapp/db`, and the client catalogue's
 * extractor follows this app's own files rather than a package's, so a name
 * read straight off the table reached the browser as its own key and the panel
 * listed "template.connection" to the church. Every other library keeps its
 * labels beside the screen for the same reason. A missing entry falls back to
 * the table, and `client-catalogue.test.ts` fails if one is left out.
 */
const TEMPLATE_NAME: Record<string, MessageKey> = {
  connection: "template.connection",
  prayer: "template.prayer",
  membership: "template.membership",
  volunteer: "template.volunteer",
  child: "template.child",
  facility: "template.facility",
};

export function NewFormButton({ church }: { church: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const start = (template?: string) =>
    startTransition(async () => {
      const result = await newForm({ name: t("form.untitled") }, church, template);
      if (result.id) {
        setOpen(false);
        router.push(`/forms/${result.slug ?? result.id}`);
      }
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button">
          <Plus /> {t("form.new")}
        </Button>
      </SheetTrigger>

      <SheetContent title={t("form.start")} closeLabel={t("common.close")} width="560px">
        {/* R4.1, R4.8. The same shape as tags, group types and the rest:
            writing your own leads, and the six a church keeps anyway hang
            off it. They were a grid of tiles, which read as six equal
            choices with the blank form hidden among them. */}
        <LibraryPicker
          ownLabel={t("form.ownForm")}
          items={FORM_TEMPLATES.map((one) => ({
            key: one.key,
            label: t(TEMPLATE_NAME[one.key] ?? one.name),
            detail: plural("form.questions", one.questions.length),
          }))}
          onOwn={() => start()}
          onPick={(item) => start(item.key)}
          busy={pending}
        />
      </SheetContent>
    </Sheet>
  );
}
