"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Banner, Combobox, Field, IconButton, Input } from "@connectapp/ui";
import { PhoneInput } from "@/components/phone-input";
import { FormActions, BackToView, formSettled } from "@/components/form-actions";
import {
  t, countryList, subdivisionsFor, hasSubdivisions, REGION_LABEL, POSTAL_LABEL,
  TAX_ID_LABEL, TAX_ID_SAMPLE,
} from "@connectapp/i18n";
import { Said } from "@/components/said";
import { FieldHint } from "@/components/field-hint";
import { saveChurch } from "./actions";
import { renameSite } from "./church/places-actions";
import { Details, Detail } from "./card";

export interface ChurchValues {
  slug: string;
  name: string;
  legalName: string | null;
  /**
   * R1.1, R1.5. Absent where the reader's role does not carry it, which is
   * what keeps the field off the screen as well as out of the record.
   */
  taxId?: string | null;
  timezone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  brandHue: string;
}

/** Every zone the browser knows, which is the list the server checks against. */
function timezones(): string[] {
  const all = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  return all ? all("timeZone") : ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];
}


export function ChurchForm({
  values,
  canEdit,
  logo,
  editing,
  onEditing,
  campus,
}: {
  values: ChurchValues;
  canEdit: boolean;
  /** R1.1. The logo row, which opens this section. */
  logo?: React.ReactNode;
  /** Held by the page, because the pencil here opens every section. */
  editing: boolean;
  onEditing: (next: boolean) => void;
  /** R1.2. The one campus, saved with the rest rather than on its own. */
  campus?: { id: string; name: string } | null;
}) {
  const [timezone, setTimezone] = React.useState(values.timezone);
  const [country, setCountry] = React.useState(values.country || "US");
  const [region, setRegion] = React.useState(values.region ?? "");
  const [error, setError] = React.useState<string>();
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const zones = React.useMemo(timezones, []);
  // Named in the reader's language, sorted the way that language sorts.
  const countries = React.useMemo(() => countryList(), []);
  const regions = subdivisionsFor(country);
  const regionLabel = REGION_LABEL[country] ?? t("church.region");
  /* R1.1. "ZIP code" is a United States term, and a church in Manchester
     reads it as a form written for somebody else. */
  const postalLabel = POSTAL_LABEL[country] ?? t("church.postalCode");
  /* R1.1. Named and exampled by the country on the record, so a church in
     Lagos is asked for an RC number rather than for an EIN. */
  const taxLabel = TAX_ID_LABEL[country] ?? t("church.taxId");
  const taxSample = TAX_ID_SAMPLE[country];
  /* R1.5. The field is on the screen only when the record carried it. */
  const mayReadTaxId = "taxId" in values;

  const save = (data: FormData) => {
    data.set("timezone", timezone);
    data.set("country", country);
    data.set("region", region);
    startTransition(async () => {
      const result = await saveChurch(data);

      /*
       * R1.2. The campus rides this form, so it is saved with it.
       *
       * Only when it has actually been changed: a church that edits its
       * address should not write to campuses as well.
       */
      const site = String(data.get("campusName") ?? "").trim();
      const siteError =
        campus && site && site !== campus.name
          ? (await renameSite(campus.id, site)).error
          : undefined;

      setError(result.error ?? siteError);
      setSaved(Boolean(result.saved) && !siteError);
      if (!result.error && !siteError) onEditing(false);
      /* R24.6. The form now shows what the server holds, whichever way the
         save went, so Save goes back to waiting for a change. */
      formSettled("church-form");
    });
  };



  return (
    <div className="flex flex-col gap-5" aria-busy={pending}>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved && !error ? (
        <Said message={t("church.saved")} onClose={() => setSaved(false)} />
      ) : null}

      {/* R1.1. The design lays these out as a grid that fills the room it has
          rather than two fixed columns, so a wide screen reads three across. */}
      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-5 shadow-sm">
        {/* The mark and the name read as the heading of the card, the way a
            person's face and name do on their own screen. */}
        <div className="flex flex-wrap items-center gap-4">
          {/* The way back to reading it, where this card is being edited. */}
          {editing ? (
            <BackToView form="church-form" onBack={() => onEditing(false)} />
          ) : null}

          {logo}
          <span className="min-w-0 flex-1 text-[17px] font-bold text-fg">{values.name}</span>
          {/* What commits this form sits on the card it changes, rather than
              up beside the page's own title. */}
          {editing ? (
            <FormActions
              pending={pending}
              form="church-form"
              guide="church-save"
              label={t("church.save")}
            />
          ) : canEdit ? (
            <IconButton
              label={t("church.edit")}
              variant="ghost"
              data-guide="church-details"
              onClick={() => onEditing(true)}
            >
              <Pencil />
            </IconButton>
          ) : null}
        </div>

        <hr className="border-0 border-t border-line" />

        {editing ? null : (
          <Reading
            values={values}
            regionLabel={regionLabel}
            postalLabel={postalLabel}
            taxLabel={taxLabel}
          />
        )}

        {/* The buttons that commit this form sit at the foot of the page,
            under the last section they change, so one press saves the lot. */}
        <form
          id="church-form"
          action={save}
          noValidate
          className={editing ? "flex flex-col gap-4" : "hidden"}
        >
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            <Field label={t("church.name")} required>
              <Input name="name" defaultValue={values.name} disabled={!canEdit} />
            </Field>
            <Field label={t("church.legalName")}>
              <Input name="legalName" defaultValue={values.legalName ?? ""} disabled={!canEdit} />
            </Field>
            {mayReadTaxId ? (
              <Field
                label={taxLabel}
                /* R22.2. The words sit in the panel rather than under the
                   box, so the form stays a form. */
                mark={
                  <FieldHint
                    title={country === "US" ? t("help.taxId.title") : t("help.taxIdOther.title")}
                    body={country === "US" ? t("help.taxId.body") : t("help.taxIdOther.body")}
                    label={t("church.taxIdHint")}
                  />
                }
              >
                <Input
                  name="taxId"
                  defaultValue={values.taxId ?? ""}
                  placeholder={taxSample ? t("church.taxIdSample", { sample: taxSample }) : undefined}
                  disabled={!canEdit}
                />
              </Field>
            ) : null}
            <Field label={t("church.address")} className="[grid-column:1/-1]">
              <Input name="addressLine1" defaultValue={values.addressLine1 ?? ""} disabled={!canEdit} />
            </Field>
            <Field label={t("church.addressLine2")} className="[grid-column:1/-1]">
              <Input name="addressLine2" defaultValue={values.addressLine2 ?? ""} disabled={!canEdit} />
            </Field>
            <Field label={t("church.city")}>
              <Input name="city" defaultValue={values.city ?? ""} disabled={!canEdit} />
            </Field>
            <Field label={regionLabel}>
              {hasSubdivisions(country) ? (
                <Combobox
                  options={regions.map((r) => ({ value: r.code, label: r.name, keywords: r.code }))}
                  value={region}
                  onChange={setRegion}
                  placeholder={t("church.chooseRegion")}
                  emptyLabel={t("church.noRegion")}
                  clearLabel={t("date.clear")}
                  disabled={!canEdit}
                />
              ) : (
                // A country whose regions we do not list gets a text field.
                // Half a list is worse than asking.
                <Input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={!canEdit}
                />
              )}
            </Field>
            <Field label={postalLabel}>
              <Input name="postalCode" defaultValue={values.postalCode ?? ""} disabled={!canEdit} />
            </Field>
            <Field label={t("church.country")}>
              <Combobox
                options={countries.map((c) => ({ value: c.code, label: c.name, keywords: c.code }))}
                value={country}
                onChange={(next) => {
                  setCountry(next);
                  // A state from the country you just left is wrong everywhere.
                  setRegion("");
                }}
                placeholder={t("church.chooseCountry")}
                emptyLabel={t("church.noCountry")}
                clearLabel={t("date.clear")}
                disabled={!canEdit}
              />
            </Field>
            <Field label={t("church.phone")}>
              <PhoneInput name="phone" defaultValue={values.phone ?? ""} disabled={!canEdit} />
            </Field>
            <Field label={t("church.email")}>
              <Input name="email" type="email" defaultValue={values.email ?? ""} disabled={!canEdit} />
            </Field>
            <Field label={t("church.website")}>
              <Input name="website" type="url" defaultValue={values.website ?? ""} disabled={!canEdit} />
            </Field>

            <Field label={t("church.timezone")} required>
              <Combobox
                options={zones.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
                value={timezone}
                onChange={setTimezone}
                placeholder={t("church.chooseTimezone")}
                emptyLabel={t("church.noTimezone")}
                clearLabel={t("date.clear")}
                disabled={!canEdit}
              />
            </Field>

          </div>

        </form>
      </section>
    </div>
  );
}

