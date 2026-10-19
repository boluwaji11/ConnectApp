import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../client";
import type { Permission } from "../permissions";
import { mailers } from "../schema/mailers";
import { InvalidInputError, NameTakenError, isUniqueViolation } from "../errors";
import { PermissionError, canEditPeople, type TenantRole } from "../roles";

/**
 * R16.12. The mailers a church keeps.
 *
 * Whoever may edit a member may write to one, which is the same door the
 * mailer screen is behind.
 *
 * It saves itself as it is typed, so every field here has to accept a
 * half-finished value. A mailer with no words yet is a real mailer: it is
 * what the screen looks like a second after it is started.
 */

/** Who it goes to. A list is named separately. */
export const MAILER_RECIPIENTS = ["households", "people", "list"] as const;
export type MailerRecipients = (typeof MAILER_RECIPIENTS)[number];

/**
 * The stock a church's labels print on.
 *
 * The geometry lives in `@connectapp/ui`, which the database layer does not
 * read. Held here as the set of names a row may carry, so a saved mailer
 * cannot name a sheet this product has never heard of.
 */
export const MAILER_PAPERS = ["envelope", "avery5160", "averyL7160", "avery5162"] as const;

/** The sizes a letter may be set at, in points. */
export const MAILER_SIZES = [10, 11, 12, 14] as const;

/** The typefaces a letter may be set in. The faces themselves live in the UI. */
export const MAILER_FONTS = [
  "inter", "georgia", "times", "garamond", "arial", "verdana",
] as const;

export interface Mailer {
  id: string;
  name: string;
  /** R24.6. Its readable address. */
  slug: string;
  recipients: MailerRecipients;
  listId: string | null;
  paper: string;
  skip: number;
  font: string;
  fontSize: number;
  body: string;
  archivedAt: Date | null;
  updatedAt: Date;
}

interface Actor {
  tenantId: string;
  role: TenantRole;
  userId?: string | null;
  permissions?: readonly Permission[] | null;
}

function guard(actor: Actor): void {
  if (!canEditPeople(actor)) throw new PermissionError(actor.role, "editPerson");
}

const clean = (name: string): string => name.trim().replace(/\s+/g, " ");

const shape = (row: typeof mailers.$inferSelect): Mailer => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  recipients: (MAILER_RECIPIENTS as readonly string[]).includes(row.recipients)
    ? (row.recipients as MailerRecipients)
    : "households",
  listId: row.listId,
  paper: (MAILER_PAPERS as readonly string[]).includes(row.paper) ? row.paper : "envelope",
  skip: row.skip,
  font: (MAILER_FONTS as readonly string[]).includes(row.font) ? row.font : "inter",
  fontSize: (MAILER_SIZES as readonly number[]).includes(row.fontSize) ? row.fontSize : 11,
  body: row.body,
  archivedAt: row.archivedAt,
  updatedAt: row.updatedAt,
});

/** Newest worked on first, which is the one somebody is coming back to. */
export async function listMailers(
  db: Tx,
  opts: { archivedOnly?: boolean } = {},
): Promise<Mailer[]> {
  const rows = await db
    .select()
    .from(mailers)
    .where(
      opts.archivedOnly
        ? sql`${mailers.archivedAt} is not null`
        : isNull(mailers.archivedAt),
    )
    .orderBy(desc(mailers.updatedAt), asc(mailers.name));
  return rows.map(shape);
}

export async function countArchivedMailers(db: Tx): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mailers)
    .where(sql`${mailers.archivedAt} is not null`);
  return row?.count ?? 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** R24.6. By its readable address, or by its id where that is what was given. */
export async function getMailer(db: Tx, key: string): Promise<Mailer | null> {
  const [row] = await db
    .select()
    .from(mailers)
    .where(UUID.test(key) ? eq(mailers.id, key) : eq(mailers.slug, key))
    .limit(1);
  return row ? shape(row) : null;
}

/** R16.12. A mailer begins with its name, and nothing else. */
export async function createMailer(
  db: Tx,
  actor: Actor,
  input: { name: string },
): Promise<Mailer> {
  guard(actor);

  const name = clean(input.name);
  if (!name) throw new InvalidInputError("post.error.name");

  try {
    const [row] = await db
      .insert(mailers)
      .values({
        tenantId: actor.tenantId,
        name,
        slug: sql`hearth_free_mailer_slug(${actor.tenantId}::uuid, ${name})`,
        createdByUserId: actor.userId ?? null,
      })
      .returning();
    return shape(row!);
  } catch (error) {
    if (isUniqueViolation(error, "mailers_name_unique")) {
      throw new NameTakenError("post.error.nameTaken", name, "");
    }
    throw error;
  }
}

export interface MailerPatch {
  id: string;
  name?: string;
  recipients?: string;
  listId?: string | null;
  paper?: string;
  skip?: number;
  font?: string;
  fontSize?: number;
  body?: string;
}

/**
 * R16.12. What the screen has become, written over what was there.
 *
 * Called on a timer while somebody types, so an unknown sheet or a nonsense
 * skip is corrected rather than refused: the one thing this must never do is
 * throw away the words because a field beside them was odd.
 */
export async function updateMailer(db: Tx, actor: Actor, input: MailerPatch): Promise<void> {
  guard(actor);

  const patch: Partial<typeof mailers.$inferInsert> = { updatedAt: new Date() };

  if (input.name !== undefined) {
    const name = clean(input.name);
    if (!name) throw new InvalidInputError("post.error.name");
    patch.name = name;
    // Renaming moves the address, the way it does for a report.
    patch.slug = sql`hearth_free_mailer_slug(${actor.tenantId}::uuid, ${name}, ${input.id}::uuid)` as never;
  }
  if (input.recipients !== undefined) {
    patch.recipients = (MAILER_RECIPIENTS as readonly string[]).includes(input.recipients)
      ? input.recipients
      : "households";
  }
  if (input.listId !== undefined) patch.listId = input.listId;
  if (input.paper !== undefined) {
    patch.paper = (MAILER_PAPERS as readonly string[]).includes(input.paper)
      ? input.paper
      : "envelope";
  }
  if (input.skip !== undefined) {
    patch.skip = Number.isFinite(input.skip) ? Math.max(0, Math.floor(input.skip)) : 0;
  }
  if (input.font !== undefined) {
    patch.font = (MAILER_FONTS as readonly string[]).includes(input.font)
      ? input.font
      : "inter";
  }
  if (input.fontSize !== undefined) {
    patch.fontSize = (MAILER_SIZES as readonly number[]).includes(input.fontSize)
      ? input.fontSize
      : 11;
  }
  if (input.body !== undefined) patch.body = input.body;

  try {
    await db.update(mailers).set(patch).where(eq(mailers.id, input.id));
  } catch (error) {
    if (isUniqueViolation(error, "mailers_name_unique")) {
      throw new NameTakenError("post.error.nameTaken", patch.name ?? "", input.id);
    }
    throw error;
  }
}

/** R2.13. Taken off the list, kept in the records. */
export async function setMailerArchived(
  db: Tx,
  actor: Actor,
  id: string,
  archived: boolean,
): Promise<void> {
  guard(actor);
  await db
    .update(mailers)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(mailers.id, id));
}
