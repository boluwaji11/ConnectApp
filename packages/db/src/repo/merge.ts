import { eq, sql } from "drizzle-orm";
import type { Tx } from "../client";
import type { Permission } from "../permissions";
import { members } from "../schema/members";
import { personMerges } from "../schema/merges";
import { canArchivePeople, PermissionError, type TenantRole } from "../roles";
import { InvalidInputError } from "../errors";
import { leadWith } from "./contacts";
import { getPersonForEdit, type PersonInput } from "./members";
import {
  buildDuplicateIndex, findMatches, type Confidence, type MatchIndex,
} from "../import/match";

/**
 * R2.8. Merging two records that are one person, and undoing it.
 *
 * The undo is not a nice extra. Merging the wrong two members is the fear that
 * stops anybody pressing the button, and a merge nobody dares press leaves the
 * duplicates in the directory, which is the problem this was for.
 */

export const MERGE_UNDO_WINDOW_DAYS = 30;

/**
 * Tables whose rows belong to a person and move with them.
 *
 * import_rows is deliberately absent. It records what an import did at the time,
 * and re-pointing it would make the history say something that did not happen.
 */
const OWNED: {
  table: string;
  column: string;
  conflictOn?: string[];
  /**
   * Extra SQL narrowing what counts as a collision, where the unique index is
   * partial. `w` is the winner's row and `t` the loser's. Without this, a
   * membership the winner once left would block the loser's live one from
   * moving, and the person would quietly come off the group.
   */
  liveOnly?: string;
  /** The column naming one row, where the table has no `id` of its own. */
  key?: string;
}[] = [
  { table: "contact_methods", column: "member_id" },
  { table: "addresses", column: "member_id" },
  { table: "household_memberships", column: "member_id" },
  { table: "milestones", column: "member_id" },
  { table: "background_checks", column: "member_id" },
  { table: "notes", column: "member_id" },
  // A tag the winner already carries would collide, so those rows stay put.
  { table: "member_tags", column: "member_id", conflictOn: ["tag_id"], key: "tag_id" },
  // Same for a custom field the winner has already answered.
  { table: "custom_field_values", column: "entity_id", conflictOn: ["field_id"] },
  // R1.14. A list the winner is already on would collide, so those rows stay.
  { table: "saved_list_members", column: "member_id", conflictOn: ["list_id"] },
  // R9.4. Group membership. Only a live row collides with a live row: the index
  // is partial, and the history of somebody who left and came back is two rows
  // on purpose.
  {
    table: "group_memberships",
    column: "member_id",
    conflictOn: ["group_id"],
    liveOnly: "w.left_on is null and t.left_on is null",
  },
  // R5.3. One open entry per person per pipeline, so only two open entries
  // collide. A closed one is history and moves.
  {
    table: "pipeline_entries",
    column: "member_id",
    conflictOn: ["pipeline_id"],
    liveOnly: "w.status = 'open' and t.status = 'open'",
  },
  // R5.1. A task about this person. Nothing is unique, so all of it moves.
  { table: "follow_ups", column: "member_id" },
  // R9.5. A request to join, which belongs to whoever is left standing.
  {
    table: "group_join_requests",
    column: "member_id",
    conflictOn: ["group_id"],
    liveOnly: "w.decided_at is null and t.decided_at is null",
  },
  // R10.1. Serving on a team. Partial index again, same reason as a group.
  {
    table: "team_members",
    column: "member_id",
    conflictOn: ["team_id"],
    liveOnly: "w.left_on is null and t.left_on is null",
  },
  // R10.3. The schedule. Two rows collide when both are the same position at the
  // same service, which is the same person scheduled twice.
  {
    table: "serving_assignments",
    column: "member_id",
    conflictOn: ["occurrence_id", "position_id"],
  },
  // R10.4. Days they said they are away. Nothing is unique, so all of it moves.
  { table: "blockout_dates", column: "member_id" },
  // R10.5. One preference a person, so any row the winner already has is the
  // collision. `tenant_id` is the same on every row in the church, which makes
  // it the predicate that asks "does the winner have one".
  {
    table: "serving_preferences",
    column: "member_id",
    conflictOn: ["tenant_id"],
    key: "member_id",
  },
];

