"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, Plus, Undo2 } from "lucide-react";
import {
  Banner, Button, Checkbox, Dialog, DialogContent, DialogFooter, Field, IconButton,
  Input, LIFT, Sheet, SheetContent, SheetTrigger, Textarea,
} from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import type { Fund } from "@connectapp/db";
import { Empty } from "@/components/empty";
import { usePanelGuard } from "@/components/panel-guard";
import { LibraryPicker } from "@/components/library-picker";
import { FUND_LIBRARY, presetFund } from "./library";
import { useFormError } from "@/lib/form-error";
import { saveFund, archiveFund } from "./actions";

/**
 * R13.9. The funds a church keeps.
 *
 * A tile each, the way the group types and the service types are drawn. A
 * restricted fund is labelled as such, because that is the distinction a treasurer
 * is answerable for.
 */
/**
 * R13.23. A short code for the fund, suggested from its name.
 *
 * The code is what the church's accounting software calls this fund, and it
 * goes out on the export. Most churches use the obvious abbreviation, so it
 * is offered rather than asked for, and anybody with their own chart of
 * accounts types theirs over it.
 */
function suggestCode(name: string, taken: string[]): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const base = (words.length > 1
    ? words.map((one) => one.slice(0, 1)).join("")
    : words[0]!.slice(0, 3)
  ).slice(0, 4);

  const used = new Set(taken.map((one) => one.toUpperCase()));
  if (!used.has(base)) return base;
  for (let at = 2; at < 100; at += 1) {
    const next = `${base}${at}`;
    if (!used.has(next)) return next;
  }
  return base;
}

