"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Plus, Trash2, Type, Hash, Calendar, List, ListChecks, ToggleLeft } from "lucide-react";
import {
  Banner, Button, IconButton, Input, Field, Spinner,
  Dialog, DialogTrigger, DialogContent, DialogFooter,
  Sheet, SheetTrigger, SheetContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Checkbox,
} from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { addField, saveField, removeField } from "@/app/fields/actions";
import { Confirm } from "@/components/confirm";
import { useFormError } from "@/lib/form-error";
import { usePanelGuard } from "@/components/panel-guard";
import { FIELD_LIBRARY, presetValues, type FieldPreset } from "./library";

export interface FieldItem {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string[] | null;
  memberEditable?: boolean;
}

const TYPES = [
  { value: "text", icon: Type },
  { value: "number", icon: Hash },
  { value: "date", icon: Calendar },
  { value: "select", icon: List },
  { value: "multi_select", icon: ListChecks },
  { value: "boolean", icon: ToggleLeft },
] as const;

type FieldTypeValue = (typeof TYPES)[number]["value"];
const isKnownType = (type: string): type is FieldTypeValue =>
  TYPES.some((x) => x.value === type);

/** An unknown type renders its raw name rather than an empty cell. */
const typeLabel = (type: string): string => (isKnownType(type) ? t(`fieldType.${type}`) : type);
const hasChoices = (type: string) => type === "select" || type === "multi_select";

/** The icon for the shape an answer takes, which reads faster than the word. */
const iconFor = (type: string) => TYPES.find((one) => one.value === type)?.icon ?? Type;

/**
 * R1.10. Every extra detail this church keeps on a person.
 *
 * A row per field: what it is called, the shape its answer takes, and the
 * choices where it offers any. The whole row opens it in the right-hand pane,
 * which is where everything else in the product is edited.
 */