/**
 * The column naming one row, for the tables that have no `id` of their own.
 * Read on the way back out of a merge, where only the table name survives in
 * the record of what moved.
 */
const KEYS: Record<string, string> = Object.fromEntries(
  OWNED.filter((o) => o.key).map((o) => [o.table, o.key!]),
);

/**
 * SEC-027. The table and column names this file will ever put in a statement.
 *
 * `undoMerge` reads them back out of `person_merges.moved_rows`, a jsonb column
 * written by the merge itself from the list above, and used them as SQL
 * identifiers. Nothing in the product writes that column from anything a
 * caller sends, so there is no path to it today, but a value that has been to
 * the database and back is not the same thing as a constant, and an identifier
 * is the one position a parameter cannot occupy. Checked against the list it
 * is supposed to have come from, so the question does not arise.
 */
const ALLOWED_COLUMNS: Record<string, Set<string>> = OWNED.reduce(
  (all, one) => {
    const columns = all[one.table] ?? new Set<string>();
    columns.add(one.column);
    if (one.key) columns.add(one.key);
    all[one.table] = columns;
    return all;
  },
  {} as Record<string, Set<string>>,
);

export interface MergePlan {
  winnerId: string;
  loserId: string;
  /** Field by field, which record's value survives. Absent means the winner's. */
  take?: Partial<Record<keyof PersonInput, "winner" | "loser">>;
}

export interface MergeResult {
  mergeId: string;
  movedRows: number;
}

/**
 * Merges the loser into the winner.
 *
 * The loser is archived, never deleted. Archiving is what makes undo possible at
 * all, and it is also the honest answer: the record existed, somebody created
 * it, and its id may be referenced by an import's history or an audit entry.
 */
export async function mergePeople(
  db: Tx,
  actor: { tenantId: string; role: TenantRole; userId?: string; permissions?: readonly Permission[] | null },
  plan: MergePlan,
): Promise<MergeResult> {
  // A merge can move every note and every giving record off one person and onto
  // another. That is archive-shaped work, not edit-shaped work.
  if (!canArchivePeople(actor)) throw new PermissionError(actor.role, "mergePeople");
  if (plan.winnerId === plan.loserId) throw new InvalidInputError("merge.error.samePerson");

  const winner = await getPersonForEdit(db, plan.winnerId);
  const loser = await getPersonForEdit(db, plan.loserId);
  if (!winner || !loser) throw new InvalidInputError("merge.error.notFound");
  if (loser.archivedAt) throw new InvalidInputError("merge.error.alreadyArchived");

  const moved: { table: string; id: string }[] = [];

  /*
   * R2.4. Which contacts the winner was already leading with, read before the
   * loser's are moved across. Both records bring a primary of their own, and
   * the one somebody has been using should go on being the one.
   */
  const led = (await db.execute<{ id: string; kind: string }>(sql`
    select id, kind::text as kind from contact_methods
     where member_id = ${plan.winnerId}::uuid and is_primary`)) as unknown as
    { id: string; kind: string }[];
  const leading = new Map(led.map((one) => [one.kind, one.id]));

  for (const owned of OWNED) {
    // Only rows that would not collide with something the winner already has.
    // A colliding row stays on the loser, which is archived rather than deleted,
    // so nothing is lost and undo has less to put back.
    const keep = owned.conflictOn?.length
      ? sql`and not exists (
          select 1 from ${sql.identifier(owned.table)} w
          where w.${sql.identifier(owned.column)} = ${plan.winnerId}::uuid
            and ${sql.join(
              owned.conflictOn.map((c) => sql`w.${sql.identifier(c)} = t.${sql.identifier(c)}`),
              sql` and `,
            )}
            ${owned.liveOnly ? sql`and ${sql.raw(owned.liveOnly)}` : sql``}
        )`
      : sql``;

    const rows = (await db.execute(sql`
      update ${sql.identifier(owned.table)} t
         set ${sql.identifier(owned.column)} = ${plan.winnerId}::uuid
       where t.${sql.identifier(owned.column)} = ${plan.loserId}::uuid
         ${keep}
      returning t.${sql.identifier(owned.key ?? "id")} as id`)) as unknown as {
      id: string;
    }[];

    for (const row of rows) moved.push({ table: owned.table, id: row.id });
  }

  // Relationships point at two members, so both ends are re-pointed.
  for (const column of ["member_id", "related_member_id"]) {
    const rows = (await db.execute(sql`
      update relationships
         set ${sql.identifier(column)} = ${plan.winnerId}::uuid
       where ${sql.identifier(column)} = ${plan.loserId}::uuid
      returning id`)) as unknown as { id: string }[];
    for (const row of rows) moved.push({ table: `relationships.${column}`, id: row.id });
  }

  // A relationship can now point at the same person on both ends, which is not a
  // relationship. Those are removed rather than left as nonsense.
  await db.execute(sql`
    delete from relationships where member_id = related_member_id and member_id = ${plan.winnerId}::uuid`);

  // R2.4. Exactly one of each kind leads, and it is the one the winner was
  // already leading with. What came across joins the list behind it.
  await leadWith(db, plan.winnerId, "email", leading.get("email") ?? null);
  await leadWith(db, plan.winnerId, "phone", leading.get("phone") ?? null);

  const survived = applyChoices(winner, loser, plan.take);
  await db
    .update(members)
    .set({
      firstName: survived.firstName,
      lastName: survived.lastName,
      preferredName: survived.preferredName ?? null,
      dateOfBirth: survived.dateOfBirth ?? null,
      lifecycleStatus: survived.lifecycleStatus,
      membershipDate: survived.membershipDate ?? null,
      firstVisitOn: survived.firstVisitOn ?? null,
      updatedAt: new Date(),
    })
    .where(eq(members.id, plan.winnerId));

  await db
    .update(members)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(members.id, plan.loserId));

  const [merge] = await db
    .insert(personMerges)
    .values({
      tenantId: actor.tenantId,
      winnerId: plan.winnerId,
      loserId: plan.loserId,
      winnerBefore: winner,
      movedRows: moved,
      mergedByUserId: actor.userId ?? null,
    })
    .returning({ id: personMerges.id });
  if (!merge) throw new Error("Merge insert returned no row.");

  return { mergeId: merge.id, movedRows: moved.length };
}

