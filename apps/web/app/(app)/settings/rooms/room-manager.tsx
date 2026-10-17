"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Archive, Undo2, ChevronLeft } from "lucide-react";
import {
  HUES,
  Banner, Button, IconButton, Field, HueDot, Input, Spinner,
  Sheet, SheetTrigger, SheetContent, Switch,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  LIFT,
} from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { Empty } from "@/components/empty";
import { ageLine, say } from "@/lib/room-ages";
import { createRoom, saveRoom, archiveRoom } from "./actions";
import { LibraryPicker } from "@/components/library-picker";
import { roomLibrary } from "./library";
import { usePanelGuard } from "@/components/panel-guard";


export interface RoomItem {
  id: string;
  name: string;
  hue: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  capacity: number | null;
  ratio: number | null;
  /** R8.14. Whether this room holds children, and so carries the safeguarding rules. */
  forChildren: boolean;
  archived: boolean;
}

/**
 * R8.14 to R8.17. The rooms children are checked into.
 *
 * Four numbers a church sets once and a station reads at every service: who the
 * room is for, how many it holds, how many volunteers it needs, and what colour
 * it prints. The colour is how a volunteer points a parent at the right door
 * across a full foyer, so it is part of the configuration rather than a theme.
 */
export function RoomManager({
  rooms,
  putAway,
}: {
  rooms: RoomItem[];
  /** R24.6. Whether this is the shelf of rooms that have been archived. */
  putAway?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();
  /* Which room's control was pressed, so one stepper spins rather than all. */
  const [doing, setDoing] = React.useState<string>();

  React.useEffect(() => {
    if (!pending) setDoing(undefined);
  }, [pending]);

  const act = (
    key: string,
    fn: (d: FormData) => Promise<{ error?: string }>,
    fields: Record<string, string>,
  ) => {
    setDoing(key);
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    startTransition(async () => {
      const result = await fn(data);
      setError(result.error);
      if (!result.error) router.refresh();
    });
  };

  const open = rooms;

  const setCapacity = (room: RoomItem, key: string, next: number) =>
    act(key, saveRoom, {
      id: room.id,
      name: room.name,
      hue: room.hue,
      minAgeMonths: room.minAgeMonths === null ? "" : String(room.minAgeMonths),
      maxAgeMonths: room.maxAgeMonths === null ? "" : String(room.maxAgeMonths),
      ratio: room.ratio === null ? "" : String(room.ratio),
      capacity: next <= 0 ? "" : String(next),
      // Every field goes back, including this one. Leaving it out saved the
      // room with the default in its place, which quietly re-flagged a hall as
      // a children's room every time somebody pressed plus.
      forChildren: room.forChildren ? "1" : "",
    });

  if (putAway) {
    return (
      <div className="flex flex-col gap-5" aria-busy={pending}>
        {error ? <Banner tone="danger">{error}</Banner> : null}

        {rooms.length === 0 ? (
          <Empty icon="room" title={t("rooms.archived.none")} />
        ) : (
          <section className="rounded-[14px] border border-line bg-surface px-5 py-1">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="flex items-center gap-3 border-b border-sunken py-2.5 last:border-0"
              >
                <span
                  className="size-3 shrink-0 rounded-[4px]"
                  style={{ background: `var(--hue-${room.hue}-500)` }}
                />
                <span className="flex-1 text-fg-subtle">{room.name}</span>
                <IconButton
                  label={t("rooms.restore")}
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    act(`restore:${room.id}`, archiveRoom, { id: room.id, archived: "0" })
                  }
                >
                  {doing === `restore:${room.id}` ? (
                    <Spinner label={t("rooms.restore")} />
                  ) : (
                    <Undo2 />
                  )}
                </IconButton>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {open.length === 0 ? (
        <Empty
          icon="room"
          title={t("rooms.none.title")}
          body={t("rooms.none.body")}
          action={<AddRoom taken={open.map((one) => one.name)} />}
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))]">
          {open.map((room) => (
            <section
              key={room.id}
              className={`relative flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 ${LIFT}`}
            >
              {/* R24.6. The whole tile opens the room. The trigger is a layer
                  over the card rather than a wrapper around it, so the capacity
                  buttons stay buttons instead of controls nested in a control. */}
              <RoomSheet
                room={room}
                pending={pending}
                trigger={
                  <button
                    type="button"
                    aria-label={t("rooms.editTitle", { name: room.name })}
                    className="absolute inset-0 z-0 cursor-pointer rounded-[14px]"
                  />
                }
                title={t("rooms.editTitle", { name: room.name })}
                onSave={(fields) => act(`save:${room.id}`, saveRoom, { id: room.id, ...fields })}
                onArchive={() =>
                  act(`archive:${room.id}`, archiveRoom, { id: room.id, archived: "1" })
                }
              />

              <div className="pointer-events-none relative flex items-center gap-2.5">
                <span
                  className="size-3 shrink-0 rounded-[4px]"
                  style={{ background: `var(--hue-${room.hue}-500)` }}
                />
                <span className="min-w-0 flex-1 truncate font-semibold text-fg">{room.name}</span>
                {room.forChildren ? (
                  <span className="shrink-0 text-[12px] text-fg-subtle">{ageLine(room)}</span>
                ) : null}
              </div>

              {/* R8.15. Capacity is the number a church changes most, and it
                  changes by one, so it is two buttons rather than a form. */}
              <div className="pointer-events-none relative flex items-center justify-between gap-2">
                <span className="text-label text-fg-muted">{t("rooms.capacity")}</span>
                {/* The steppers are the one thing on the tile that is not the
                    tile: everything else lets the press through to the card. */}
                <div className="pointer-events-auto flex items-center gap-1.5">
                  <IconButton
                    label={t("rooms.fewer")}
                    variant="secondary"
                    className="size-8 min-h-0 rounded-lg"
                    disabled={pending || (room.capacity ?? 0) <= 0}
                    onClick={() =>
                      setCapacity(room, `fewer:${room.id}`, (room.capacity ?? 0) - 1)
                    }
                  >
                    {doing === `fewer:${room.id}` ? (
                      <Spinner label={t("rooms.fewer")} />
                    ) : (
                      <Minus />
                    )}
                  </IconButton>
                  <span className="min-w-7 text-center font-semibold text-fg tabular-nums">
                    {room.capacity ?? 0}
                  </span>
                  <IconButton
                    label={t("rooms.more")}
                    variant="secondary"
                    className="size-8 min-h-0 rounded-lg"
                    disabled={pending}
                    onClick={() => setCapacity(room, `more:${room.id}`, (room.capacity ?? 0) + 1)}
                  >
                    {doing === `more:${room.id}` ? (
                      <Spinner label={t("rooms.more")} />
                    ) : (
                      <Plus />
                    )}
                  </IconButton>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

    </div>
  );
}

/**
 * R8.14. Adding a room and editing one ask for the same six things.
 *
 * In the right-hand pane, where every other form in the product opens, so the
 * card grid behind it stays where the reader left it.
 */
export function RoomSheet({
  room,
  pending,
  trigger,
  title,
  taken = [],
  onSave,
  onArchive,
}: {
  room?: RoomItem;
  /** R8.14. The rooms this church already has, which the library leaves out. */
  taken?: string[];
  pending: boolean;
  trigger: React.ReactNode;
  title: string;
  onSave: (fields: Record<string, string>) => void;
  /** R8.14. Archiving an existing room, which is undone from the shelf below. */
  onArchive?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [hue, setHue] = React.useState(room?.hue ?? "sky");
  // R8.14. A new room is a room. A church says when one holds children, which
  // is what turns on the age bands, the capacity and the volunteer ratio.
  const [forChildren, setForChildren] = React.useState(room?.forChildren ?? false);
  // R24.6. Save stays dead until the one field the server refuses blank has
  // something in it, rather than taking the press and answering with an error.
  const [name, setName] = React.useState(room?.name ?? "");

  const start = room ? (room.minAgeMonths === null ? null : say(room.minAgeMonths)) : null;
  const end = room ? (room.maxAgeMonths === null ? null : say(room.maxAgeMonths)) : null;

  const [fromUnit, setFromUnit] = React.useState<string>(start?.unit ?? "months");
  const [toUnit, setToUnit] = React.useState<string>(end?.unit ?? "years");

  /*
   * R8.14, R24.6. The rooms churches keep, offered before the blank form.
   *
   * Only when writing a new one: opening a room that exists is opening that
   * room. Picking fills this same form, so it is a head start rather than a
   * second way of writing a room down, and the ages it brings are the part
   * worth having.
   */
  const library = React.useMemo(() => (room ? [] : roomLibrary(taken)), [room, taken]);
  const [picking, setPicking] = React.useState(false);
  /* The band a pick brought, which the age fields read as their default. The
     fields are uncontrolled, so they are rebuilt rather than told. */
  const [band, setBand] = React.useState<{ from?: number; to?: number; at: number }>({ at: 0 });
  /* Whether this form was reached by picking one off the list. */
  const [picked, setPicked] = React.useState(false);
  /* R24.6. Whether anything in the form has been touched, which decides both
     whether Save is live and whether closing asks first. */
  const [dirty, setDirty] = React.useState(false);

  // The two units are read back when the form is submitted, so a unit left
  // over from the last room multiplies the next room's number: 18 typed as
  // months, stored as 216.
  React.useEffect(() => {
    if (!open) return;
    setName(room?.name ?? "");
    setHue(room?.hue ?? "sky");
    setForChildren(room?.forChildren ?? false);
    setFromUnit(start?.unit ?? "months");
    setToUnit(end?.unit ?? "years");
    setBand({ at: 0 });
    setPicked(false);
    setDirty(false);
    setPicking(!room && library.length > 0);
  }, [open, room, room?.name, room?.hue, room?.forChildren, start?.unit, end?.unit, library.length]);

  const months = (raw: FormDataEntryValue | null, unit: string): string => {
    const text = String(raw ?? "").trim();
    if (!text) return "";
    const value = Number(text);
    if (!Number.isFinite(value)) return text;
    return String(unit === "years" ? Math.round(value * 12) : Math.round(value));
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setDirty(false);
  };
  const { onOpenChange, guard } = usePanelGuard({ dirty, setOpen: close });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        title={title}
        closeLabel={t("common.close")}
        footer={
          picking ? null : (
          <>
            {onArchive ? (
              <IconButton
                label={t("rooms.archive")}
                variant="ghost"
                className="mr-auto"
                disabled={pending}
                onClick={() => { onArchive(); setOpen(false); }}
              >
                <Archive />
              </IconButton>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              data-guide="room-save"
              type="submit"
              form="room-form"
              loading={pending}
              disabled={pending || !name.trim() || !dirty}
            >
              {picked ? t("action.add") : t("action.save")}
            </Button>
          </>
          )
        }
      >
        {picking ? (
          <LibraryPicker
            ownLabel={t("rooms.ownRoom")}
            items={library}
            onOwn={() => {
              setName("");
              setPicked(false);
              setPicking(false);
            }}
            onPick={(item) => {
              const picked = library.find((one) => one.key === item.key);
              setName(item.label);
              if (picked) {
                setHue(picked.hue);
                setForChildren(picked.forChildren);
                setFromUnit("months");
                setToUnit("months");
                setBand({ from: picked.from, to: picked.to, at: Date.now() });
              }
              setPicked(true);
              setDirty(true);
              setPicking(false);
            }}
          />
        ) : (
        <form
          id="room-form"
          action={(data) => {
            onSave({
              name: String(data.get("name") ?? ""),
              hue,
              minAgeMonths: months(data.get("from"), fromUnit),
              maxAgeMonths: months(data.get("to"), toUnit),
              capacity: String(data.get("capacity") ?? ""),
              ratio: String(data.get("ratio") ?? ""),
              forChildren: forChildren ? "1" : "",
            });
            setOpen(false);
          }}
          noValidate
          /* Input bubbles, so one handler on the form covers every field in
             it rather than each one carrying its own. */
          onInput={() => setDirty(true)}
          className="flex flex-col gap-4"
        >
          {/* R24.6. The way back to the list. Picking one is a head start,
              and a head start somebody cannot undo is a trap: the only way out
              of the wrong room was to close the panel and open it again. */}
          {library.length > 0 && !room ? (
            <button
              type="button"
              onClick={() => {
                setPicked(false);
                setPicking(true);
              }}
              className="-mt-1 inline-flex w-fit cursor-pointer items-center gap-1 rounded text-label font-medium text-primary"
            >
              <ChevronLeft className="size-4" aria-hidden />
              {t("rooms.backToList")}
            </button>
          ) : null}

          <Field label={t("rooms.name")} required>
            <Input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </Field>

          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-label text-fg">{t("rooms.forChildren")}</span>
            <Switch checked={forChildren} onCheckedChange={(on) => { setForChildren(on); setDirty(true); }} />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-label text-fg">{t("rooms.colour")}</span>
            <div className="flex flex-wrap gap-1.5">
              {HUES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={t(`hue.${option}` as never)}
                  aria-pressed={hue === option}
                  onClick={() => { setHue(option); setDirty(true); }}
                  className={
                    hue === option
                      ? "rounded-full p-1 ring-2 ring-primary"
                      : "rounded-full p-1 ring-2 ring-transparent hover:ring-line-strong"
                  }
                >
                  <HueDot hue={option} />
                </button>
              ))}
            </div>
          </div>

          {/* R8.14. Every room holds a number of members. The age bands and the
              volunteer ratio are what a children's room adds to that. */}
          {forChildren ? (
            <>
          <div className="flex flex-wrap gap-4">
            <AgeField
              key={`from-${band.at}`}
              label={t("rooms.from")}
              name="from"
              defaultValue={band.from ?? start?.value}
              unit={fromUnit}
              onUnit={setFromUnit}
            />
            <AgeField
              key={`to-${band.at}`}
              label={t("rooms.to")}
              name="to"
              defaultValue={band.to ?? end?.value}
              unit={toUnit}
              onUnit={setToUnit}
            />
          </div>

            <Field label={t("rooms.ratio")}>
              <Input
                name="ratio"
                type="number"
                min={1}
                inputMode="numeric"
                defaultValue={room?.ratio ?? ""}
              />
            </Field>
            </>
          ) : null}

          <Field label={t("rooms.capacity")}>
            <Input
              name="capacity"
              type="number"
              min={1}
              inputMode="numeric"
              defaultValue={room?.capacity ?? ""}
            />
          </Field>
        </form>
        )}
        {guard}
      </SheetContent>
    </Sheet>
  );
}

/**
 * R8.14. The one action this screen carries, at the top right beside its title.
 *
 * A new room is six fields rather than a name in a box, because a room nobody
 * gave an age band to is a room the station cannot route a child into.
 */
export function AddRoom({ taken = [] }: { taken?: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <RoomSheet
      pending={pending}
      taken={taken}
      title={t("rooms.add")}
      trigger={
        <Button data-guide="add-room">
          <Plus /> {t("rooms.add")}
        </Button>
      }
      onSave={(fields) => {
        const data = new FormData();
        for (const [k, v] of Object.entries(fields)) data.set(k, v);
        startTransition(async () => {
          await createRoom(data);
          router.refresh();
        });
      }}
    />
  );
}

/** A number and the unit it is in, because a nursery is counted in months. */
function AgeField({
  label,
  name,
  defaultValue,
  unit,
  onUnit,
}: {
  label: string;
  name: string;
  defaultValue: number | undefined;
  unit: string;
  onUnit: (unit: string) => void;
}) {
  return (
    <div className="flex min-w-56 flex-1 flex-col gap-1.5">
      <span className="text-label text-fg">{label}</span>
      <div className="flex gap-2">
        <Input
          name={name}
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={defaultValue ?? ""}
          className="flex-1"
          aria-label={label}
        />
        <Select value={unit} onValueChange={onUnit}>
          <SelectTrigger aria-label={label} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="months">{t("rooms.unit.months")}</SelectItem>
            <SelectItem value="years">{t("rooms.unit.years")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
