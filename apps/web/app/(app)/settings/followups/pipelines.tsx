"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X, Power } from "lucide-react";
import {
  Badge, Banner, Button, Combobox, IconButton, Field, Input, Separator, Textarea,
  Dialog, DialogTrigger, DialogContent, DialogFooter,
  Sheet, SheetTrigger, SheetContent,
  LIFT,
} from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { Empty } from "@/components/empty";
import { useAnswered } from "@/components/form-actions";
import { LibraryPicker } from "@/components/library-picker";
import { usePanelGuard } from "@/components/panel-guard";
import { followupLibrary, type FlowPreset } from "./library";
import { addPipeline, savePipeline, switchPipeline } from "./actions";

export interface StepRow {
  id: string;
  name: string;
  dueDays: number;
}

export interface PipelineRow {
  id: string;
  name: string;
  description: string | null;
  hue: string;
  ownerUserId: string | null;
  archived: boolean;
  steps: StepRow[];
}

export interface TeamMember {
  userId: string;
  name: string;
}

const NOBODY = "nobody";

/** The pill a step and the add control share, so the row reads as one run. */
const CHIP = "flex h-10 items-center rounded-[10px] px-3 text-label font-medium";

/**
 * R5.2. The stages, in the church's own words.
 *
 * A name, what it is for, who it lands on, and the steps with how many days
 * each gets. The whole card opens the stage. There is no canvas and no branch:
 * that is R5.8, deferred, and it is the feature that makes the free
 * competition unusable.
 */