/** Field by field, whose value survives. The winner's, unless the loser's was chosen. */
function applyChoices(
  winner: PersonInput,
  loser: PersonInput,
  take: MergePlan["take"],
): PersonInput {
  const pick = <K extends keyof PersonInput>(key: K): PersonInput[K] =>
    take?.[key] === "loser" ? loser[key] : winner[key];

  return {
    firstName: pick("firstName") || winner.firstName,
    lastName: pick("lastName") || winner.lastName,
    preferredName: pick("preferredName"),
    dateOfBirth: pick("dateOfBirth"),
    lifecycleStatus: pick("lifecycleStatus"),
    membershipDate: pick("membershipDate"),
    firstVisitOn: pick("firstVisitOn"),
  };
}

export interface MergeSummary {
  id: string;
  winnerId: string;
  loserId: string;
  winnerName: string;
  loserName: string;
  mergedAt: Date;
  undoneAt: Date | null;
  canUndo: boolean;
}

/** How many merges a church has, for the foot of the list. */
export async function countMerges(db: Tx): Promise<number> {
  const [row] = (await db.execute(sql`
    select count(*)::int as n from person_merges`)) as unknown as { n: number }[];
  return row?.n ?? 0;
}

const withinWindow = (at: Date): boolean =>
  Date.now() - at.getTime() <= MERGE_UNDO_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * R2.8. What a church merged, newest first.
 *
 * Paged, because merging a group of five writes four lines at once and a
 * church that tidied its directory has a list nobody scrolls to the end of.
 */
export async function listMerges(
  db: Tx,
  window?: { page?: number; perPage?: number },
): Promise<MergeSummary[]> {
  const perPage = Math.max(1, window?.perPage ?? 50);
  const skip = Math.max(0, ((window?.page ?? 1) - 1) * perPage);

  const rows = (await db.execute(sql`
    select m.id, m.winner_id, m.loser_id, m.merged_at, m.undone_at,
           w.first_name || ' ' || w.last_name as winner_name,
           l.first_name || ' ' || l.last_name as loser_name
      from person_merges m
      join members w on w.id = m.winner_id
      join members l on l.id = m.loser_id
     order by m.merged_at desc
     limit ${perPage} offset ${skip}`)) as unknown as {
    id: string;
    winner_id: string;
    loser_id: string;
    // A raw execute hands back what the driver gave it. Drizzle's date parsers
    // are installed for typed selects, not for this, so the timestamps arrive as
    // strings and are turned into dates here rather than at four call sites.
    merged_at: string | Date;
    undone_at: string | Date | null;
    winner_name: string;
    loser_name: string;
  }[];

  const asDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

  return rows.map((r) => ({
    id: r.id,
    winnerId: r.winner_id,
    loserId: r.loser_id,
    winnerName: r.winner_name,
    loserName: r.loser_name,
    mergedAt: asDate(r.merged_at),
    undoneAt: r.undone_at ? asDate(r.undone_at) : null,
    canUndo: !r.undone_at && withinWindow(asDate(r.merged_at)),
  }));
}

