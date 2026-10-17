"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive, ArchiveRestore, ArrowLeft } from "lucide-react";
import {
  Banner, Button, Dialog, DialogContent, DialogFooter, Field, IconButton, Input,
  Sheet, SheetTrigger, SheetContent, Spinner, LIFT, cn,
} from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { RichText } from "@/components/rich-text";
import { DynamicFields } from "@/components/dynamic-fields";
import { keepTemplate, putAwayTemplate } from "./actions";
import { LibraryPicker } from "@/components/library-picker";
import { usePanelGuard } from "@/components/panel-guard";
import { templateLibrary, type TemplatePreset } from "./library";

/** R16.4. The first words of a message, with its marks taken off. */
const plain = (body: string): string =>
  body
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_+]{1,3}([^*_+]+)[*_+]{1,3}/g, "$1")
    .replace(/^\s*([-*]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
}

/** R24.17. The one action this section carries, beside its title. */
export function NewTemplate({ taken }: { taken: string[] }) {
  return (
    <TemplateSheet taken={taken}>
      <Button>
        <Plus aria-hidden /> {t("mailTemplate.add")}
      </Button>
    </TemplateSheet>
  );
}

/**
 * HRT-291, R16.4, R24.6. The templates a church has written.
 *
 * A row is the whole press, the way every other settings list works. Editing
 * and archiving both live in the panel it opens, so the list stays a list of
 * names rather than a column of the same two icons repeated down it.
 */
export function TemplateList({
  templates,
  putAway,
}: {
  templates: Template[];
  putAway: boolean;
}) {
  const taken = templates.map((one) => one.name);
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const bringBack = async (id: string) => {
    setBusy(true);
    const answer = await putAwayTemplate(id, false);
    setBusy(false);
    if (answer.error) {
      setError(answer.error);
      return;
    }
    setError(null);
    router.refresh();
  };

  if (templates.length === 0) {
    return putAway ? <p className="m-0 text-fg-muted">{t("mailTemplate.noneArchived")}</p> : null;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {/* R24.6. One tile a template, and the whole tile is the press. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
        {templates.map((one) =>
          putAway ? (
            <div
              key={one.id}
              className={cn(
                "relative flex items-start gap-2 overflow-hidden rounded-[14px]",
                "border border-line bg-surface p-4 pl-5",
                "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-line-strong",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-semibold text-fg-muted">{one.name}</span>
                <span className="truncate text-[13px] text-fg-subtle">{one.subject}</span>
              </span>
              <IconButton
                label={t("mailTemplate.restore", { name: one.name })}
                variant="ghost"
                disabled={busy}
                onClick={() => void bringBack(one.id)}
              >
                <ArchiveRestore />
              </IconButton>
            </div>
          ) : (
            <TemplateSheet key={one.id} template={one} taken={taken}>
              <button
                type="button"
                aria-label={t("mailTemplate.edit", { name: one.name })}
                className={cn(
                  "relative flex cursor-pointer flex-col gap-1.5 overflow-hidden rounded-[14px]",
                  "border border-line bg-surface p-4 pl-5 text-left",
                  /* R24.4. A band of the church's own purple down the edge, so
                     a wall of white cards reads as a set of things rather than
                     as a page that has not finished loading. */
                  "before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-primary",
                  LIFT,
                )}
              >
                <span className="truncate font-semibold text-fg">{one.name}</span>
                <span className="truncate text-[13px] text-fg-muted">{one.subject}</span>
                <span className="line-clamp-2 text-[13px] text-fg-subtle">{plain(one.body)}</span>
              </button>
            </TemplateSheet>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * R24.6. A record is written in a panel from the right.
 *
 * Archiving sits at the far end of the footer, away from Save, because it is
 * the one press in here that takes something off a screen somebody else is
 * using.
 */
function TemplateSheet({
  template,
  taken,
  children,
}: {
  /** The one being changed, or nothing when one is being written. */
  template?: Template;
  /** What this church already keeps, so the library does not offer it twice. */
  taken: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(template?.name ?? "");
  const [subject, setSubject] = React.useState(template?.subject ?? "");
  const [body, setBody] = React.useState(template?.body ?? "");
  /*
   * HRT-291. What the editor was last filled with.
   *
   * The box owns its own contents once it is written into, so new words reach
   * it only by mounting it again. This is the seed and the count that force
   * that, and it moves when the panel opens or a library preset goes in,
   * never on a keystroke: re-seeding it a character at a time put the caret
   * back at the start each time and the words came out backwards.
   */
  const [seed, setSeed] = React.useState({ text: template?.body ?? "", at: 0 });
  const [dirty, setDirty] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /* R24.6. Closing a panel that has been typed in asks before it goes. */
  /* The editor hands back a way to write at the caret, which the marks use. */
  const write = React.useRef<((text: string) => void) | null>(null);

  /* HRT-291, R16.4. Adding opens on the library. Editing opens on the record
     itself, because somebody who came to change a template is not shopping. */
  const library = React.useMemo(() => (template ? [] : templateLibrary(taken)), [template, taken]);
  const [picking, setPicking] = React.useState(false);

  /*
   * Set when the panel opens, and only then: writing into the editor on every
   * keystroke would put the caret back at the start of what was typed. The
   * editor is mounted fresh each time, so what fills it is a key change rather
   * than a write.
   */
  React.useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setSubject(template?.subject ?? "");
    setBody(template?.body ?? "");
    setSeed({ text: template?.body ?? "", at: Date.now() });
    setDirty(false);
    setAsking(false);
    setError(null);
    setPicking(!template && library.length > 0);
  }, [open, template, library.length]);

  /** R16.4. One from the library, filling the form a church would have typed. */
  const start = (preset: TemplatePreset) => {
    setName(preset.name);
    setSubject(preset.subject);
    setBody(preset.body);
    setSeed({ text: preset.body, at: Date.now() });
    setDirty(true);
    setPicking(false);
  };

  const full = name.trim() !== "" && subject.trim() !== "" && body.trim() !== "";

  const act = async (run: () => Promise<{ error?: string }>) => {
    setBusy(true);
    const answer = await run();
    setBusy(false);
    if (answer.error) {
      setError(answer.error);
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const keep = () => {
    const data = new FormData();
    if (template) data.set("id", template.id);
    data.set("name", name);
    data.set("subject", subject);
    data.set("body", body);
    void act(() => keepTemplate(data));
  };

  /* R24.6. Typed in and not saved: our own box asks, rather than the panel
     taking the work with it. The question was written out again here in its
     own words, so the product asked it two ways; it is the shared one now. */
  const { onOpenChange, guard } = usePanelGuard({
    dirty: dirty && !busy,
    setOpen,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        title={template ? template.name : t("mailTemplate.add")}
        closeLabel={t("action.cancel")}
        width="560px"
        footer={
          picking ? null : (
          <>
            {template ? (
              <>
                <Dialog open={asking} onOpenChange={setAsking}>
                  <DialogContent alert title={t("mailTemplate.archiveTitle")}>
                    <p className="m-0 text-fg-muted">{t("mailTemplate.archiveBody")}</p>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setAsking(false)}>
                        {t("action.cancel")}
                      </Button>
                      <Button
                        variant="danger"
                        loading={busy}
                        onClick={() => void act(() => putAwayTemplate(template.id, true))}
                      >
                        {t("announce.archive")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <IconButton
                  label={t("mailTemplate.archive", { name: template.name })}
                  variant="ghost"
                  className="mr-auto"
                  disabled={busy}
                  onClick={() => setAsking(true)}
                >
                  {busy ? (
                    <Spinner label={t("mailTemplate.archive", { name: template.name })} />
                  ) : (
                    <Archive />
                  )}
                </IconButton>
              </>
            ) : null}

            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              {t("action.cancel")}
            </Button>
            <Button loading={busy} disabled={!full || !dirty} onClick={keep}>
              {t("action.save")}
            </Button>
          </>
          )
        }
      >
        {guard}

        {picking ? (
          <LibraryPicker
            ownLabel={t("mailTemplate.own")}
            items={library}
            onOwn={() => {
              /* R24.6. A blank form, even after a preset was looked at and
                 put down: "write your own" that opens somebody else's words
                 is a form somebody has to empty before they can start. */
              setName("");
              setSubject("");
              setBody("");
              setSeed({ text: "", at: Date.now() });
              setDirty(false);
              setPicking(false);
            }}
            onPick={(item) => {
              const preset = library.find((one) => one.key === item.key);
              if (preset) start(preset);
            }}
          />
        ) : (
        <div className="flex flex-col gap-4">
          {error ? <Banner tone="danger">{error}</Banner> : null}

          {library.length > 0 ? (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex cursor-pointer items-center gap-1.5 self-start text-label font-medium text-primary underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden /> {t("mailTemplate.back")}
            </button>
          ) : null}

          <Field label={t("mailTemplate.name")} required>
            <Input
              value={name}
              onChange={(e) => { setName(e.currentTarget.value); setDirty(true); }}
              placeholder={t("mailTemplate.namePlaceholder")}
              autoComplete="off"
            />
          </Field>

          <Field label={t("send.subject")} required>
            <Input
              value={subject}
              onChange={(e) => { setSubject(e.currentTarget.value); setDirty(true); }}
              placeholder={t("send.subjectPlaceholder")}
              autoComplete="off"
            />
          </Field>

          <Field label={t("send.body")} required>
            <RichText
              /* A fresh editor whenever the words change underneath it, which
                 is the only way a contenteditable box takes new contents. */
              key={seed.at}
              defaultValue={seed.text}
              onChange={(next) => { setBody(next); setDirty(true); }}
              minHeight={260}
              insert={(put) => { write.current = put; }}
            />
          </Field>

          {/* R16.4. The same marks the composer offers, because these are the
              same messages written a week earlier. */}
          <DynamicFields onInsert={(text) => write.current?.(text)} />
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