export function Pipelines({
  church,
  rows,
  team,
  putAway = false,
}: {
  church: string;
  rows: PipelineRow[];
  team: TeamMember[];
  /** R5.2. The stages that have been turned off, rather than the ones running. */
  putAway?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  const run = (work: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setError(result.error);
      if (!result.error) router.refresh();
    });

  /** R5.2. Writes the whole step list back, which is what the action takes. */
  const writeSteps = (
    row: PipelineRow,
    steps: Array<{ id: string; name: string; dueDays: number }>,
  ) => {
    const data = new FormData();
    data.set("id", row.id);
    data.set("name", row.name);
    data.set("description", row.description ?? "");
    data.set("ownerUserId", row.ownerUserId ?? "");
    for (const step of steps) {
      data.append("stepId", step.id);
      data.append("stepName", step.name);
      data.append("stepDays", String(step.dueDays));
    }
    run(() => savePipeline(data));
  };

  if (rows.length === 0) {
    return (
      <Empty
        icon="order"
        title={putAway ? t("pipelines.archived.none") : t("pipelines.none.title")}
        body={putAway ? undefined : t("pipelines.none.body")}
        action={
          putAway
            ? undefined
            : (
                <span data-guide="set-owner">
                  <NewPipeline church={church} team={team} taken={rows.map((one) => one.name)} />
                </span>
              )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {rows.map((row) => (
        <section
          key={row.id}
          /* R22.1. The setup guide rings the first stage nobody owns, which is
             the one its step is about. */
          data-guide={
            row.id === rows.find((one) => !one.ownerUserId && !one.archived)?.id
              ? "set-owner"
              : undefined
          }
          className={`relative flex flex-col gap-3.5 rounded-[14px] border border-line bg-surface px-5 py-4.5 ${LIFT} ${
            row.archived ? "opacity-55" : ""
          }`}
        >
          {/* R24.6. The whole card opens the stage. The trigger is a layer under
              the card's contents rather than a wrapper around them, so the
              power switch and the step chips stay controls of their own. */}
          <EditDialog
            church={church}
            row={row}
            team={team}
            pending={pending}
            trigger={
              <button
                type="button"
                aria-label={t("pipelines.editOne", { name: row.name })}
                className="absolute inset-0 z-0 cursor-pointer rounded-[14px]"
              />
            }
          />

          <div className="pointer-events-none relative flex flex-wrap items-center gap-2.5">
            <span
              className="size-3 shrink-0 rounded-[4px]"
              style={{ background: `var(--hue-${row.hue}-500)` }}
            />
            <span
              className={`flex-1 font-display text-[20px] text-fg ${
                row.archived ? "line-through decoration-2" : ""
              }`}
            >
              {row.name}
            </span>

            {row.archived ? <Badge tone="neutral">{t("pipelines.off")}</Badge> : null}

            <span className="text-label text-fg-subtle">
              {t("pipelines.ownedBy", {
                name: team.find((one) => one.userId === row.ownerUserId)?.name
                  ?? t("pipelines.nobody"),
              })}
            </span>

            <IconButton
              label={row.archived ? t("pipelines.on") : t("pipelines.turnOff")}
              variant="ghost"
              className="pointer-events-auto"
              disabled={pending}
              onClick={() => run(() => switchPipeline(row.id, !row.archived))}
            >
              <Power />
            </IconButton>
          </div>

          {/* The steps carry the stage's own colour, so a church reads the
              order of a journey by its hue down the page. */}
          <div className="pointer-events-none relative flex flex-wrap items-center gap-2">
            {row.steps.map((step, at) => (
              <React.Fragment key={step.id}>
                {/* The run reads as one journey, so each step is tied to the
                    one before it. */}
                {at > 0 ? (
                  <span aria-hidden className="flex w-5 shrink-0 items-center">
                    <span
                      className="h-px flex-1"
                      style={{ background: `var(--hue-${row.hue}-500)` }}
                    />
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: `var(--hue-${row.hue}-500)` }}
                    />
                    <span
                      className="h-px flex-1"
                      style={{ background: `var(--hue-${row.hue}-500)` }}
                    />
                  </span>
                ) : null}
                <span
                  className={`${CHIP} gap-2 pr-1.5`}
                  style={{
                    background: `var(--hue-${row.hue}-tint)`,
                    color: `var(--hue-${row.hue}-key)`,
                  }}
                >
                  <span className="text-[11px] font-semibold tabular-nums opacity-70">
                    {at + 1}
                  </span>
                  <span>{step.name}</span>
                  <span className="text-[12px] opacity-70">
                    {t("pipelines.dueIn", { count: String(step.dueDays) })}
                  </span>
                  <RemoveStep
                    stage={row.name}
                    step={step}
                    pending={pending}
                    onRemove={() =>
                      writeSteps(
                        row,
                        row.steps.filter((one) => one.id !== step.id),
                      )}
                  />
                </span>
              </React.Fragment>
            ))}

            <AddStep
              pending={pending}
              onAdd={(name, dueDays) =>
                writeSteps(row, [
                  ...row.steps.map((one) => ({ id: one.id, name: one.name, dueDays: one.dueDays })),
                  { id: "", name, dueDays },
                ])}
            />
          </div>

          {row.description ? (
            <span className="pointer-events-none relative text-fg-muted">{row.description}</span>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** R5.2. Taking a step off a stage, which is asked before it is done. */
function RemoveStep({
  stage,
  step,
  pending,
  onRemove,
}: {
  stage: string;
  step: StepRow;
  pending: boolean;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton
          label={t("pipelines.removeOne", { name: step.name })}
          className="pointer-events-auto size-6 min-h-0 rounded-full text-inherit [&_svg]:size-3.5"
          disabled={pending}
        >
          <X />
        </IconButton>
      </DialogTrigger>

      <DialogContent alert title={t("pipelines.removeTitle", { name: step.name, stage })}>
        <p className="text-[length:var(--d-text-body)] text-fg-muted">
          {t("pipelines.removeBody")}
        </p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("pipelines.keepStep")}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            {t("pipelines.removeAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * R5.2. A step, asked for in a box rather than in a field left open on the page.
 *
 * The same shape the tags screen uses: the run of pills is what the card is,
 * and the last pill makes another one.
 */
function AddStep({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (name: string, dueDays: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [days, setDays] = React.useState("");

  const ready = name.trim() !== "" && Number.isInteger(Number(days || 0)) && Number(days || 0) >= 0;

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setDays("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={`${CHIP} pointer-events-auto cursor-pointer gap-1.5 border border-dashed border-line-strong text-fg-muted hover:bg-sunken hover:text-fg`}
        >
          <Plus className="size-4" aria-hidden /> {t("pipelines.addStep")}
        </button>
      </DialogTrigger>

      <DialogContent title={t("pipelines.addStep")} closeLabel={t("common.close")}>
        <div className="flex flex-col gap-4">
          <Field label={t("pipelines.step")} required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </Field>

          <Field label={t("pipelines.days")}>
            <Input
              value={days}
              inputMode="numeric"
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => close(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!ready}
              onClick={() => {
                onAdd(name.trim(), Number(days || 0));
                close(false);
              }}
            >
              {t("action.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** R5.2. A stage of this church's own, filled in where it is made. */
export function NewPipeline({
  team,
  taken = [],
}: {
  church: string;
  team: TeamMember[];
  /** R5.2. The stages this church already keeps, so the library leaves them out. */
  taken?: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const formId = React.useId();
  const library = followupLibrary(taken);
  /** The journey being started from, or null for a blank one. */
  const [preset, setPreset] = React.useState<FlowPreset | null>(null);
  const [picking, setPicking] = React.useState(library.length > 0);
  const full = useAnswered(formId, open && !picking);

  const [dirty, setDirty] = React.useState(false);

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPreset(null);
      setDirty(false);
      setPicking(library.length > 0);
    }
  };

  const { onOpenChange, guard } = usePanelGuard({ dirty, setOpen: reset });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button><Plus /> {t("pipelines.add")}</Button>
      </SheetTrigger>
      <SheetContent
        title={picking ? t("pipelines.start") : t("pipelines.addTitle")}
        closeLabel={t("common.close")}
        width="560px"
        footer={
          picking ? null : (
            <Button data-guide="pipeline-add" type="submit" form={formId} loading={busy} disabled={!full}>
              {t("action.add")}
            </Button>
          )
        }
      >
        {!open ? null : picking ? (
          <div data-guide="pipeline-pick">
          <LibraryPicker
            ownLabel={t("pipelines.ownStage")}
            items={library}
            onOwn={() => {
              setPreset(null);
              setPicking(false);
            }}
            onPick={(item) => {
              setPreset(library.find((one) => one.key === item.key) ?? null);
              setPicking(false);
            }}
          />
          </div>
        ) : (
          <StageForm
            team={team}
            preset={preset}
            guide
            formId={formId}
            onBusy={setBusy}
            onDirty={setDirty}
            onBack={library.length > 0 ? () => setPicking(true) : undefined}
            onDone={() => reset(false)}
          />
        )}

        {guard}
      </SheetContent>
    </Sheet>
  );
}

function EditDialog({
  row,
  team,
  pending,
  trigger,
}: {
  church: string;
  row: PipelineRow;
  team: TeamMember[];
  pending: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
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
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        title={row.name}
        closeLabel={t("common.close")}
        width="560px"
        footer={
          <Button data-guide="pipeline-save" type="submit" form={formId} loading={busy} disabled={pending || !full || !dirty}>
            {t("action.save")}
          </Button>
        }
      >
        {/* Mounted with the box, so a stage edited, closed and opened again
            starts from what was saved rather than from what was typed. */}
        {open ? (
          <StageForm
            row={row}
            team={team}
            formId={formId}
            onBusy={setBusy}
            onDirty={setDirty}
            onDone={() => close(false)}
          />
        ) : null}

        {guard}
      </SheetContent>
    </Sheet>
  );
}

/**
 * R5.2. One stage, whether it is being made or being changed.
 *
 * A church making its own stage needs the same four things as one editing the
 * six it was given: what it is called, what it is for, who it lands on, and
 * the steps. One form, so the two never drift apart.
 */
function StageForm({
  row,
  team,
  preset,
  guide,
  onBack,
  formId,
  onBusy,
  onDirty,
  onDone,
}: {
  /** The stage being changed, where there is one. */
  row?: PipelineRow;
  team: TeamMember[];
  /** R5.2. A journey from the library, filling the form a church would type. */
  preset?: FlowPreset | null;
  /** R22.3. Whether the setup guide points at this one's owner field. */
  guide?: boolean;
  /** The way back to the library, when one was offered. */
  onBack?: () => void;
  /** R24.6. The id the panel's footer presses. */
  formId: string;
  /** Told while the save is running, so the footer can go busy. */
  onBusy?: (busy: boolean) => void;
  /**
   * R24.6. Told once something has been typed, so the panel around this can
   * ask before it closes on unsaved work.
   */
  onDirty?: (dirty: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const [owner, setOwner] = React.useState(row?.ownerUserId ?? NOBODY);
  const [steps, setSteps] = React.useState<{ key: string; id: string; name: string; days: string }[]>(
    row
      ? row.steps.map((step) => ({
          key: step.id, id: step.id, name: step.name, days: String(step.dueDays),
        }))
      : (preset?.steps ?? []).map((step, i) => ({
          key: `preset-${i}`, id: "", name: step.name, days: step.days,
        })),
  );
  const [saving, startTransition] = React.useTransition();
  React.useEffect(() => onBusy?.(saving), [saving, onBusy]);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

  const change = (key: string, patch: { name?: string; days?: string }) => {
    setDirty(true);
    setSteps((all) => all.map((step) => (step.key === key ? { ...step, ...patch } : step)));
  };

  return (
    <form
      id={formId}
      noValidate
      action={(data) => {
        if (row) data.set("id", row.id);
        data.set("ownerUserId", owner === NOBODY ? "" : owner);
        startTransition(async () => {
          const result = await (row ? savePipeline(data) : addPipeline(data));
          setError(result.error);
          if (!result.error) {
            onDone();
            router.refresh();
          }
        });
      }}
      /* Input bubbles, so one handler covers every field in the form. */
      onInput={() => setDirty(true)}
      className="flex flex-col gap-4"
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1.5 self-start font-medium text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden /> {t("fields.back")}
        </button>
      ) : null}

      <Field label={t("pipelines.name")} required>
        <Input
          name="name"
          defaultValue={row?.name ?? preset?.label ?? ""}
          autoComplete="off"
          autoFocus={!row}
        />
      </Field>

      <Field label={t("pipelines.description")}>
        <Textarea
          name="description"
          rows={2}
          defaultValue={row?.description ?? preset?.body ?? ""}
        />
      </Field>

      {/* A church of five hundred has more accounts than a list is worth
          scrolling, so the owner is looked up by name. */}
      <Field label={t("pipelines.owner")}>
        {/* R22.3. Named only on the panel that writes a new stage. The panel
            that edits one is mounted whether it is open or not, so marking
            the field in both sent the guide to the end on arrival. */}
        <div data-guide={guide ? "pipeline-owner" : undefined}>
        <Combobox
          options={[
            { value: NOBODY, label: t("pipelines.nobody") },
            ...team.map((member) => ({ value: member.userId, label: member.name })),
          ]}
          value={owner}
          onChange={(next) => { setOwner(next || NOBODY); setDirty(true); }}
          placeholder={t("pipelines.findOwner")}
          emptyLabel={t("pipelines.noOwner")}
          clearLabel={t("date.clear")}
          aria-label={t("pipelines.owner")}
        />
        </div>
      </Field>

      <Separator />

      <div className="flex flex-col gap-3">
        <span className="text-label text-fg">{t("pipelines.steps")}</span>

        {/* R5.2. The same path the positions draw: a numbered marker a row,
            the line between them carrying its own dot, and the words on an
            underline rather than in a box. */}
        <ol className="m-0 flex list-none flex-col p-0">
          {steps.map((step, at) => (
            <li key={step.key} className="flex gap-2.5">
              {steps.length > 1 ? (
                <span className="flex w-5 shrink-0 flex-col items-center" aria-hidden>
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border border-primary/40 bg-surface text-[10px] font-semibold text-primary">
                    {at + 1}
                  </span>
                  {at === steps.length - 1 ? null : (
                    <span className="relative my-1 w-px flex-1 bg-primary/40">
                      <span className="absolute top-1/2 left-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                    </span>
                  )}
                </span>
              ) : null}

              <div className="flex min-w-0 flex-1 items-start gap-2 pb-3">
                <input type="hidden" name="stepId" value={step.id} />
                <input
                  name="stepName"
                  value={step.name}
                  aria-label={t("pipelines.stepN", { count: String(at + 1) })}
                  autoComplete="off"
                  className="-mt-1 min-w-0 flex-1 rounded-sm border-b border-line bg-transparent px-1 py-1 text-[length:var(--d-text-body)] text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                  onChange={(e) => change(step.key, { name: e.target.value })}
                />
                <label className="-mt-1 flex items-center gap-1.5 text-[13px] text-fg-muted">
                  {t("pipelines.days")}
                  <input
                    name="stepDays"
                    inputMode="numeric"
                    value={step.days}
                    className="w-14 rounded-sm border-b border-line bg-transparent px-1 py-1 text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                    onChange={(e) => change(step.key, { days: e.target.value })}
                  />
                </label>
                <IconButton
                  label={t("pipelines.removeStep")}
                  type="button"
                  variant="ghost"
                  className="-mt-2.5"
                  onClick={() => { setDirty(true); setSteps((all) => all.filter((s) => s.key !== step.key)); }}
                >
                  <X />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>

        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => {
            setDirty(true);
            setSteps((all) => [
              ...all,
              { key: `new-${all.length}-${Date.now()}`, id: "", name: "", days: "" },
            ]);
          }}
        >
          <Plus /> {t("pipelines.addStep")}
        </Button>
      </div>

    </form>
  );
}
