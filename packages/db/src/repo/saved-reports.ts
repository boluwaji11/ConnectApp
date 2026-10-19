import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../client";
import type { Permission } from "../permissions";
import { savedReports } from "../schema/reports";
import { appUsers, tenantMembers } from "../schema/tenancy";
import { InvalidInputError, NameTakenError, isUniqueViolation } from "../errors";
import { PermissionError, canEditPeople, type TenantRole } from "../roles";
import { canManageChurch } from "./church";
import { canReadIncidents } from "./incidents";
import { cleanPage, type ReportPage } from "./report-spec";

/**
 * R18.x. Reports a church built for itself.
 *
 * Who may read a report may build one. Reports are already behind a staff role,
 * and a church where one person can read a list but may not keep the list she
 * reads every Monday has learned nothing except to use the export button.
 */

export interface SavedReport {
  id: string;
  name: string;
  slug: string;
  subject: string;
  spec: ReportPage;
  createdByUserId: string | null;
  /** R18.x. Whether the church sees it, rather than only whoever wrote it. */
  shared: boolean;
  /** R18.x. Who wrote it, for the line on its card. */
  createdBy: { name: string | null; role: TenantRole | null } | null;
  archivedAt: Date | null;
  updatedAt: Date;
}

interface Actor {
  tenantId: string;
  role: TenantRole;
  userId?: string | null;
  permissions?: readonly Permission[] | null;
}

const mayRead = (actor: Actor) => canEditPeople(actor) || canReadIncidents(actor);

/**
 * R18.x. Whose a report is.
 *
 * Whoever wrote it, and anybody once it has been shared. A church's own
 * administrators see every report, because they are the ones who answer for
 * what the church keeps and the ones who share them.
 */
const mine = (actor: Actor) =>
  sql`(${savedReports.sharedAt} is not null
    or ${savedReports.createdByUserId} = ${actor.userId ?? null})`;

/**
 * R18.x, R2.13. Whose a report is once it has been archived.
 *
 * Only its writer's. Somebody else's archive is their own housekeeping, and
 * a report taken off the list is off everybody's list but the one person who
 * can bring it back.
 */
const written = (actor: Actor) =>
  sql`${savedReports.createdByUserId} = ${actor.userId ?? null}`;

const clean = (name: string): string => name.trim().replace(/\s+/g, " ");

interface Written {
  name: string | null;
  role: TenantRole | null;
}

const shape = (
  row: typeof savedReports.$inferSelect,
  by: Written | null = null,
): SavedReport => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  subject: row.subject,
  // Read back through the catalogue, so a field that has since been taken out
  // cannot come back through a row saved last year.
  spec: cleanPage(row.spec),
  createdByUserId: row.createdByUserId,
  shared: row.sharedAt !== null,
  createdBy: by,
  archivedAt: row.archivedAt,
  updatedAt: row.updatedAt,
});

export async function listSavedReports(
  db: Tx,
  actor: Actor,
  opts: { includeArchived?: boolean; archivedOnly?: boolean } = {},
): Promise<SavedReport[]> {
  const rows = await db
    .select({
      report: savedReports,
      name: appUsers.fullName,
      role: tenantMembers.role,
    })
    .from(savedReports)
    /* R18.x. Who wrote it, read beside it rather than looked up a card at a
       time: a church with twenty reports is twenty round trips otherwise. */
    .leftJoin(appUsers, eq(appUsers.id, savedReports.createdByUserId))
    .leftJoin(
      tenantMembers,
      and(
        eq(tenantMembers.userId, savedReports.createdByUserId),
        eq(tenantMembers.tenantId, savedReports.tenantId),
      ),
    )
    .where(
      and(
        opts.archivedOnly ? written(actor) : mine(actor),
        opts.archivedOnly
          ? sql`${savedReports.archivedAt} is not null`
          : opts.includeArchived
            ? undefined
            : isNull(savedReports.archivedAt),
      ),
    )
    .orderBy(asc(savedReports.name));
  return rows.map((row) =>
    shape(row.report, row.name || row.role ? { name: row.name, role: row.role } : null),
  );
}