/**
 * Puts a merge back.
 *
 * Exactly the rows that moved go back, named individually rather than found
 * again by a rule. A rule would also catch rows created since the merge, which
 * belong to the surviving person and were never part of it.
 */
export async function undoMerge(
  db: Tx,
  actor: { tenantId: string; role: TenantRole },
  mergeId: string,
): Promise<{ restoredRows: number }> {
  if (!canArchivePeople(actor)) throw new PermissionError(actor.role, "mergePeople");

  const [merge] = await db.select().from(personMerges).where(eq(personMerges.id, mergeId)).limit(1);
  if (!merge) throw new InvalidInputError("merge.error.notFound");
  if (merge.undoneAt) throw new InvalidInputError("merge.error.alreadyUndone");
  if (!withinWindow(merge.mergedAt)) throw new InvalidInputError("merge.error.tooOld");

  const moved = merge.movedRows ?? [];
  let restored = 0;

  for (const row of moved) {
    const [table, column] = row.table.includes(".")
      ? row.table.split(".")
      : [row.table, row.table === "member_tags" ? "member_id" : row.table === "custom_field_values" ? "entity_id" : "member_id"];

    const key = KEYS[table!] ?? "id";

    /* SEC-027. Only a pair this file could have written. */
    const columns = ALLOWED_COLUMNS[table ?? ""];
    if (!columns || !columns.has(column ?? "") || !(key === "id" || columns.has(key))) {
      throw new InvalidInputError("merge.error.notFound");
    }

    const result = (await db.execute(sql`
      update ${sql.identifier(table!)}
         set ${sql.identifier(column!)} = ${merge.loserId}::uuid
       where ${sql.identifier(column!)} = ${merge.winnerId}::uuid
         and ${sql.identifier(key)} = ${row.id}::uuid
      returning ${sql.identifier(key)}`)) as unknown as unknown[];
    restored += result.length;
  }

  const before = merge.winnerBefore as PersonInput | null;
  if (before) {
    await db
      .update(members)
      .set({
        firstName: before.firstName,
        lastName: before.lastName,
        preferredName: before.preferredName ?? null,
        dateOfBirth: before.dateOfBirth ?? null,
        lifecycleStatus: before.lifecycleStatus,
        membershipDate: before.membershipDate ?? null,
        firstVisitOn: before.firstVisitOn ?? null,
        updatedAt: new Date(),
      })
      .where(eq(members.id, merge.winnerId));
  }

  await db
    .update(members)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(members.id, merge.loserId));

  await db.update(personMerges).set({ undoneAt: new Date() }).where(eq(personMerges.id, mergeId));

  return { restoredRows: restored };
}

export interface DuplicatePair {
  a: { id: string; name: string };
  b: { id: string; name: string };
  confidence: Confidence;
  reason: string;
}

/**
 * The review queue (R2.8): every pair in the directory that might be one person.
 *
 * Built from the same matching rules the import uses, so what the import calls a
 * duplicate and what this calls a duplicate are the same thing. Two lists that
 * disagree about what a duplicate is would be worse than one.
 */
export async function findDuplicatePairs(db: Tx): Promise<DuplicatePair[]> {
  return pairsFrom(await buildDuplicateIndex(db));
}

/**
 * The pairs an index holds, which is the part that has no database in it.
 *
 * Kept separate so the narrowed index can be held against one built from the
 * whole church and shown to find the same pairs. R24.11 made the queue read
 * only the people who share a key with somebody; this is what proves the
 * narrowing drops nobody.
 */
