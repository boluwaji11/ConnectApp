"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Upload, Trash2, X } from "lucide-react";
import {
  Banner, Button, Checkbox, Combobox, DatePicker, Field, IconButton, Input,
} from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { imageLimit } from "@/components/image-limit";
import { TimeField } from "@/components/time-field";
import { Picker } from "@/components/picker";
import { Searching } from "@/components/searching";
import { RichText } from "@/components/rich-text";
import { AddressFields } from "@/components/address-fields";
import { toAddress } from "@/lib/address";
import { FormActions, useReportBusy } from "@/components/form-actions";
import { create, save, findPerson, join, leave, type PersonHit } from "./actions";
import type { GroupDraft, GroupTypeOption } from "./group-form";
import { readingLocale } from "@/lib/reading-locale";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const FREQUENCIES = ["daily", "weekly", "fortnightly", "monthly"] as const;
const AUDIENCES = [
  "anyone", "men", "women", "young_adults", "students", "parents", "seniors",
] as const;

const dayName = (day: number) =>
  new Date(2024, 0, 7 + day).toLocaleDateString("en-US", { weekday: "long" });

/** A heading over a block, the same shape in both columns. */
function Side({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold tracking-[0.06em] text-fg uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Flag({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <Checkbox name={name} checked={checked} onCheckedChange={(on) => onChange(on === true)} />
      <span className="text-[length:var(--d-text-body)] text-fg">{label}</span>
    </label>
  );
}

/**
 * R9.1, R9.2. A group, written down on the page it will be read on.
 *
 * The same shape as the group's own screen: the name across the top with the
 * banner beside it, the line saying whether it is taking members, and under it
 * what the group is on the left with the facts about it down the right. Every
 * one of those is an input here. Somebody filling this in is looking at the
 * page they are making, rather than at a stack of fields that happens to
 * produce one.
 */
export function GroupEditor({
  church,
  types,
  group,
  ofType,
  leaders: already = [],
}: {
  church: string;
  types: GroupTypeOption[];
  /**
   * R9.1. The kind this one is being written under.
   *
   * A church reading its Small groups and pressing the press that makes
   * another has already said what kind it is, so the form opens on it.
   */
  ofType?: string;
  /** Given when an existing group is being changed. */
  group?: GroupDraft;
  /** R9.3. Who already leads it, so the list opens with them in it. */
  leaders?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string>();
  const [typeId, setTypeId] = React.useState(group?.typeId ?? ofType ?? "");
  const [online, setOnline] = React.useState(group?.online ?? false);
  const [childrenWelcome, setChildren] = React.useState(group?.childrenWelcome ?? false);
  const [openToJoin, setOpenToJoin] = React.useState(group?.openToJoin ?? true);
  const [listed, setListed] = React.useState(group?.listed ?? true);
  const [leaders, setLeaders] = React.useState(already);
  const [leader, setLeader] = React.useState("");
  const [hits, setHits] = React.useState<PersonHit[]>([]);
  const [endsOn, setEndsOn] = React.useState(group?.endsOn ?? "");
  // The picture is held until the group exists to hang it on, which is what
  // makes the banner editable on the way in as well as afterwards.
  const [picture, setPicture] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [saving, startTransition] = React.useTransition();

  // The save button lives in the page's header, outside this component, so the
  // busy state is reported rather than passed.
  useReportBusy("group-form", saving);
  const file = React.useRef<HTMLInputElement>(null);
  const [searching, setSearching] = React.useState(false);
  // An answer that arrives after a newer one was asked for is dropped.
  const ticket = React.useRef(0);

  React.useEffect(() => {
    if (!picture) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(picture);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [picture]);

  const hue = types.find((one) => one.id === typeId)?.hue ?? "sky";

  /** R9.3. Who runs it, looked up the way every other person field is. */
  const lookUp = (query: string) => {
    if (query.trim().length < 2) {
      ticket.current++;
      setSearching(false);
      setHits([]);
      return;
    }
    const mine = ++ticket.current;
    setSearching(true);
    void findPerson(query).then((found) => {
      if (mine !== ticket.current) return;
      setSearching(false);
      setHits(found);
    });
  };

  return (
    <form
      id="group-form"
      noValidate
      action={(data) => {
        if (group) data.set("id", group.id);
        startTransition(async () => {
          const result = await (group ? save(data) : create(data));
          setError(result.error);
          if (result.error) return;

          const id = result.id ?? group?.id;
          const slug = result.slug ?? group?.slug ?? id;
          /*
           * R9.3. The roster follows the list. Named leaders go on it, because
           * "Led by" is the first thing the group's card will say, and anybody
           * taken off the list comes off it.
           */
          if (id) {
            for (const one of leaders) {
              if (!already.some((x) => x.id === one.id)) {
                await join(id, one.id, "leader");
              }
            }
            for (const one of already) {
              if (!leaders.some((x) => x.id === one.id)) {
                await leave(id, one.id);
              }
            }
          }

          if (id && picture) {
            const upload = new FormData();
            upload.set("church", church);
            upload.set("purpose", "group_photo");
            upload.set("groupId", id);
            upload.set("file", picture);
            await fetch("/api/upload", { method: "POST", body: upload });
          }
          /*
           * R24.6. Replace rather than push: the form is finished with, and
           * leaving it in the history put the reader back on a blank New group
           * the moment they pressed Back from the group they had just written.
           */
          router.replace(id ? `/groups/${slug}` : "/groups");
        });
      }}
      className="flex flex-col gap-5"
    >
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {/* The name and when it meets on the left, the banner beside them, the
          same two columns the group's own page opens with. */}
      <div className="grid items-start gap-7 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        <div className="flex flex-col gap-4">
          {/* The label reads as the small-caps heading the rest of the page
              uses, so Name sits alongside About and Categories. */}
          <Field
            label={t("groups.name")}
            required
            className="[&>label]:text-[12px] [&>label]:font-bold [&>label]:tracking-[0.06em] [&>label]:text-fg [&>label]:uppercase"
          >
            <Input
              name="name"
              defaultValue={group?.name ?? ""}
              autoComplete="off"
              autoFocus
              placeholder={t("groups.namePlaceholder")}
            />
          </Field>

        </div>

        {/* The banner takes the kind's colour until a picture is chosen. The
            file is held and sent once the group exists to hang it on. */}
        <div className="relative">
          {preview ? (
            <img src={preview} alt="" className="aspect-[16/9] w-full rounded-[14px] object-cover" />
          ) : (
            <div
              className="grid aspect-[16/9] w-full place-items-center rounded-[14px]"
              style={{
                background: `var(--hue-${hue}-tint)`,
                color: `var(--hue-${hue}-key)`,
                border: `2px dashed var(--hue-${hue}-500)`,
              }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <ImagePlus className="size-7" aria-hidden />
                <span className="font-semibold">{t("group.banner.add")}</span>
                <span className="text-[12px]">{imageLimit("group_photo")}</span>
              </div>
            </div>
          )}

          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setPicture(e.target.files?.[0] ?? null)}
          />

          <Button
            type="button"
            variant="secondary"
            onClick={() => file.current?.click()}
            className="absolute right-3 bottom-3 h-[34px] min-h-0 gap-1.5 px-3 text-[13px] shadow-sm"
          >
            <Upload className="size-[15px]" aria-hidden />
            {preview ? t("group.banner.replace") : t("group.banner.upload")}
          </Button>

          {preview ? (
            <IconButton
              label={t("group.banner.remove")}
              variant="secondary"
              onClick={() => {
                setPicture(null);
                if (file.current) file.current.value = "";
              }}
              className="absolute top-3 right-3 size-8 min-h-0 shadow-sm"
            >
              <Trash2 />
            </IconButton>
          ) : null}
        </div>
      </div>

      {/* Whether it is taking members, on the line the group's page gives it. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-sunken px-[18px] py-3.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: openToJoin ? "var(--hue-fern-500)" : "var(--fg-subtle)" }}
        />
        <span className="min-w-[140px] flex-1 font-medium text-fg">
          {openToJoin ? t("group.openText") : t("group.closedText")}
        </span>
        <Flag
          name="openToJoin"
          label={openToJoin ? t("groups.openToJoin") : t("group.open")}
          checked={openToJoin}
          onChange={setOpenToJoin}
        />
      </div>

      <div className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-7">
          <Side label={t("group.about", { name: "" }).trim()}>
            <RichText
              name="description"
              defaultValue={group?.description ?? ""}
              className="max-w-[68ch]"
            />
          </Side>

          <Side label={t("group.schedule")}>
            <div className="grid max-w-[68ch] gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
              <Field label={t("groups.frequency")}>
                <Picker
                  name="frequency"
                  defaultValue={group?.frequency ?? null}
                  options={FREQUENCIES.map((f) => ({
                    value: f,
                    label: t(`groups.frequency.${f}` as never),
                  }))}
                  label={t("groups.frequency")}
                />
              </Field>

              <Field label={t("groups.day")}>
                <Picker
                  name="dayOfWeek"
                  defaultValue={
                    group?.dayOfWeek === null || group?.dayOfWeek === undefined
                      ? null
                      : String(group.dayOfWeek)
                  }
                  options={DAYS.map((d) => ({ value: String(d), label: dayName(d) }))}
                  label={t("groups.day")}
                />
              </Field>

              <Field label={t("groups.startsAt")}>
                <TimeField name="startsAt" defaultValue={group?.startsAt ?? ""} />
              </Field>

              <Field label={t("groups.endsAt")}>
                <TimeField name="endsAt" defaultValue={group?.endsAt ?? ""} />
              </Field>

              {/* R9.2. A class runs for eight weeks. Most groups leave it
                  empty and run until they do not. */}
              <Field label={t("groups.endsOn")}>
                <DatePicker
              locale={readingLocale()}
                  name="endsOn"
                  value={endsOn}
                  onChange={setEndsOn}
                  placeholder={t("date.placeholder")}
                  labels={{
                    open: t("date.open"),
                    clear: t("date.clear"),
                    previousMonth: t("date.previousMonth"),
                    nextMonth: t("date.nextMonth"),
                    month: t("date.month"),
                    year: t("date.year"),
                    today: t("date.today"),
                  }}
                />
              </Field>
            </div>
          </Side>

          <Side label={t("group.location")}>
            <div className="grid max-w-[68ch] gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
              <Field label={t("groups.location")} className="[grid-column:1/-1]">
                <Input name="location" defaultValue={group?.location ?? ""} autoComplete="off" />
              </Field>
              <AddressFields
                values={toAddress({
                  line1: group?.addressLine1,
                  line2: group?.addressLine2,
                  city: group?.city,
                  region: group?.region,
                  postalCode: group?.postalCode,
                  country: group?.country,
                })}
              />
            </div>
          </Side>
        </div>

        <aside className="flex flex-[1_1_260px] flex-col gap-6">
          <Side label={t("group.categories")}>
            <div className="flex flex-col gap-3">
              <Field label={t("groups.type")} required>
                <Picker
                  name="typeId"
                  /* R9.1. The kind the press came from, where it came from
                     one: a church reading its Small groups has already said
                     what kind this is. */
                  defaultValue={group?.typeId ?? ofType ?? null}
                  options={types.map((one) => ({ value: one.id, label: one.name }))}
                  label={t("groups.type")}
                  onChange={setTypeId}
                  create={{
                    href: "/settings/group-types",
                    label: t("groupType.create"),
                  }}
                />
              </Field>

              <Field label={t("groups.forWhom")}>
                <Picker
                  name="forWhom"
                  defaultValue={group?.forWhom ?? null}
                  options={AUDIENCES.map((a) => ({
                    value: a,
                    label: t(`groups.audience.${a}` as never),
                  }))}
                  label={t("groups.forWhom")}
                />
              </Field>
              <Flag
                name="childrenWelcome"
                label={t("groups.childrenWelcome")}
                checked={childrenWelcome}
                onChange={setChildren}
              />
              <Flag
                name="online"
                label={t("groups.online")}
                checked={online}
                onChange={setOnline}
              />
              <Flag
                name="listed"
                label={t("groups.listed")}
                checked={listed}
                onChange={setListed}
              />
            </div>
          </Side>

          {/* R9.3. Looked up in the directory, and more than one, because a
              group with two leaders is the common case. */}
          <Side label={t("group.leader")}>
            <div className="flex flex-col gap-2">
              {/* The way to name one leads, and whoever has been named gathers
                  under it: a field that walks down the screen as the list
                  grows is a field somebody loses. */}
              <Searching on={searching}>
                <Combobox
                  options={hits
                    .filter((one) => !leaders.some((x) => x.id === one.id))
                    .map((one) => ({ value: one.id, label: one.name }))}
                  value={leader}
                  onChange={(id) => {
                    const hit = hits.find((one) => one.id === id);
                    if (hit) setLeaders((was) => [...was, { id: hit.id, name: hit.name }]);
                    setLeader("");
                  }}
                  onQueryChange={lookUp}
                  placeholder={t("groups.leaders.add")}
                  emptyLabel={t("person.noMatch")}
                  clearLabel={t("date.clear")}
                />
              </Searching>

              {/* R24.6. The rail the product uses wherever a few things make up
                  one thing: a dot a row and a line running between them. */}
              {leaders.length > 0 ? (
                <ol className="m-0 flex list-none flex-col p-0">
                  {leaders.map((one) => (
                    <li key={one.id} className="flex gap-2.5">
                      <span className="flex w-5 shrink-0 flex-col items-center" aria-hidden>
                        <span className="mt-4 size-2.5 shrink-0 rounded-full bg-primary" />
                        <span className="my-1 w-px flex-1 bg-primary/35" />
                      </span>

                      <span className="flex min-w-0 flex-1 items-center gap-2 py-2">
                        <span className="min-w-0 flex-1 truncate text-[length:var(--d-text-body)] text-fg">
                          {one.name}
                        </span>
                        <IconButton
                          label={t("groups.remove")}
                          variant="ghost"
                          className="size-9 sm:size-8 [&_svg]:size-4"
                          // R9.3. A group keeps at least one. The last one
                          // comes off only once somebody else has been named.
                          disabled={leaders.length === 1}
                          onClick={() => setLeaders((was) => was.filter((x) => x.id !== one.id))}
                        >
                          <X />
                        </IconButton>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </Side>

          {/* R22.7. A Field rather than a Side: Side draws a span, which
              labels nothing, so the only control in this section reached a
              screen reader with no name at all. */}
          <Field label={t("groups.capacity")}>
            <Input
              name="capacity"
              inputMode="numeric"
              defaultValue={
                group?.capacity === null || group?.capacity === undefined
                  ? ""
                  : String(group.capacity)
              }
            />
          </Field>
        </aside>
      </div>
    </form>
  );
}

/** The one button that commits it, for the page's own corner. */
export function GroupFormActions({ editing }: { editing: boolean }) {
  return (
    <FormActions
      form="group-form"
      label={editing ? t("groups.saveChanges") : t("groups.create")}
    />
  );
}
