"use client";

/**
 * HRT-378, R22.2. The five panels in the editor's rail.
 *
 * Pages, Design, Photos and Settings each take the same one prop and write
 * through `api.change`, so the history, the saving and the conflict handling
 * are decided once in the workspace rather than four times here. Nothing in
 * this file calls a server action or fetches anything.
 *
 * The rail is the product's own interface, so it is drawn with the product's
 * tokens and components. The one exception is a miniature of the church's own
 * look, which is drawn with the site's custom properties because showing the
 * church what it is choosing is what the panel exists to do.
 */

import * as React from "react";
import {
  ArrowDown, ArrowUp, ChevronDown, Copy, ExternalLink, ImagePlus, Pencil, Plus,
  Trash2, Upload, X,
  LayoutTemplate,
  Compass,
} from "lucide-react";
import { t, type MessageKey } from "@connectapp/i18n";
import {
  RESERVED_SLUGS, SITE_COLOR_TOKENS, SITE_LIMITS, SITE_PAIRINGS, SITE_PALETTES,
  SITE_SECTIONS, UPLOAD_RULES, contrast, imageOf,
  type FieldShape, type SiteColorToken, type SiteField, type SiteImage,
  type SitePage, type SiteSocial, type SiteTheme,
} from "@connectapp/db/rules";
import {
  Badge, Button, Dialog, DialogClose, DialogContent, DialogFooter, Field,
  IconButton, Input, Popover, PopoverContent, PopoverTrigger, Progress, Select,
  SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Sheet,
  SheetClose, SheetContent, Switch, Textarea,
} from "@connectapp/ui";
import {
  PAGE_STARTERS, PAGE_STARTER_TITLE, type PageStarter,
} from "@/components/church-site/starter";
import {
  PAIRINGS, PALETTES, SITE_PRESETS, paletteFor, themeStyle, type SitePreset,
} from "@/components/church-site/theme";
import { keyUrl, mediaUrl } from "@/components/church-site/kit";
import { dateAndTime } from "@/lib/dates";
import { ColourPicker } from "./colour-picker";
import type { BuilderApi, MediaItem } from "./api";
import {
  FOOTER, HEADER, addPage, atPath, duplicatePage, movePage, removePage,
  sectionOf, setField, setHome, setPage, setSeo, setSocial, setTheme, slugFrom,
  withPath,
} from "./store";

/* ------------------------------------------------------------- the shell --- */

/**
 * What the workspace wraps a panel in: its name, the way out, and a body that
 * scrolls on its own so the rail's own header stays where the eye left it.
 */
