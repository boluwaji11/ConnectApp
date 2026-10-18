"use server";

import { revalidatePath } from "next/cache";
import {
  withTenant, setCustomDomain, setSelfSignup,
  canManageChurch, readDomain, dnsResolver, type DomainFindings,
  setPortalName, setPortalOpen, setSiteBuilder, portalNameFree,
  cleanPortalName, isReservedName,
  requireApproved,
} from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { requireSession } from "@/lib/session";
import { rememberChurch } from "@/lib/church-choice";
import { explain } from "@/lib/explain";
import { stepUpNeeded, type MayNeedStepUp } from "@/lib/step-up";

export interface DomainResult extends MayNeedStepUp {
  domain?: string | null;
  error?: string;
}

/** R1.1. The church's own address, set or cleared. */
export async function saveDomain(domain: string): Promise<DomainResult> {
  try {
    const session = await requireSession();

    /* R1.8, R21.4. The host a church answers at is what every member's
       session is scoped to, so changing it is a change to the way in. */
    const stop = await stepUpNeeded();
    if (stop) return stop;

    const saved = await withTenant(
      {
        tenantId: session.tenantId,
        role: session.role,
        userId: session.userId,
        permissions: session.permissions,
      },
      (tx) =>
        setCustomDomain(
          tx,
          { tenantId: session.tenantId, role: session.role, userId: session.userId },
          { domain: domain.trim() || null },
        ),
    );
    revalidatePath("/settings/church");
    return { domain: saved };
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R1.7. Opening or shutting the church's own door to new accounts. */
/**
 * R9.5. Where the church says its website is built.
 *
 * Kept so the steps are right the next time somebody opens this screen, and
 * so the next screen that needs it does not ask again.
 */
export async function saveSiteBuilder(builder: string | null): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await withTenant(
      { tenantId: session.tenantId, role: session.role, userId: session.userId },
      (tx) => setSiteBuilder(tx, session, builder),
    );
  } catch (error) {
    return { error: explain(error) };
  }
  return {};
}

export async function setSignup(open: boolean): Promise<{ error?: string }> {
  try {
    const session = await requireSession();
    await setSelfSignup(session.tenantId, session.role, open);
    revalidatePath("/settings/church");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * HRT-283, R22.2. Read the church's domain and say what is published.
 *
 * Nothing is written anywhere by this. It is the lookup any mail server on the
 * internet does before it delivers to them, done where the church can read the
 * answer, so the screen that asks to touch their DNS can first show that it
 * knows what is already there.
 */
export async function checkDomain(
  domain: string,
  /** Our own host, so the reading can say whether the name reaches us yet. */
  expect?: string,
): Promise<{ found?: DomainFindings; error?: string }> {
  const session = await requireSession();
  if (!canManageChurch(session)) {
    return { error: t("domain.error.notAllowed") };
  }

  const found = await readDomain(domain, dnsResolver(), expect);
  return found ? { found } : { error: t("domain.error.notADomain") };
}

/**
 * R1.1, R17.1. Whether this name is free, and taking it.
 *
 * Checked against every church's chosen name and every church's slug, because
 * a name that shadowed another church's own address would take that address
 * away from them.
 */
export async function claimPortalName(
  name: string,
  ): Promise<{ name?: string | null; free?: boolean; error?: string }> {
  const session = await requireSession();
  if (!canManageChurch(session)) return { error: t("domain.error.notAllowed") };

  try {
    const saved = await withTenant(
      {
        tenantId: session.tenantId,
        role: session.role,
        userId: session.userId,
        permissions: session.permissions,
      },
      (tx) =>
        setPortalName(
          tx,
          { tenantId: session.tenantId, role: session.role, userId: session.userId },
          { name: name.trim() || null },
        ),
    );
    /* R1.4. Renaming moves them off this address, and our own host is where
       they land when a cookie cannot follow. It serves the church it was told
       to serve, so it is told here. */
    await rememberChurch(session.tenantSlug);
    revalidatePath("/settings/website");
    return { name: saved, free: true };
  } catch (reason) {
    return { error: explain(reason) };
  }
}

/** R17.1. Turning the church's address on, or off. */
export async function openPortal(
  on: boolean,
  ): Promise<{ error?: string }> {
  try {
    const session = await requireSession();
    await withTenant(
      {
        tenantId: session.tenantId,
        role: session.role,
        userId: session.userId,
        permissions: session.permissions,
      },
      async (tx) => {
        if (on) await requireApproved(tx, session.tenantId);
        return setPortalOpen(
          tx,
          { tenantId: session.tenantId, role: session.role, userId: session.userId },
          on,
        );
      },
    );
    revalidatePath("/settings/website");
    return {};
  } catch (reason) {
    return { error: explain(reason) };
  }
}


/**
 * R1.1, R17.1. Whether a name is one this church could take, asked as it is
 * typed.
 *
 * Taking the name is still the only write, and the query layer still refuses a
 * name somebody else holds, so this is the screen telling somebody early
 * rather than the screen deciding. A church that types the name of a church in
 * the next town should learn it there, with the caret still in the field,
 * rather than on the press.
 */
export async function checkPortalName(
  name: string,
): Promise<{ free?: boolean; error?: string }> {
  const session = await requireSession();
  if (!canManageChurch(session)) return { error: t("domain.error.notAllowed") };

  const bare = cleanPortalName(name);
  if (!bare) return { error: t("portal.error.shape") };
  if (isReservedName(bare)) return { error: t("portal.error.blocked") };

  return (await portalNameFree(bare, session.tenantId))
    ? { free: true }
    : { error: t("portal.error.taken") };
}