/** R18.x, R24.6. How many a church has archived, for the link that reaches them. */
export async function countArchivedSavedReports(db: Tx, actor: Actor): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedReports)
    .where(and(written(actor), sql`${savedReports.archivedAt} is not null`));
  return row?.count ?? 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** R24.6. By its readable address, or by its id where that is what was given. */
export async function getSavedReport(
  db: Tx,
  actor: Actor,
  key: string,
): Promise<SavedReport | null> {
  const [row] = await db
    .select()
    .from(savedReports)
    .where(
      and(
        mine(actor),
        UUID.test(key) ? eq(savedReports.id, key) : eq(savedReports.slug, key),
      ),
    )
    .limit(1);
  return row ? shape(row) : null;
}

export async function createSavedReport(
  db: Tx,
  actor: Actor,
  input: { name: string; spec: unknown },
): Promise<SavedReport> {
  if (!mayRead(actor)) throw new PermissionError(actor.role, "buildReports");

  const name = clean(input.name);
  if (!name) throw new InvalidInputError("report.error.name");
  const spec = cleanPage(input.spec);

  try {
    const [row] = await db
      .insert(savedReports)
      .values({
        tenantId: actor.tenantId,
        name,
        slug: sql`hearth_free_report_slug(${actor.tenantId}::uuid, ${name})`,
        subject: spec.tiles[0]?.subject ?? "members",
        spec,
        createdByUserId: actor.userId ?? null,
      })
      .returning();
    return shape(row!);
  } catch (error) {
    if (isUniqueViolation(error, "saved_reports_name_unique")) {
      throw new NameTakenError("report.error.nameTaken", name, "");
    }
    throw error;
  }
}

/** R18.x. Changing one that is already saved, name and all. */
export async function updateSavedReport(
  db: Tx,
  actor: Actor,
  input: { id: string; name?: string; spec?: unknown },
): Promise<void> {
  if (!mayRead(actor)) throw new PermissionError(actor.role, "buildReports");
  await assertOwns(db, actor, input.id);

  const patch: Partial<typeof savedReports.$inferInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = clean(input.name);
    if (!name) throw new InvalidInputError("report.error.name");
    patch.name = name;
    patch.slug = sql`hearth_free_report_slug(${actor.tenantId}::uuid, ${name}, ${input.id}::uuid)` as never;
  }
  if (input.spec !== undefined) {
    const spec = cleanPage(input.spec);
    patch.spec = spec;
    patch.subject = spec.tiles[0]?.subject ?? "members";
  }

  try {
    await db.update(savedReports).set(patch).where(eq(savedReports.id, input.id));
  } catch (error) {
    if (isUniqueViolation(error, "saved_reports_name_unique")) {
      throw new NameTakenError("report.error.nameTaken", patch.name ?? "", input.id);
    }
    throw error;
  }
}

/** R2.13. Archived rather than deleted, like everything else a church made. */
export async function setSavedReportArchived(
  db: Tx,
  actor: Actor,
  id: string,
  archived: boolean,
): Promise<void> {
  if (!mayRead(actor)) throw new PermissionError(actor.role, "buildReports");
  await assertOwns(db, actor, id);
  await db
    .update(savedReports)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(savedReports.id, id));
}

/**
 * R18.x. A report somebody else wrote is theirs to change.
 *
 * Sharing one puts it on everybody's screen; it does not hand anybody else
 * the pencil, an administrator included. What an administrator may do is
 * share it and take it back down again.
 */
async function assertOwns(db: Tx, actor: Actor, id: string): Promise<void> {
  const [row] = await db
    .select({ by: savedReports.createdByUserId })
    .from(savedReports)
    .where(eq(savedReports.id, id))
    .limit(1);
  if (!row) throw new InvalidInputError("report.error.missing");
  if (row.by !== (actor.userId ?? null)) {
    throw new PermissionError(actor.role, "buildReports");
  }
}

/** R18.x. Putting a report in front of the church, or taking it back. */
export async function setSavedReportShared(
  db: Tx,
  actor: Actor,
  id: string,
  shared: boolean,
): Promise<void> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "editChurch");
  // Sharing is done with your own report, by somebody who runs the church.
  await assertOwns(db, actor, id);
  await db
    .update(savedReports)
    .set({ sharedAt: shared ? new Date() : null, updatedAt: new Date() })
    .where(eq(savedReports.id, id));
}