export function PanelFrame({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  /** What this panel offers beside its name, such as an add control. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-label font-medium text-fg">{title}</h2>
        {actions}
        <IconButton label={t("website.panel.close")} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------- shared controls --- */

const ROW =
  "flex min-h-[var(--d-tap)] w-full items-center gap-2 rounded-[var(--d-radius-control)]"
  + " px-2 text-left text-[length:var(--d-text-body)] text-fg transition-colors"
  + " duration-instant hover:bg-sunken focus-visible:outline focus-visible:outline-2"
  + " focus-visible:outline-offset-2 focus-visible:outline-primary";

const CARD =
  "relative flex cursor-pointer flex-col gap-2 rounded-[12px] border bg-surface p-2"
  + " text-left transition-colors duration-instant focus-visible:outline"
  + " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** One of a set of looks to choose between, drawn as its own card. */
function Pick({
  chosen,
  onPress,
  children,
  className,
}: {
  chosen: boolean;
  onPress: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={onPress}
      className={[
        CARD,
        chosen ? "border-primary ring-2 ring-primary" : "border-line hover:border-fg-subtle",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** A group of controls, folded away until somebody wants it. */
function Group({
  title,
  open,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group border-t border-line py-1">
      <summary
        className={
          "flex min-h-[var(--d-tap)] cursor-pointer list-none items-center justify-between"
          + " gap-2 rounded-[var(--d-radius-control)] px-1 text-label font-medium text-fg"
          + " marker:content-none focus-visible:outline focus-visible:outline-2"
          + " focus-visible:outline-offset-2 focus-visible:outline-primary"
          + " [&::-webkit-details-marker]:hidden"
        }
      >
        {title}
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-fg-muted transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-3 px-1 pt-3 pb-2">{children}</div>
    </details>
  );
}

/** A labelled switch, on its own row. */
function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex min-h-[var(--d-tap)] items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-[length:var(--d-text-body)] text-fg">
        {label}
      </label>
      <Switch id={id} checked={on} onCheckedChange={onChange} />
    </div>
  );
}

/** One of a short list of values, in the product's own menu. */
function Choose<T extends string>({
  label,
  value,
  options,
  words,
  onPick,
}: {
  label: string;
  value: T;
  options: readonly T[];
  words: (one: T) => string;
  onPick: (next: T) => void;
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(next) => onPick(next as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((one) => (
            <SelectItem key={one} value={one}>
              {words(one)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/* ------------------------------------------------------------- the pages --- */

/** Whether an address can be taken, and what to say when it cannot. */
function addressError(doc: BuilderApi["doc"], pageId: string, slug: string): string | undefined {
  if (!slug) return undefined;
  if (RESERVED_SLUGS.has(slug)) return t("website.addressReserved");
  if (doc.pages.some((one) => one.id !== pageId && one.slug === slug)) {
    return t("website.addressTaken");
  }
  return undefined;
}

/**
 * An address as it is being typed.
 *
 * `slugFrom` is for a finished name: it drops a trailing hyphen, so somebody
 * typing "plan-your-visit" lost the hyphen the moment they reached for it and
 * got "planyourvisit". This keeps what they typed and only refuses characters
 * an address cannot hold.
 */
const typedAddress = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 62);

/** One page as a record: its name, its address and what is done to it. */
function PageSheet({
  api,
  page,
  onClose,
}: {
  api: BuilderApi;
  page: SitePage;
  onClose: () => void;
}) {
  const isHome = page.id === api.doc.homeId;
  const [address, setAddress] = React.useState(page.slug);
  const [touched, setTouched] = React.useState(page.slug.length > 0);
  const [removing, setRemoving] = React.useState(false);
  const error = addressError(api.doc, page.id, address);

  const rename = (value: string) => {
    let next = setPage(api.doc, page.id, { title: value });
    /* Until the church has typed an address of its own, the address follows
       the name, which is what somebody renaming a new page expects. */
    if (!isHome && !touched) {
      const stem = slugFrom(value);
      if (stem && !addressError(api.doc, page.id, stem)) {
        next = setPage(next, page.id, { slug: stem });
        setAddress(stem);
      }
    }
    api.change(next, `page.title.${page.id}`);
  };

  const retype = (value: string) => {
    const clean = typedAddress(value);
    setAddress(clean);
    setTouched(true);
    if (!clean || addressError(api.doc, page.id, clean)) return;
    api.change(setPage(api.doc, page.id, { slug: clean }), `page.address.${page.id}`);
  };

  const duplicate = () => {
    const copy = api.newId("page");
    api.change(duplicatePage(api.doc, page.id, {
      page: copy,
      sections: page.sections.map(() => api.newId("section")),
    }));
    api.setPage(copy);
    onClose();
  };

  const remove = () => {
    api.change(removePage(api.doc, page.id));
    if (api.pageId === page.id) api.setPage(api.doc.homeId);
    setRemoving(false);
    onClose();
  };

  return (
    <>
      <SheetContent
        title={page.title}
        closeLabel={t("common.close")}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {isHome ? <span /> : (
              <Button variant="danger" onClick={() => setRemoving(true)}>
                {t("website.removePage")}
              </Button>
            )}
            <SheetClose asChild>
              <Button variant="secondary">{t("action.done")}</Button>
            </SheetClose>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t("website.pageName")} required>
            <Input value={page.title} onChange={(event) => rename(event.target.value)} />
          </Field>

          {isHome ? (
            <Badge tone="primary">{t("website.homePage")}</Badge>
          ) : (
            <Field label={t("website.pageAddress")} required error={error}>
              <Input value={address} onChange={(event) => retype(event.target.value)} />
            </Field>
          )}

          <Toggle
            label={t("website.inNav")}
            on={page.inNav}
            onChange={(next) => api.change(setPage(api.doc, page.id, { inNav: next }))}
          />

          <Separator />

          <div className="flex flex-col gap-2">
            {isHome ? null : (
              <Button
                variant="secondary"
                full
                onClick={() => api.change(setHome(api.doc, page.id))}
              >
                {t("website.makeHome")}
              </Button>
            )}
            <Button variant="secondary" full onClick={duplicate}>
              <Copy aria-hidden />
              {t("website.duplicatePage")}
            </Button>
          </div>
        </div>
      </SheetContent>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent alert title={t("website.removePageAsk", { page: page.title })}>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" data-dismiss>
                {t("action.cancel")}
              </Button>
            </DialogClose>
            <Button variant="danger" onClick={remove}>
              {t("website.removePage")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The starters a new page can open with. */
function AddPageSheet({ api, onClose }: { api: BuilderApi; onClose: () => void }) {
  const add = (starter: PageStarter) => {
    const page = api.newPage(starter);
    api.change(addPage(api.doc, page));
    api.setPage(page.id);
    onClose();
  };

  return (
    <SheetContent title={t("website.addPage")} closeLabel={t("common.close")}>
      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className="pb-2 text-label font-medium text-fg">
          {t("website.pageStarter")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {PAGE_STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => add(starter)}
              className={`${CARD} border-line hover:border-fg-subtle hover:bg-sunken`}
            >
              <span className="text-[length:var(--d-text-body)] font-medium text-fg">
                {t(PAGE_STARTER_TITLE[starter] as MessageKey)}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </SheetContent>
  );
}

export function PagesPanel({ api }: { api: BuilderApi }) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const pages = api.doc.pages;
  const open = editing ? pages.find((one) => one.id === editing) ?? null : null;

  const move = (from: number, to: number) => api.change(movePage(api.doc, from, to));

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-0.5">
        {pages.map((page, at) => (
          <li key={page.id} className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => api.setPage(page.id)}
              aria-current={page.id === api.pageId ? "page" : undefined}
              className={`${ROW} ${page.id === api.pageId ? "bg-primary-soft text-primary font-medium" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate">{page.title}</span>
              {page.id === api.doc.homeId ? (
                <Badge tone="neutral">{t("website.homePage")}</Badge>
              ) : null}
              {page.inNav ? null : <Badge tone="neutral">{t("website.hidden")}</Badge>}
            </button>
            <IconButton
              label={t("order.moveUp")}
              disabled={at === 0}
              onClick={() => move(at, at - 1)}
            >
              <ArrowUp />
            </IconButton>
            <IconButton
              label={t("order.moveDown")}
              disabled={at === pages.length - 1}
              onClick={() => move(at, at + 1)}
            >
              <ArrowDown />
            </IconButton>
            <IconButton label={t("action.edit")} onClick={() => setEditing(page.id)}>
              <Pencil />
            </IconButton>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        full
        disabled={pages.length >= SITE_LIMITS.pages}
        onClick={() => setAdding(true)}
      >
        <Plus aria-hidden />
        {t("website.addPage")}
      </Button>

      <Sheet open={adding} onOpenChange={setAdding}>
        {adding ? <AddPageSheet api={api} onClose={() => setAdding(false)} /> : null}
      </Sheet>

      <Sheet open={Boolean(open)} onOpenChange={(next) => (next ? null : setEditing(null))}>
        {open ? (
          <PageSheet key={open.id} api={api} page={open} onClose={() => setEditing(null)} />
        ) : null}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------ the design --- */

/** Text on the page, text on a card, and the primary's own ink on it. */
const COLOUR_PAIRS: [SiteColorToken, SiteColorToken][] = [
  ["ink", "bg"], ["ink", "surface"], ["primaryInk", "primary"],
];

/** Which colours are in a pair that body text cannot be read against. */
function tooClose(theme: SiteTheme): Set<SiteColorToken> {
  const palette = paletteFor(theme);
  const out = new Set<SiteColorToken>();
  for (const [text, ground] of COLOUR_PAIRS) {
    if (contrast(palette[text], palette[ground]) < 4.5) {
      out.add(text);
      out.add(ground);
    }
  }
  return out;
}

const HEX = /^#?[0-9a-fA-F]{6}$/;

/** A miniature of a look: its grounds, its faces and its button, at a glance. */
function Mini({ theme, label }: { theme: SiteTheme; label: string }) {
  return (
    <span
      className="block overflow-hidden rounded-[10px] border border-line"
      style={themeStyle(theme)}
    >
      <span className="block bg-[var(--s-bg)] px-2.5 py-3">
        <span
          className="block font-[family-name:var(--s-display)] text-[13px] leading-snug text-[var(--s-ink)]"
          style={{
            fontWeight: "var(--s-display-weight)" as unknown as number,
            letterSpacing: "var(--s-display-tracking)",
          }}
        >
          {label}
        </span>
        <span aria-hidden className="mt-2 block h-1 w-full rounded-full bg-[var(--s-ink-soft)]" />
        <span aria-hidden className="mt-1 block h-1 w-2/3 rounded-full bg-[var(--s-ink-soft)]" />
        <span
          aria-hidden
          className="mt-2.5 block h-4 w-14 rounded-[var(--s-button-corner)] bg-[var(--s-primary)]"
        />
      </span>
    </span>
  );
}

/** One colour of the church's own, with a way back to the palette's. */
function ColourRow({
  token,
  theme,
  warn,
  onWrite,
  onReset,
}: {
  token: SiteColorToken;
  theme: SiteTheme;
  warn: boolean;
  onWrite: (hex: string) => void;
  onReset: () => void;
}) {
  const id = React.useId();
  const value = paletteFor(theme)[token];
  const [text, setText] = React.useState(value);
  const own = theme.colors[token] !== undefined;

  const type = (next: string) => {
    setText(next);
    if (HEX.test(next.trim())) onWrite(`#${next.trim().replace("#", "").toLowerCase()}`);
  };

  return (
    <Field
      label={t(`website.colour.${token}`)}
      htmlFor={id}
      error={warn ? t("website.design.contrast") : undefined}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-describedby={warn ? `${id}-error` : undefined}
            className={
              "flex min-h-[var(--d-tap)] w-full items-center gap-3 rounded-[var(--d-radius-control)]"
              + " border border-line-strong bg-surface px-3 text-left shadow-sm transition-colors"
              + " duration-instant hover:bg-sunken focus-visible:outline focus-visible:outline-2"
              + " focus-visible:outline-offset-2 focus-visible:outline-primary"
            }
          >
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-full border border-line"
              style={{ background: value }}
            />
            <span className="font-mono text-[length:var(--d-text-body)] text-fg">{value}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,280px)]">
          <ColourPicker
            value={HEX.test(text.trim()) ? `#${text.trim().replace("#", "")}` : value}
            onChange={(hex) => {
              setText(hex);
              onWrite(hex);
            }}
            label={t(`website.colour.${token}`)}
          />
          <div className="mt-2 flex items-center gap-2">
            <span
              aria-hidden
              className="size-8 shrink-0 rounded-[8px] border border-line"
              style={{ background: HEX.test(text.trim()) ? text.trim() : value }}
            />
            <Input
              value={text}
              onChange={(event) => type(event.target.value)}
              aria-label={t(`website.colour.${token}`)}
              className="font-mono"
            />
          </div>
          {own ? (
            <Button
              variant="ghost"
              full
              onClick={() => {
                onReset();
                setText(PALETTES[theme.palette][token]);
              }}
            >
              {t("website.design.reset")}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </Field>
  );
}

export function DesignPanel({
  api,
  onChangeDesign,
  onWalk,
}: {
  api: BuilderApi;
  /** Opens the gallery of starting designs. */
  onChangeDesign?: () => void;
  /** Starts the walk through the builder again. */
  onWalk?: () => void;
}) {
  const theme = api.doc.theme;
  const warned = tooClose(theme);

  const write = (next: SiteTheme, merge?: string) =>
    api.change(setTheme(api.doc, next), merge);
  const set = (over: Partial<SiteTheme>) => write({ ...theme, ...over });
  const applyPreset = (preset: SitePreset) =>
    write({ ...theme, ...preset.theme, colors: {} });

  const header = api.doc.header;
  const footer = api.doc.footer;
  const setHeader = (path: string, value: unknown) =>
    api.change(withPath(api.doc, `header.${path}`, value));
  const setFooter = (path: string, value: unknown) =>
    api.change(withPath(api.doc, `footer.${path}`, value));

  return (
    <div className="flex flex-col gap-3">
      {/* The whole design, which is where a church starts and where it comes
          back to. It was only reachable from Settings, which is not where
          anybody looks for it. */}
      {onChangeDesign ? (
        <Button variant="secondary" full onClick={onChangeDesign}>
          <LayoutTemplate className="size-4" aria-hidden />
          {t("website.changeDesign")}
        </Button>
      ) : null}
      {onWalk ? (
        <Button variant="secondary" full onClick={onWalk}>
          <Compass className="size-4" aria-hidden />
          {t("website.walk.again")}
        </Button>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-label font-medium text-fg">{t("website.design.preset")}</h3>
        <div className="grid grid-cols-2 gap-2">
          {SITE_PRESETS.map((preset) => {
            const look: SiteTheme = { ...theme, ...preset.theme, colors: {} };
            const label = t(`website.preset.${preset.key}` as MessageKey);
            return (
              <Pick
                key={preset.key}
                chosen={
                  theme.palette === preset.theme.palette && theme.fonts === preset.theme.fonts
                }
                onPress={() => applyPreset(preset)}
              >
                <Mini theme={look} label={label} />
              </Pick>
            );
          })}
        </div>
      </div>

      <Group title={t("website.design.colours")} open>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="pb-2 text-label font-medium text-fg">
            {t("website.design.palette")}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {SITE_PALETTES.map((key) => {
              const palette = PALETTES[key];
              return (
                <Pick
                  key={key}
                  chosen={theme.palette === key}
                  onPress={() => set({ palette: key })}
                >
                  <span aria-hidden className="flex items-center gap-1">
                    {[palette.bg, palette.surface, palette.ink, palette.primary, palette.accent]
                      .map((hex, at) => (
                        <span
                          key={at}
                          className="size-4 rounded-full border border-line"
                          style={{ background: hex }}
                        />
                      ))}
                  </span>
                  <span className="text-[length:var(--d-text-body)] text-fg">
                    {t(`website.palette.${key}`)}
                  </span>
                </Pick>
              );
            })}
          </div>
        </fieldset>

        {SITE_COLOR_TOKENS.map((token) => (
          <ColourRow
            key={token}
            token={token}
            theme={theme}
            warn={warned.has(token)}
            onWrite={(hex) =>
              write(withPath(theme, `colors.${token}`, hex), `theme.colour.${token}`)
            }
            onReset={() => {
              const colors = { ...theme.colors };
              delete colors[token];
              write({ ...theme, colors });
            }}
          />
        ))}
      </Group>

      <Group title={t("website.design.fonts")}>
        <div className="flex flex-col gap-2">
          {SITE_PAIRINGS.map((key) => {
            const pairing = PAIRINGS[key];
            return (
              <Pick key={key} chosen={theme.fonts === key} onPress={() => set({ fonts: key })}>
                <span className="block">
                  <span
                    className="block text-[17px] leading-snug text-fg"
                    style={{
                      fontFamily: pairing.display,
                      letterSpacing: pairing.displayTracking,
                    }}
                  >
                    {t(`website.fonts.${key}`)}
                  </span>
                  <span
                    className="block text-[13px] text-fg-muted"
                    style={{ fontFamily: pairing.body }}
                  >
                    {t("website.ph.cards.body")}
                  </span>
                </span>
              </Pick>
            );
          })}
        </div>

        <Choose
          label={t("website.design.scale")}
          value={theme.typeScale}
          options={["compact", "regular", "grand"] as const}
          words={(one) => t(`website.scale.${one}`)}
          onPick={(typeScale) => set({ typeScale })}
        />
        <Choose
          label={t("website.design.weight")}
          value={theme.headingWeight}
          options={["light", "regular", "medium", "bold"] as const}
          words={(one) => t(`website.weight.${one}`)}
          onPick={(headingWeight) => set({ headingWeight })}
        />
      </Group>

      <Group title={t("website.design.buttons")}>
        <Choose
          label={t("website.design.shape")}
          value={theme.buttons.shape}
          options={["square", "soft", "pill"] as const}
          words={(one) => t(`website.shape.${one}`)}
          onPick={(shape) => set({ buttons: { ...theme.buttons, shape } })}
        />
        <Choose
          label={t("website.design.secondary")}
          value={theme.buttons.secondary}
          options={["outline", "soft", "quiet"] as const}
          words={(one) => t(`website.second.${one}`)}
          onPick={(secondary) => set({ buttons: { ...theme.buttons, secondary } })}
        />
      </Group>

      <Group title={t("website.design.layout")}>
        <Choose
          label={t("website.design.width")}
          value={theme.width}
          options={["narrow", "regular", "wide"] as const}
          words={(one) => t(`website.pageWidth.${one}`)}
          onPick={(width) => set({ width })}
        />
        <Choose
          label={t("website.design.rhythm")}
          value={theme.rhythm}
          options={["compact", "regular", "airy"] as const}
          words={(one) => t(`website.rhythm.${one}`)}
          onPick={(rhythm) => set({ rhythm })}
        />
        <Choose
          label={t("website.design.corners")}
          value={theme.corners}
          options={["square", "soft", "round"] as const}
          words={(one) => t(`website.corner.${one}`)}
          onPick={(corners) => set({ corners })}
        />
        <Choose
          label={t("website.design.cards")}
          value={theme.cards}
          options={["line", "shadow", "flat"] as const}
          words={(one) => t(`website.cards.${one}`)}
          onPick={(cards) => set({ cards })}
        />
        <Choose
          label={t("website.design.images")}
          value={theme.images}
          options={["square", "soft", "round"] as const}
          words={(one) => t(`website.corner.${one}`)}
          onPick={(images) => set({ images })}
        />
      </Group>

      <Group title={t("website.design.header")}>
        <Choose
          label={t("website.layout")}
          value={header.style}
          options={["logoLeft", "centred", "minimal", "stacked"] as const}
          words={(one) => t(`website.header.${one}`)}
          onPick={(style) => setHeader("style", style)}
        />
        <Toggle
          label={t("website.header.transparent")}
          on={header.transparent}
          onChange={(next) => setHeader("transparent", next)}
        />
        <Toggle
          label={t("website.header.sticky")}
          on={header.sticky}
          onChange={(next) => setHeader("sticky", next)}
        />
        <Toggle
          label={t("website.header.showName")}
          on={header.showName}
          onChange={(next) => setHeader("showName", next)}
        />
      </Group>

      <Group title={t("website.design.footer")}>
        <Choose
          label={t("website.layout")}
          value={footer.style}
          options={["columns", "simple", "band"] as const}
          words={(one) => t(`website.footer.${one}`)}
          onPick={(style) => setFooter("style", style)}
        />
        <Toggle
          label={t("website.footer.showAddress")}
          on={footer.showAddress}
          onChange={(next) => setFooter("showAddress", next)}
        />
        <Toggle
          label={t("website.footer.showContact")}
          on={footer.showContact}
          onChange={(next) => setFooter("showContact", next)}
        />
        <Toggle
          label={t("website.footer.showTimes")}
          on={footer.showTimes}
          onChange={(next) => setFooter("showTimes", next)}
        />
        <Toggle
          label={t("website.footer.showSocial")}
          on={footer.showSocial}
          onChange={(next) => setFooter("showSocial", next)}
        />
      </Group>
    </div>
  );
}

/* ------------------------------------------------------------ the photos --- */

/** The field a path names inside a kind of section, or nothing. */
function fieldAt(type: string, path: string): SiteField | null {
  if (!path) return null;
  let shape: FieldShape | undefined = SITE_SECTIONS[type]?.fields;
  let field: SiteField | undefined;
  for (const step of path.split(".")) {
    if (field) {
      if (field.kind === "rows") {
        if (!/^\d+$/.test(step)) return null;
        shape = field.of;
        field = undefined;
        continue;
      }
      /* One picture out of a gallery, which is an image wherever it sits. */
      if (field.kind === "images") {
        return /^\d+$/.test(step) ? { kind: "image" } : null;
      }
      return null;
    }
    field = shape?.[step];
    if (!field) return null;
    shape = undefined;
  }
  return field ?? null;
}

/**
 * Where the next photograph chosen should land.
 *
 * Either somewhere the editor named when it opened this panel, which is how a
 * band's background picture and the header's mark are reached, or whatever
 * picture field the church has open on the page.
 */
function pictureTarget(
  api: BuilderApi,
): { sectionId: string; path: string; current: SiteImage | null } | null {
  const told = api.mediaFor;
  if (told) {
    if (told.sectionId === HEADER) {
      return { ...told, current: api.doc.header.logo };
    }
    const section = sectionOf(api.doc, api.pageId, told.sectionId);
    if (!section) return null;
    const current = told.path.startsWith("style.")
      ? imageOf(atPath(section.style ?? {}, told.path.slice("style.".length)))
      : imageOf(atPath(section.content, told.path));
    return { ...told, current };
  }
  const selected = api.selected;
  if (!selected || !selected.path) return null;
  if (selected.sectionId === HEADER) {
    return selected.path === "logo"
      ? { sectionId: HEADER, path: "logo", current: api.doc.header.logo }
      : null;
  }
  if (selected.sectionId === FOOTER) return null;
  const section = sectionOf(api.doc, api.pageId, selected.sectionId);
  if (!section) return null;
  const field = fieldAt(section.type, selected.path);
  if (!field || field.kind !== "image") return null;
  return {
    sectionId: section.id,
    path: selected.path,
    current: imageOf(atPath(section.content, selected.path)),
  };
}

const VIDEO = /\.(?:mp4|webm)$/i;

export function MediaPanel({
  api,
  onUsed,
}: {
  api: BuilderApi;
  /** Told once a photograph has landed, so the destination is let go of. */
  onUsed?: () => void;
}) {
  const [chosen, setChosen] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<MediaItem | null>(null);
  const [away, setAway] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [failed, setFailed] = React.useState(false);
  const file = React.useRef<HTMLInputElement | null>(null);
  const target = pictureTarget(api);
  const rules = UPLOAD_RULES.website_media;

  const place = (key: string) => {
    if (!target) {
      setChosen(key);
      return;
    }
    api.change(setField(api.doc, api.pageId, target.sectionId, target.path, {
      key,
      url: null,
      alt: target.current?.alt ?? "",
      focus: target.current?.focus ?? { x: 0.5, y: 0.5 },
      fit: target.current?.fit ?? "cover",
    }));
    onUsed?.();
  };

  const take = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    setFailed(false);
    setTotal(files.length);
    setDone(0);
    let first = true;
    for (const one of files) {
      if (one.size > rules.maxBytes) {
        setFailed(true);
      } else {
        const image = await api.uploadMedia(one);
        if (!image) setFailed(true);
        else if (first && image.key) {
          place(image.key);
          first = false;
        }
      }
      setDone((at) => at + 1);
    }
    setTotal(0);
    setDone(0);
    if (file.current) file.current.value = "";
  };

  const remove = async () => {
    if (!removing) return;
    setAway(true);
    await api.removeMedia(removing.key);
    setAway(false);
    setRemoving(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={file}
        type="file"
        multiple
        accept={rules.types.join(",")}
        className="sr-only"
        onChange={(event) => void take(event.target.files)}
      />
      <Button
        variant="secondary"
        full
        loading={total > 0}
        onClick={() => file.current?.click()}
      >
        <Upload aria-hidden />
        {total > 0 ? t("website.uploadingMedia") : t("website.media.add")}
      </Button>

      {total > 0 ? (
        <Progress value={done} max={total} label={t("website.uploadingMedia")} />
      ) : null}
      {failed ? (
        <p role="alert" className="text-caption text-danger-text">
          {t("website.mediaUploadFailed")}
        </p>
      ) : null}

      <p className="text-caption text-fg-muted">{t("website.mediaLimit")}</p>

      {api.media.length === 0 ? (
        <p className="text-caption text-fg-muted">{t("website.media.none")}</p>
      ) : (
        <>
          {target ? null : (
            <p className="text-caption text-fg-muted">{t("website.media.chooseField")}</p>
          )}
          <ul className="grid grid-cols-2 gap-2">
            {api.media.map((item) => {
              const url = keyUrl(item.key);
              return (
                <li key={item.key} className="relative">
                  <button
                    type="button"
                    onClick={() => place(item.key)}
                    aria-pressed={chosen === item.key}
                    className={[
                      "block w-full overflow-hidden rounded-[12px] border bg-sunken",
                      "transition-colors duration-instant focus-visible:outline",
                      "focus-visible:outline-2 focus-visible:outline-offset-2",
                      "focus-visible:outline-primary",
                      chosen === item.key
                        ? "border-primary ring-2 ring-primary"
                        : "border-line hover:border-fg-subtle",
                    ].join(" ")}
                  >
                    <span className="sr-only">{t("website.media.use")}</span>
                    {VIDEO.test(item.key) ? (
                      <video
                        src={url ?? undefined}
                        muted
                        playsInline
                        preload="metadata"
                        aria-label={t("website.previewVideo")}
                        className="block aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element -- the
                         church's own storage, served through /site-media with its
                         own caching; next/image would proxy a signed redirect it
                         cannot cache. */
                      <img
                        src={url ?? ""}
                        alt={t("website.previewImage")}
                        loading="lazy"
                        decoding="async"
                        className="block aspect-[4/3] w-full object-cover"
                      />
                    )}
                  </button>
                  {item.inUse ? (
                    <span className="pointer-events-none absolute bottom-1 left-1">
                      <Badge tone="primary">{t("website.media.inUse")}</Badge>
                    </span>
                  ) : null}
                  <span className="absolute top-1 right-1">
                    <IconButton
                      variant="secondary"
                      label={t("website.media.remove")}
                      onClick={() => setRemoving(item)}
                    >
                      <Trash2 />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog open={Boolean(removing)} onOpenChange={(next) => (next ? null : setRemoving(null))}>
        <DialogContent
          alert
          title={t("website.media.removeAsk")}
          description={t("website.media.removeBody")}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" data-dismiss>
                {t("action.cancel")}
              </Button>
            </DialogClose>
            <Button variant="danger" loading={away} onClick={() => void remove()}>
              {t("website.media.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------------------------------------------- the settings --- */

/** One published version of the website, for the list of earlier ones. */
export interface SiteRevision {
  id: string;
  publishedAt: string;
}

/**
 * The services a church can give an address for.
 *
 * Each field takes the whole address of the church's own page on that service.
 * An address on the wrong service is refused by the save, which is where that
 * rule lives: the mark on the page would otherwise carry somebody else's link.
 */
const SOCIAL: (keyof SiteSocial)[] = [
  "facebook", "instagram", "youtube", "x", "tiktok", "spotify",
];

export function SettingsPanel({
  api,
  revisions,
  onLoadRevisions,
  onRestore,
  onTakeDown,
  onChangeDesign,
}: {
  api: BuilderApi;
  /** Handed down by the workspace, which is what reads them from the server. */
  revisions?: SiteRevision[];
  /** Asked for once, when this panel opens. */
  onLoadRevisions?: () => void;
  onRestore?: (id: string) => void | Promise<void>;
  onTakeDown?: () => void | Promise<void>;
  onChangeDesign?: () => void;
}) {
  const [asking, setAsking] = React.useState(false);
  const [going, setGoing] = React.useState(false);
  const [restoring, setRestoring] = React.useState<SiteRevision | null>(null);

  /* The earlier versions are a read of their own, so they are asked for when
     this panel opens rather than on every render of the editor. */
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (asked.current || !onLoadRevisions) return;
    asked.current = true;
    onLoadRevisions();
  }, [onLoadRevisions]);
  const [back, setBack] = React.useState(false);
  const seo = api.doc.seo;
  const share = mediaUrl(seo.image ?? null);

  React.useEffect(() => {
    onLoadRevisions?.();
  }, [onLoadRevisions]);

  const takeDown = async () => {
    if (!onTakeDown) return;
    setGoing(true);
    await onTakeDown();
    setGoing(false);
    setAsking(false);
  };

  const restore = async () => {
    if (!restoring || !onRestore) return;
    setBack(true);
    await onRestore(restoring.id);
    setBack(false);
    setRestoring(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-label font-medium text-fg">{t("website.settings.address")}</h3>
        <div className="flex items-center gap-2">
          <a
            href={api.church.liveUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[var(--d-tap)] min-w-0 items-center gap-1.5 text-[length:var(--d-text-body)] text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="truncate">{api.church.liveUrl}</span>
            <ExternalLink aria-hidden className="size-4 shrink-0" />
          </a>
          <Badge tone={api.publishedAt ? "success" : "neutral"}>
            {api.publishedAt ? t("website.live") : t("website.draftOnly")}
          </Badge>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h3 className="text-label font-medium text-fg">{t("website.settings.search")}</h3>
        <Field label={t("website.settings.description")}>
          <Textarea
            rows={3}
            value={seo.description ?? ""}
            onChange={(event) =>
              api.change(
                setSeo(api.doc, { ...seo, description: event.target.value }),
                "seo.description",
              )
            }
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-fg">
            {t("website.settings.shareImage")}
          </span>
          <div className="flex items-center gap-2">
            {share ? (
              /* eslint-disable-next-line @next/next/no-img-element -- the church's
                 own storage, served through /site-media with its own caching. */
              <img
                src={share}
                alt={seo.image?.alt ?? ""}
                className="size-14 shrink-0 rounded-[10px] border border-line object-cover"
              />
            ) : null}
            <Button variant="secondary" onClick={() => api.setPanel("media")}>
              <ImagePlus aria-hidden />
              {share ? t("website.field.replace") : t("website.emptyImage")}
            </Button>
            {share ? (
              <IconButton
                label={t("website.field.removeImage")}
                onClick={() => api.change(setSeo(api.doc, { ...seo, image: null }))}
              >
                <Trash2 />
              </IconButton>
            ) : null}
          </div>
        </div>

        <Toggle
          label={t("website.settings.noIndex")}
          on={seo.noIndex === true}
          onChange={(next) => api.change(setSeo(api.doc, { ...seo, noIndex: next }))}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h3 className="text-label font-medium text-fg">{t("website.settings.social")}</h3>
        {SOCIAL.map((key) => (
          <Field key={key} label={t(`website.social.${key}` as MessageKey)}>
            <Input
              type="url"
              inputMode="url"
              value={api.doc.social[key] ?? ""}
              onChange={(event) =>
                api.change(
                  setSocial(api.doc, { ...api.doc.social, [key]: event.target.value }),
                  `social.${key}`,
                )
              }
            />
          </Field>
        ))}
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h3 className="text-label font-medium text-fg">{t("website.settings.revisions")}</h3>
        {revisions && revisions.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {revisions.map((one) => (
              <li key={one.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[length:var(--d-text-body)] text-fg-muted">
                  {t("website.settings.publishedOn", { when: dateAndTime(one.publishedAt) })}
                </span>
                <Button
                  variant="ghost"
                  disabled={!onRestore}
                  onClick={() => setRestoring(one)}
                >
                  {t("website.settings.restore")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-fg-muted">{t("website.settings.noRevisions")}</p>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        {onChangeDesign ? (
          <Button variant="secondary" full onClick={onChangeDesign}>
            {t("website.changeDesign")}
          </Button>
        ) : null}
        <Button variant="danger" disabled={!onTakeDown} onClick={() => setAsking(true)}>
          {t("website.settings.takeDown")}
        </Button>
      </section>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent
          alert
          title={t("website.settings.takeDownAsk")}
          description={t("website.settings.takeDownBody")}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" data-dismiss>
                {t("action.cancel")}
              </Button>
            </DialogClose>
            <Button variant="danger" loading={going} onClick={() => void takeDown()}>
              {t("website.settings.takeDown")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(restoring)}
        onOpenChange={(next) => (next ? null : setRestoring(null))}
      >
        <DialogContent
          alert
          title={t("website.settings.restoreAsk", {
            when: restoring ? dateAndTime(restoring.publishedAt) : "",
          })}
          description={t("website.settings.restoreBody")}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" data-dismiss>
                {t("action.cancel")}
              </Button>
            </DialogClose>
            <Button loading={back} onClick={() => void restore()}>
              {t("website.settings.restore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
