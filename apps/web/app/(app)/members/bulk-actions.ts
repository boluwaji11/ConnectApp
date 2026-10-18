"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  withTenant, bulkSetArchived, bulkSetStatus, bulkSetPersonTag, listPeople, addManyToGroup,
  type LifecycleStatus, canEditPeople, PermissionError,
} from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { requireSession } from "@/lib/session";
import { explain } from "@/lib/explain";
import { queryFromParams, type DirectoryParams } from "@/lib/directory-query";

export interface BulkResult {
  error?: string;
  changed?: number;
}

async function context() {
  const session = await requireSession();
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    actor: { tenantId: session.tenantId, role: session.role },
    ctx: {
      tenantId: session.tenantId,
      role: session.role,
      userId: session.userId,
      ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
    },
  };
}

const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const selection = (data: FormData) => data.getAll("ids").map(String).filter(Boolean);

/**
 * Bulk actions take the ids that were on screen, never the filter.
 *
 * A bulk action driven by "whatever the filter matched" does something different
 * from what the person was looking at the moment anything changes underneath
 * them, and what they were looking at is what they meant.
 */
export async function bulkArchive(data: FormData): Promise<BulkResult> {
  const ids = selection(data);
  if (ids.length === 0) return { changed: 0 };

  const { actor, ctx } = await context();
  try {
    const changed = await withTenant(ctx, (tx) =>
      bulkSetArchived(tx, actor, ids, field(data, "archived") === "1"),
    );
    revalidatePath("/members");
    return { changed };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function bulkStatus(data: FormData): Promise<BulkResult> {
  const ids = selection(data);
  const status = field(data, "status") as LifecycleStatus;
  if (ids.length === 0) return { changed: 0 };
  if (!status) return { error: t("error.chooseType") };

  const { actor, ctx } = await context();
  try {
    const changed = await withTenant(ctx, (tx) => bulkSetStatus(tx, actor, ids, status));
    revalidatePath("/members");
    return { changed };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function bulkTag(data: FormData): Promise<BulkResult> {
  const ids = selection(data);
  const tagId = field(data, "tagId");
  const on = field(data, "on") === "1";
  if (ids.length === 0) return { changed: 0 };
  if (!tagId) return { error: t("error.notFound.tag") };

  const { actor, ctx } = await context();
  try {
    const changed = await withTenant(ctx, (tx) => bulkSetPersonTag(tx, actor, ids, tagId, on));
    revalidatePath("/members");
    return { changed };
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R2.x. Every person the filter matches, as ids.
 *
 * "Select all" still ends in a list of ids rather than a filter, for the reason
 * above: the action acts on what somebody chose, and a filter can match
 * something different a second later.
 */
export async function matchingIds(
  params: DirectoryParams,
  ): Promise<{ ids: string[] }> {
  const session = await requireSession();
  const viewer = { role: session.role, userId: session.userId };

  const rows = await withTenant(
    { tenantId: session.tenantId, role: session.role },
    (tx) => listPeople(tx, { ...queryFromParams(params), viewer }),
  );
  return { ids: rows.map((row) => row.id) };
}

/** R9.4. Putting the members on screen into a group, in one go. */
export async function bulkAddToGroup(data: FormData): Promise<BulkResult> {
  const { actor, ctx } = await context();
    /*
     * SEC-022. A picker is a read of the whole directory, so it asks the same
     * permission the writes beside it ask.
     *
     * These returned name, address and household for anybody in the church to
     * any signed-in account. The product has a separate member-facing
     * directory whose default is name-only and whose visibility switches a
     * member can turn off; this handed out the staff view instead, so a member
     * who had turned every switch off was disclosed anyway.
     */
    if (!canEditPeople(actor)) throw new PermissionError(actor.role, "editPerson");

  const ids = selection(data);
  const groupId = field(data, "groupId");
  if (!groupId || ids.length === 0) return { changed: 0 };

  try {
    const today = new Date().toISOString().slice(0, 10);
    const changed = await withTenant(ctx, (tx) =>
      addManyToGroup(tx, actor, { groupId, memberIds: ids, joinedOn: today }),
    );
    revalidatePath("/members");
    revalidatePath("/groups");
    return { changed };
  } catch (error) {
    return { error: explain(error) };
  }
}