/**
 * A church writes "example.com" rather than a scheme, so one is put in front of
 * it to make a link. An address that already carries one is left as written.
 */
function href(website: string | null): string | undefined {
  const clean = website?.trim();
  if (!clean) return undefined;
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

/**
 * R1.1. The profile as a church reads it back.
 *
 * The same grid the form uses, so switching into editing moves nothing on the
 * screen except the boxes appearing around the words.
 */
function Reading({
  values,
  regionLabel,
  postalLabel,
  taxLabel,
}: {
  values: ChurchValues;
  regionLabel: string;
  postalLabel: string;
  taxLabel: string;
}) {
  /*
   * Keyed by the field rather than by its label. Two labels can read the same
   * and mean different things: a church in the United Kingdom has "Country"
   * for the line under the city and "Country" again for the country itself.
   */
  interface Line {
    key: string;
    label: string;
    value: string | null;
    link?: string;
  }

  const rows: Line[] = [
    // The name is the card's own heading, beside the mark.
    { key: "legalName", label: t("church.legalName"), value: values.legalName },
    // R1.5. Off the screen entirely where the record did not carry it.
    ...("taxId" in values
      ? [{ key: "taxId", label: taxLabel, value: values.taxId ?? null }]
      : []),
    {
      key: "address",
      label: t("church.address"),
      value: [values.addressLine1, values.addressLine2].filter(Boolean).join(", "),
    },
    { key: "city", label: t("church.city"), value: values.city },
    { key: "region", label: regionLabel, value: values.region },
    { key: "postalCode", label: postalLabel, value: values.postalCode },
    { key: "country", label: t("church.country"), value: values.country },
    {
      key: "phone",
      label: t("church.phone"),
      value: values.phone,
      link: values.phone?.trim() ? `tel:${values.phone.replace(/[^+\d]/g, "")}` : undefined,
    },
    {
      key: "email",
      label: t("church.email"),
      value: values.email,
      link: values.email?.trim() ? `mailto:${values.email.trim()}` : undefined,
    },
    { key: "website", label: t("church.website"), value: values.website, link: href(values.website) },
    {
      key: "timezone",
      label: t("church.timezone"),
      value: values.timezone.replace(/_/g, " "),
    },
  ];

  return (
    <Details>
      {rows.map(({ key, label, value, link }) => (
        <Detail key={key} label={label}>
          {!value?.trim() ? null : link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )}
        </Detail>
      ))}
    </Details>
  );
}
