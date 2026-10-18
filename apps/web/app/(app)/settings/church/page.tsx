import {
  withTenant, getChurch, canManageChurch,
  primaryCampus,
} from "@connectapp/db";
import { requireSession } from "@/lib/session";
import { Denied } from "@/components/denied";
import { ChurchSections } from "./sections";
import { ChurchLogo } from "../logo";
import { supabaseServer } from "@/lib/supabase/server";
import { SettingsHeading } from "../heading";
import { t } from "@connectapp/i18n";
import { tabMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

/** R17.1. What the browser tab says. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  return tabMetadata(t("settings.tab.church"));
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  const session = await requireSession();

  /*
   * R1.1, R21.2. The church's own record is not open to everybody in it.
   *
   * The menu has always hidden this from a role without `church.manage`, and
   * hiding a link is not a check: typing the address rendered the legal name,
   * the address, the phone number, the email and the timezone to any member
   * of the church. Every other screen in this section refuses; this one
   * refused only the editing.
   */
  if (!canManageChurch(session)) {
    return <Denied role={session.role} action="editChurch" church={session.tenantSlug} />;
  }

  const { profile, campus } = await withTenant(
    { tenantId: session.tenantId, role: session.role },
    async (tx) => ({
      /* R1.5. The reader goes with the read, so the registration number is
         on the record for a role that carries `church.manage` and absent for
         everybody else. */
      profile: await getChurch(tx, session.tenantId, session),
      // R1.2. The one campus every record in this church hangs off.
      campus: await primaryCampus(tx),
    }),
  );

  // The bucket is private, so the logo is served through a short-lived signed
  // URL. A leaked path is then a leak with an expiry rather than a permanent one.
  let logoUrl: string | null = null;
  if (profile?.logoKey) {
    const supabase = await supabaseServer();
    const signed = await supabase.storage.from("church").createSignedUrl(profile.logoKey, 3600);
    logoUrl = signed.data?.signedUrl ?? null;
  }

  return (
    <div className="flex flex-col gap-5">
        {profile ? (
          <ChurchSections
            heading={<SettingsHeading title="settings.tab.church" lede="settings.lede.church" />}
            values={profile}
            campus={campus}
            canEdit={canManageChurch(session)}
            logo={
              <ChurchLogo
                churchName={session.tenantName}
                logoUrl={logoUrl}
                canEdit={canManageChurch(session)}
              />
            }
          />
        ) : null}

    </div>
  );
}
