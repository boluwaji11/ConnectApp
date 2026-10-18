import { themeFor } from "@connectapp/db";
import {
  withTenant, personForUser, getPerson, getPersonForEdit, listCampuses, anniversaryOf,
  listCustomFields, getCustomValues, anotherOwns,
} from "@connectapp/db";
import { Banner } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { requireScreen } from "@/lib/shell-data";
import { Church, SunMoon } from "lucide-react";
import { SettingsHeading } from "../heading";
import { SettingCard, Details, Detail } from "../card";
import { ProfileForm } from "./profile-form";
import { LeaveChurch } from "./leave-church";
import { toAddress } from "@/lib/address";
import { ThemeChoice } from "../theme";
import { NotifyChoice } from "@/components/shell/notify-choice";
import type { Theme } from "../theme-actions";
import { supabaseServer } from "@/lib/supabase/server";
import { tabMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

/** R17.1. What the browser tab says. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  return tabMetadata(t("settings.tab.profile"));
}

/**
 * R17.1. The one screen about the person reading it.
 *
 * Their own record in the church's directory, edited in place. What is saved
 * here is what the church holds, so a corrected phone number is corrected
 * everywhere rather than in a copy only this screen knows about.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  const session = await requireScreen();

  /*
   * R24.x. What they chose, from their account rather than from this browser,
   * so the card answers the same on every device they sign in on. R1.4. And
   * whether the last owner is alone, because the last owner cannot leave and
   * the card says so rather than letting them find out by pressing. Two reads
   * of two different tables that waited on each other for nothing.
   */
  const [chosen, another] = await Promise.all([
    themeFor(session.userId),
    anotherOwns(session.tenantId, session.userId),
  ]);
  const theme = (chosen ?? "system") as Theme;
  const alone = !another;

  const result = await withTenant(
    { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
    async (tx) => {
      const self = await personForUser(tx, session.userId);
      if (!self) return null;

      /* Six reads about one person, none of which wanted anything from the
         others once that person was known. */
      const [person, contact, campuses, anniversary, customFields, customValues] =
        await Promise.all([
          getPerson(tx, self, { role: session.role, userId: session.userId }),
          getPersonForEdit(tx, self),
          listCampuses(tx),
          anniversaryOf(tx, self),
          /* R1.10, R17.1. Whatever this church asks about its people. The
             ones it marked as theirs to change are theirs to change here. */
          listCustomFields(tx, "person"),
          getCustomValues(tx, "person", self),
        ]);

      return {
        memberId: self,
        person,
        contact,
        campuses,
        anniversary,
        customFields,
        customValues,
        photoKey: person?.photoKey ?? null,
      };
    },
  );

  /*
   * The bucket is private, so a face is served through a signed URL with an
   * hour on it. Every settings screen is force-dynamic, so a reader who leaves
   * a tab open overnight gets a fresh one on their next navigation.
   */
  let photoUrl: string | null = null;
  if (result?.photoKey) {
    const supabase = await supabaseServer();
    const signed = await supabase.storage.from("church").createSignedUrl(result.photoKey, 3600);
    photoUrl = signed.data?.signedUrl ?? null;
  }

  return (
    <>
      <SettingsHeading title="settings.title.profile" lede="settings.lede.profile" />

      {result?.person ? (
        <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
          <ProfileForm
            signedInAs={session.email}
            photoUrl={photoUrl}
            campuses={result.campuses.map((one) => ({ id: one.id, name: one.name }))}
            values={{
              memberId: result.memberId,
              firstName: result.person.firstName,
              lastName: result.person.lastName,
              phone: result.contact?.phone ?? "",
              dateOfBirth: result.person.dateOfBirth ?? "",
              address: toAddress(result.contact?.address as never),
              maritalStatus: result.person.maritalStatus,
              anniversary: result.anniversary ?? "",
              campusId: result.person.campusId,
            }}
            customFields={result.customFields.map((one) => ({
              id: one.id,
              label: one.label,
              type: one.type,
              options: one.options,
              memberEditable: one.memberEditable,
            }))}
            customValues={result.customValues}
          />
        </section>
      ) : (
        <Banner tone="info" title={t("settings.title.profile")}>
          {t("settings.profile.noRecord")}
        </Banner>
      )}

      {/* R24.x, R16.10, R1.6. Two things somebody reads rather than fills in:
          how the product is drawn, and which church they are signed in to.
          Side by side, because neither is long enough to hold a row of its own
          and a rule between them says they are separate. One column on a
          phone, where there is no room for two. */}
      <div className="grid gap-5 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
      <div className="md:pr-5">
      <SettingCard
        className="h-full"
        icon={<SunMoon />}
        title={t("settings.preferences")}
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            {/* The same label every other field on this screen carries. */}
            <span className="text-[12px] font-medium tracking-[0.02em] text-fg-subtle uppercase">{t("settings.pref.appearance")}</span>
            <ThemeChoice current={theme} />
          </div>

          <NotifyChoice />
        </div>
      </SettingCard>

      </div>

      {/* R1.6. Which church somebody is signed in to and what they may do in
          it. Neither is theirs to change, so it sits outside the card the
          pencil opens. */}
      <div className="md:pl-5">
      <SettingCard
        className="h-full"
        icon={<Church />}
        title={t("settings.profile.church")}
        lede={session.tenantName}
        action={<LeaveChurch name={session.tenantName} alone={alone} />}
      >
        <Details>
          <Detail label={t("settings.profile.churchName")}>{session.tenantName}</Detail>
          <Detail label={t("settings.profile.role")}>
            {t(`role.${session.role}` as never)}
          </Detail>
        </Details>
      </SettingCard>
      </div>
      </div>
    </>
  );
}