export function FieldManager({
  church,
  fields,
  canManage,
}: {
  church: string;
  fields: FieldItem[];
  canManage: boolean;
}) {
  if (fields.length === 0) return null;

  return (
    <section className="rounded-[14px] border border-line bg-surface px-5 py-1">
      {fields.map((field) => {
        const Icon = iconFor(field.type);

        return (
          <div
            key={field.id}
            className="relative flex min-h-14 items-center gap-3 border-b border-sunken py-2 last:border-0"
          >
            {canManage ? (
              <FieldSheet church={church} field={field} taken={fields.map((one) => one.label)}>
                <button
                  type="button"
                  aria-label={t("fields.editOne", { name: field.label })}
                  className="absolute inset-0 cursor-pointer rounded-md"
                />
              </FieldSheet>
            ) : null}

            <span className="pointer-events-none relative grid size-9 shrink-0 place-items-center rounded-[10px] bg-sunken text-fg-muted">
              <Icon className="size-[18px]" aria-hidden />
            </span>

            <span className="pointer-events-none relative min-w-0 flex-1">
              <span className="block font-medium text-fg">{field.label}</span>
              {field.options ? (
                <span className="block truncate text-[12px] text-fg-subtle">
                  {field.options.join(", ")}
                </span>
              ) : null}
            </span>

            <span className="pointer-events-none relative flex h-6.5 shrink-0 items-center rounded-full bg-sunken px-2.5 text-[12px] font-medium text-fg-muted">
              {typeLabel(field.type)}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/** One choice per line. A textarea beats a repeating row builder for six items. */
function Choices({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  // The form sends one choice per line, which is what the server already reads.
  const lines = value === "" ? [""] : value.split("\n");
  const write = (next: string[]) => onChange(next.join("\n"));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-fg">{t("fields.choices")}</span>
      <input type="hidden" name="options" value={value} />

      <ol className="m-0 flex list-none flex-col p-0">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex w-5 shrink-0 flex-col items-center" aria-hidden>
              <span className="grid size-5 shrink-0 place-items-center rounded-full border border-primary/40 bg-surface text-[10px] font-semibold text-primary">
                {i + 1}
              </span>
              {i === lines.length - 1 ? null : (
                <span className="relative my-1 w-px flex-1 bg-primary/40">
                  <span className="absolute top-1/2 left-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                </span>
              )}
            </span>

            <div className="flex min-w-0 flex-1 items-start gap-2 pb-3">
              <input
                value={line}
                aria-label={t("fields.choice")}
                autoComplete="off"
                placeholder={t("fields.choicesPlaceholder")}
                className="-mt-1 min-w-0 flex-1 rounded-sm border-b border-line bg-transparent px-1 py-1 text-[length:var(--d-text-body)] text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                onChange={(e) => write(lines.map((was, at) => (at === i ? e.target.value : was)))}
              />

              {lines.length > 1 ? (
                <Confirm
                  title={t("fields.choice.removeTitle", { name: line || t("fields.choice") })}
                  body={t("fields.choice.removeBody")}
                  confirmLabel={t("fields.choice.removeAction")}
                  onConfirm={() => write(lines.filter((_, at) => at !== i))}
                  trigger={
                    <IconButton
                      label={t("fields.choice.remove")}
                      variant="ghost"
                      className="-mt-2.5"
                    >
                      <Trash2 />
                    </IconButton>
                  }
                />
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => write([...lines, ""])}
      >
        <Plus /> {t("fields.choice.add")}
      </Button>
    </div>
  );
}

/**
 * R1.10. A field's name, the shape of its answer, and its choices.
 *
 * Adding and editing ask the same thing, so they are the same pane. The type is
 * fixed once a field exists: answers are already stored against it, and turning
 * a date into a list would leave every one of them unreadable.
 */
function FieldSheet({
  church,
  field,
  taken,
  children,
}: {
  church: string;
  /** The field being changed, or nothing when one is being added. */
  field?: FieldItem;
  /** What this church already keeps, so the library does not offer it twice. */
  taken: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState(field?.type ?? "text");
  const [label, setLabel] = React.useState(field?.label ?? "");
  const [choices, setChoices] = React.useState((field?.options ?? []).join("\n"));
  const [ownIt, setOwnIt] = React.useState(field?.memberEditable ?? false);
  // R1.10. Adding opens on the library. Editing opens on the field itself.
  const [picking, setPicking] = React.useState(!field);
  const [all, setAll] = React.useState(false);
  const [error, setError] = useFormError(open && !picking);
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  /* The delete is confirmed in a box that closes first, so the bin shows it. */
  const [deleting, setDeleting] = React.useState(false);
  /* R24.6. Whether the form has been touched, which decides both whether Save
     is live and whether closing asks first. */
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setType(field?.type ?? "text");
    setLabel(field?.label ?? "");
    setChoices((field?.options ?? []).join("\n"));
    setOwnIt(field?.memberEditable ?? false);
    setPicking(!field);
    setAll(false);
    setError(undefined);
    setConfirming(false);
    setDirty(false);
    // The panel resets to what is stored as it opens. Depending on the record
    // itself re-runs this on every render of the screen behind it, which throws
    // away whatever has been typed into the open panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, field?.type, field?.label]);

  /** A ready-made field fills the form somebody would have typed. */
  const start = (preset: FieldPreset) => {
    const values = presetValues(preset);
    setLabel(values.label);
    setType(values.type);
    setChoices(values.options.join("\n"));
    setPicking(false);
    setDirty(true);
  };

  const held = new Set(taken.map((one) => one.trim().toLowerCase()));
  const offered = FIELD_LIBRARY
    .filter((one) => !held.has(presetValues(one).label.toLowerCase()))
    .sort((a, b) => presetValues(a).label.localeCompare(presetValues(b).label));
  const shown = all ? offered : offered.slice(0, 8);

  const run = async (fn: (d: FormData) => Promise<{ error?: string }>, data: FormData) => {
    setError(undefined);
    setPending(true);
    try {
      const result = await fn(data);
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
      setDeleting(false);
    }
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setDirty(false);
  };
  const { onOpenChange, guard } = usePanelGuard({ dirty, setOpen: close });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>

      <SheetContent
        title={field ? field.label : picking ? t("fields.start") : t("fields.add")}
        closeLabel={t("common.close")}
        footer={
          picking ? null : (
          <>
            {field ? (
              /*
               * Deleting a field takes every answer recorded in it with it, so
               * it asks in a box of its own. The one place a confirmation sits
               * over a pane rather than inside it: an inline red panel in the
               * middle of a form is a warning somebody scrolls past.
               */
              <Dialog open={confirming} onOpenChange={setConfirming}>
                <DialogTrigger asChild>
                  <IconButton
                    label={t("fields.deleteOne", { name: field.label })}
                    variant="ghost"
                    className="mr-auto"
                    disabled={pending}
                  >
                    {deleting ? (
                      <Spinner label={t("fields.deleteOne", { name: field.label })} />
                    ) : (
                      <Trash2 />
                    )}
                  </IconButton>
                </DialogTrigger>

                <DialogContent
                  alert
                  title={t("fields.deleteOne", { name: field.label })}
                  closeLabel={t("common.close")}
                >
                  <p className="text-[length:var(--d-text-body)] text-fg">
                    {t("fields.deleteBody")}
                  </p>

                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                      {t("fields.keep")}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={pending}
                      onClick={() => {
                        const data = new FormData();
                        data.set("id", field.id);
                        setConfirming(false);
                        setDeleting(true);
                        void run(removeField, data);
                      }}
                    >
                      {t("fields.deleteAction", { name: field.label })}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}

            <Button
              type="submit"
              form="field-form"
              loading={pending && !deleting}
              disabled={pending || !label.trim() || !dirty}
              aria-disabled={pending || !label.trim() || !dirty}
            >
              {field ? t("action.save") : t("action.add")}
            </Button>
          </>
          )
        }
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}

        {picking ? (
          /*
           * R1.10. Naming it yourself comes first, because a church that knows
           * what it wants should not read a list to get to the blank form. The
           * details churches already keep follow, five at a time.
           */
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                setLabel("");
                setType("text");
                setChoices("");
                setPicking(false);
              }}
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-sunken"
            >
              <Plus className="size-[18px] shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 font-semibold text-primary">{t("fields.ownField")}</span>
              <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            </button>

            <hr className="my-2 border-0 border-t border-line" />

            <ol className="m-0 flex list-none flex-col p-0">
              {shown.map((preset) => {
                const values = presetValues(preset);
                const Icon = iconFor(values.type);

                return (
                  <li key={preset.key} className="flex gap-2.5">
                    <span className="flex w-5 shrink-0 flex-col items-center" aria-hidden>
                      <span className="mt-4 size-2.5 shrink-0 rounded-full bg-primary" />
                      <span className="my-1 w-px flex-1 bg-primary/35" />
                    </span>

                    <button
                      type="button"
                      onClick={() => start(preset)}
                      className="mb-1 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-sunken"
                    >
                      <Icon className="size-[18px] shrink-0 text-fg-muted" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium text-fg">{values.label}</span>
                        {values.options.length > 0 ? (
                          <span className="truncate text-[12px] text-fg-subtle">
                            {values.options.join(", ")}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ol>

            {offered.length > 8 ? (
              <button
                type="button"
                onClick={() => setAll((was) => !was)}
                className="cursor-pointer self-start rounded-md px-2 py-2 font-medium text-primary"
              >
                {all
                  ? t("list.showLess")
                  : t("list.showMore", { count: offered.length - shown.length })}
              </button>
            ) : null}
          </div>
        ) : null}

        <form
          hidden={picking}
          id="field-form"
          action={(d) => run(field ? saveField : addField, d)}
          noValidate
          /* Input bubbles, so one handler covers every field in the form. */
          onInput={() => setDirty(true)}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="church" value={church} />
          {field ? <input type="hidden" name="id" value={field.id} /> : null}

          {field ? null : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex cursor-pointer items-center gap-1.5 self-start font-medium text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden /> {t("fields.back")}
            </button>
          )}

          <Field label={t("fields.name")} required>
            <Input
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </Field>

          {/* R1.10. The shape can change while nothing has been answered
              against the field. The server refuses it once something has. */}
          <Field label={t("fields.type")}>
            <Select name="type" value={type} onValueChange={(v) => { setType(v); setDirty(true); }}>
              <SelectTrigger aria-label={t("fields.type")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((one) => (
                  <SelectItem key={one.value} value={one.value}>
                    {typeLabel(one.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {hasChoices(type) ? (
            <Choices value={choices} onChange={setChoices} />
          ) : null}

          {/* R1.10, R17.1. Some custom fields are the person's own details
              and some are the church's notes about them, and only the
              church knows which. Off unless it says otherwise. */}
          <label className="flex cursor-pointer items-center gap-3 border-t border-line pt-4">
            <Checkbox
              name="memberEditable"
              value="1"
              checked={ownIt}
              onCheckedChange={(on) => { setOwnIt(on === true); setDirty(true); }}
            />
            <span className="text-[length:var(--d-text-body)] text-fg">
              {t("fields.memberEditable")}
            </span>
          </label>
        </form>

        {guard}
      </SheetContent>
    </Sheet>
  );
}

/** R1.10. The one action this screen carries, beside its title. */
export function NewField({ church, taken = [] }: { church: string; taken?: string[] }) {
  return (
    <FieldSheet church={church} taken={taken}>
      <Button>
        <Plus /> {t("fields.add")}
      </Button>
    </FieldSheet>
  );
}