export function FundManager({
  funds,
  putAway,
}: {
  church: string;
  funds: Fund[];
  /** R24.6. Whether this is the shelf of funds that have been archived. */
  putAway?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();
  const [asking, setAsking] = React.useState<Fund | null>(null);

  const run = (work: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setError(result.error);
      if (!result.error) router.refresh();
    });

  const codes = funds.map((one) => one.code ?? "").filter(Boolean);

  if (putAway) {
    return (
      <div className="flex flex-col gap-4" aria-busy={pending}>
        {error ? <Banner tone="danger">{error}</Banner> : null}

        {funds.length === 0 ? (
          <Empty icon="tag" title={t("fund.archived.none")} />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))]">
            {funds.map((fund) => (
              <div
                key={fund.id}
                className="flex items-center gap-2 rounded-[14px] border border-line bg-surface p-4"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-fg-muted">
                  {fund.name}
                </span>
                <IconButton
                  label={t("fund.restore")}
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => archiveFund(fund.id, false))}
                >
                  <Undo2 />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const live = funds;

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <div className="flex justify-end">
        <FundPanel pending={pending} codesInUse={codes} />
      </div>

      {/* R13.9. A church creating itself is given two funds, so this is empty
          only where the records were made another way. An empty grid said
          nothing at all, which reads as a screen that failed to load. */}
      {live.length === 0 ? (
        <Empty icon="tag" title={t("fund.none")} body={t("fund.noneBody")} />
      ) : (
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))]">
        {live.map((fund) => (
          <FundPanel
            key={fund.id}
            pending={pending}
            fund={fund}
            codesInUse={codes.filter((one) => one !== fund.code)}
            /* R13.9. A church keeps at least one fund, because a gift has
               to go somewhere, so the last one cannot be archived. */
            onArchive={live.length > 1 ? () => setAsking(fund) : undefined}
            trigger={
              <button
                type="button"
                className={`flex cursor-pointer flex-col gap-1 rounded-[14px] border border-line bg-surface p-4 text-left ${LIFT}`}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold text-fg">
                    {fund.name}
                  </span>
                  {fund.restricted ? (
                    <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                      {t("giving.restricted")}
                    </span>
                  ) : null}
                </span>
                {fund.code ? (
                  <span className="font-mono text-[12px] text-fg-subtle">{fund.code}</span>
                ) : null}
              </button>
            }
          />
        ))}
      </div>
      )}

      <Dialog open={asking !== null} onOpenChange={(on) => (on ? null : setAsking(null))}>
        <DialogContent alert title={t("fund.archiveTitle", { name: asking?.name ?? "" })}>
          <DialogFooter>
            <Button variant="ghost" data-dismiss onClick={() => setAsking(null)}>
              {t("fund.keep")}
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                const one = asking;
                setAsking(null);
                if (one) run(() => archiveFund(one.id, true));
              }}
            >
              {t("fund.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** R13.9. Writing a fund down, or changing one. */
function FundPanel({
  pending,
  fund,
  codesInUse,
  trigger,
  onArchive,
}: {
  pending: boolean;
  fund?: Fund;
  /** R13.23. The codes already spoken for, so a suggestion is its own. */
  codesInUse: string[];
  trigger?: React.ReactNode;
  onArchive?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, startTransition] = React.useTransition();
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = useFormError(open);

  /* R13.9. What churches already keep comes before the blank form. */
  const [picking, setPicking] = React.useState(!fund);
  const [name, setName] = React.useState(fund?.name ?? "");
  const [code, setCode] = React.useState(fund?.code ?? "");
  /** Whether the code is this church's own rather than one we offered. */
  const [ownCode, setOwnCode] = React.useState(Boolean(fund?.code));
  const [restricted, setRestricted] = React.useState(fund?.restricted ?? false);
  const [description, setDescription] = React.useState(fund?.description ?? "");

  React.useEffect(() => {
    if (!open) return;
    setPicking(!fund);
    setName(fund?.name ?? "");
    setCode(fund?.code ?? "");
    setOwnCode(Boolean(fund?.code));
    setRestricted(fund?.restricted ?? false);
    setDescription(fund?.description ?? "");
    // The panel resets to what is stored as it opens. Depending on the record
    // itself re-runs this on every render of the screen behind it, which throws
    // away whatever has been typed into the open panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fund?.name, fund?.code, fund?.restricted, fund?.description]);

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setDirty(false);
  };
  const { onOpenChange, guard } = usePanelGuard({ dirty, setOpen: close });

  const save = () =>
    startTransition(async () => {
      const result = await saveFund(
        { id: fund?.id, name, code: code || null, restricted, description: description || null },
      );
      setError(result.error);
      if (!result.error) {
        close(false);
        router.refresh();
      }
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? <Button data-guide="add-fund"><Plus /> {t("fund.add")}</Button>}
      </SheetTrigger>

      <SheetContent
        title={
          fund
            ? t("fund.editTitle", { name: fund.name })
            : picking
              ? t("fund.start")
              : t("fund.newTitle")
        }
        closeLabel={t("common.close")}
        footer={
          picking ? null : (
          <>
            {fund && onArchive ? (
              <IconButton
                label={t("fund.archive")}
                variant="ghost"
                className="mr-auto"
                disabled={pending || saving}
                onClick={() => {
                  close(false);
                  onArchive();
                }}
              >
                <Archive />
              </IconButton>
            ) : null}
            <Button
              data-guide="fund-save"
              type="button"
              disabled={pending || saving || !dirty || !name.trim()}
              loading={saving}
              onClick={save}
            >
              {t("action.save")}
            </Button>
          </>
          )
        }
      >
        {guard}

        {picking ? (
          <LibraryPicker
            ownLabel={t("fund.ownFund")}
            items={FUND_LIBRARY.map((preset) => ({
              key: preset.key,
              label: t(preset.label),
              detail: preset.restricted ? t("giving.restricted") : undefined,
            }))}
            onOwn={() => {
              setName("");
              setCode("");
              setOwnCode(false);
              setRestricted(false);
              setPicking(false);
            }}
            onPick={(item) => {
              const preset = FUND_LIBRARY.find((one) => one.key === item.key)!;
              const chosen = presetFund(preset);
              setName(chosen.name);
              setCode(suggestCode(chosen.name, codesInUse));
              setOwnCode(false);
              setRestricted(chosen.restricted);
              setPicking(false);
              setDirty(true);
            }}
          />
        ) : null}

        <div className="flex flex-col gap-4" hidden={picking}>
          {error ? <Banner tone="danger">{error}</Banner> : null}

          {/* R24.6. The way back to what churches already keep, for somebody
              who opened the wrong one. */}
          {fund ? null : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex cursor-pointer items-center gap-1.5 self-start font-medium text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden /> {t("fund.back")}
            </button>
          )}

          <Field label={t("fund.name")} required>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!ownCode) setCode(suggestCode(e.target.value, codesInUse));
                setDirty(true);
              }}
              placeholder={t("fund.namePlaceholder")}
              autoComplete="off"
              autoFocus
            />
          </Field>

          <Field label={t("fund.code")}>
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setOwnCode(e.target.value.trim().length > 0);
                setDirty(true);
              }}
              placeholder={t("fund.codePlaceholder")}
              autoComplete="off"
              className="font-mono"
            />
          </Field>

          {/* R13.9. The one answer a treasurer is answerable for. */}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-sunken px-3 py-2.5 text-[length:var(--d-text-body)] text-fg">
            <Checkbox
              checked={restricted}
              onCheckedChange={(on) => {
                setRestricted(on === true);
                setDirty(true);
              }}
            />
            <span className="flex min-w-0 flex-col">
              <span>{t("fund.restricted")}</span>
              <span className="text-[13px] text-fg-muted">{t("fund.restricted.hint")}</span>
            </span>
          </label>

          <Field label={t("fund.description")}>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
            />
          </Field>
        </div>
      </SheetContent>
    </Sheet>
  );
}