export function pairsFrom(index: MatchIndex): DuplicatePair[] {
  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];

  for (const person of index.all) {
    const matches = findMatches(index, {
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.emails[0] ?? null,
      phone: person.phones[0] ?? null,
      dateOfBirth: person.dateOfBirth,
    });

    for (const match of matches) {
      if (match.memberId === person.id) continue;
      // One row per pair, whichever way round it was found.
      const key = [person.id, match.memberId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);

      pairs.push({
        a: { id: person.id, name: `${person.preferredName ?? person.firstName} ${person.lastName}` },
        b: { id: match.memberId, name: match.displayName },
        confidence: match.confidence,
        reason: match.reason,
      });
    }
  }

  const rank = { certain: 3, likely: 2, possible: 1 };
  return pairs.sort((x, y) => rank[y.confidence] - rank[x.confidence]);
}

export interface DuplicateCluster {
  /** Every record that looks like the same person, strongest match first. */
  members: { id: string; name: string }[];
  confidence: Confidence;
  reason: string;
}

/**
 * The review queue as the work actually is (R2.8): one person, however many
 * copies of them.
 *
 * A church that took the same family's connection card at five services has
 * five records of one person, and five records make ten pairs. Ten decisions
 * for what is one decision, and merging any of them takes four other pairs off
 * the list, so the queue jumps about while somebody works through it.
 *
 * So the pairs are joined up first. Two records that match each other are the
 * same person, and a third matching either of them belongs with both, which is
 * what makes this a group rather than a list of pairs.
 */
export async function findDuplicateClusters(db: Tx): Promise<DuplicateCluster[]> {
  const pairs = await findDuplicatePairs(db);

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id);
    if (!up || up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  const join = (x: string, y: string) => {
    const [a, b] = [find(x), find(y)];
    if (a !== b) parent.set(a, b);
  };

  const rank: Record<Confidence, number> = { certain: 3, likely: 2, possible: 1 };
  const names = new Map<string, string>();
  const best = new Map<string, { confidence: Confidence; reason: string }>();

  for (const pair of pairs) {
    names.set(pair.a.id, pair.a.name);
    names.set(pair.b.id, pair.b.name);
    parent.set(pair.a.id, parent.get(pair.a.id) ?? pair.a.id);
    parent.set(pair.b.id, parent.get(pair.b.id) ?? pair.b.id);
    join(pair.a.id, pair.b.id);
  }

  // The strongest reason anywhere in a group is what the group is called, so a
  // group holding one certain match is not described by its weakest pair.
  for (const pair of pairs) {
    const root = find(pair.a.id);
    const held = best.get(root);
    if (!held || rank[pair.confidence] > rank[held.confidence]) {
      best.set(root, { confidence: pair.confidence, reason: pair.reason });
    }
  }

  const grouped = new Map<string, string[]>();
  for (const id of names.keys()) {
    const root = find(id);
    grouped.set(root, [...(grouped.get(root) ?? []), id]);
  }

  return [...grouped.entries()]
    .map(([root, ids]) => ({
      members: ids.map((id) => ({ id, name: names.get(id)! })),
      confidence: best.get(root)?.confidence ?? "possible",
      reason: best.get(root)?.reason ?? "merge.reason.name",
    }))
    .sort((x, y) =>
      rank[y.confidence] - rank[x.confidence] || y.members.length - x.members.length);
}

/**
 * R2.8. Every copy of one person, onto the one that survives.
 *
 * Each merge is written down on its own, so a church that changes its mind
 * about one of the five can put that one back without unpicking the rest.
 */
export async function mergeCluster(
  db: Tx,
  actor: { tenantId: string; role: TenantRole; userId?: string; permissions?: readonly Permission[] | null },
  plan: { winnerId: string; loserIds: string[] },
): Promise<{ merges: string[] }> {
  if (!canArchivePeople(actor)) throw new PermissionError(actor.role, "mergePeople");
  if (plan.loserIds.length === 0) throw new InvalidInputError("merge.error.nobody");
  if (plan.loserIds.includes(plan.winnerId)) throw new InvalidInputError("merge.error.samePerson");

  const merges: string[] = [];
  for (const loserId of plan.loserIds) {
    const done = await mergePeople(db, actor, { winnerId: plan.winnerId, loserId });
    merges.push(done.mergeId);
  }
  return { merges };
}
