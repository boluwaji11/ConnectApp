/**
 * R2.15. One person's record, in the order it happened.
 *
 * Everything the church knows about somebody is spread across eight tables, and
 * the question nobody can answer from any of them is the obvious one: what has
 * happened with this person. A pastor opening a record before a visit wants the
 * last year on one screen, not six cards to piece together.
 *
 * HRT-448. The sources no permission gates are read as one union, and every
 * gated source keeps a query of its own.
 *
 * It used to be one query per source, seven round trips, on the reasoning that
 * a union would have to carry every permission gate in one WHERE clause where
 * a mistake is quiet. That reasoning still holds and is why this is split the
 * way it is rather than merged outright: background checks and notes are gated,
 * so each keeps its own query with its gate as a line of TypeScript beside it.
 * The five ungated sources had no gate to lose and cost five round trips.
 *
 * Why it is worth doing: the application reaches Postgres through a transaction
 * pooler, which does not pipeline. Every statement is a full round trip of
 * about 60ms whether it is issued alone or inside a `Promise.all`, so the only
 * thing that makes a screen faster is asking fewer times. Measured in
 * docs/performance.md.
 *
 * Giving (0.3), serving (0.4) and communications (1.0) are not built yet. Each
 * one is another block in this file when it lands, and the shape is ready for
 * them: a kind, a day, a name from the church's records, and a gate.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Tx } from "../client";
import type { Permission } from "../permissions";
import { backgroundChecks } from "../schema/members";
import { type TenantRole } from "../roles";
import { listNotesForPerson } from "./notes";
import { canSeeChecks } from "./checks";

/**
 * What kind of thing happened. The screen turns each one into a sentence, so
 * the words live in the catalogue rather than in here.
 */
export type TimelineKind =
  | "added"
  | "attended"
  | "checkedIn"
  | "joinedGroup"
  | "leftGroup"
  | "milestone"
  | "note"
  | "enteredPipeline"
  | "leftPipeline"
  | "followUpDone"
  | "check"
  | "archived";

export interface TimelineEntry {
  /** Stable across reads, so the screen can key on it. */
  id: string;
  kind: TimelineKind;
  /** The day it happened, ISO. Everything is placed by day. */
  on: string;
  /** A name out of the church's own records: a service, a group, a pipeline. */
  subject?: string | null;
  /** Something the church wrote, or a value to name in the catalogue. */
  detail?: string | null;
  /** A milestone kind or a check result, which the screen names. */
  code?: string | null;
  /** R24.4. The colour the thing already carries elsewhere in the product. */
  hue?: string | null;
}

/**
 * The day a thing happened, read on the church's own clock.
 *
 * A follow-up answered at twenty past eight on a Friday evening in Missouri is
 * a Friday. Read in UTC it is a Saturday, and the record then says the church
 * did something the day after it did it.
 */
const dayIn = (zone: string) => (value: Date | string | null): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  // en-CA writes a date as 2026-10-09, which is the shape every date is held in.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
};

/** How much of a life is read at once. A church of this size has years of it. */
export const TIMELINE_LIMIT = 120;

/**
 * R2.15. The whole record, newest first.
 *
 * `viewer` decides what is in it. A note nobody may read is absent rather than
 * redacted: a row saying "something is here you cannot see" tells somebody in
 * the office that a confidential note exists, which is most of what it says.
 */
export async function personTimeline(
  db: Tx,
  viewer: { tenantId: string; role: TenantRole; userId?: string; permissions?: readonly Permission[] | null },
  memberId: string,
  opts: { limit?: number; timezone?: string } = {},
): Promise<TimelineEntry[]> {
  const limit = opts.limit ?? TIMELINE_LIMIT;
  const day = dayIn(opts.timezone || "UTC");
  const out: TimelineEntry[] = [];

  /*
   * R2.15, HRT-448. Five sources, one statement, one round trip.
   *
   * Nothing here is gated, so nothing is hidden by merging it: the person's
   * own dates, the groups they joined and left, their milestones, the
   * pipelines they entered and came out of, and the follow-ups somebody
   * answered. Every row is scoped to this member, and RLS scopes it to this
   * church on the connection, which is the boundary this was always resting
   * on rather than on the number of statements.
   *
   * The day is worked out in the database, on the church's own clock, because
   * splitting the conversion between SQL and JavaScript is how an evening's
   * work ends up filed under the next morning.
   */
  const zone = opts.timezone || "UTC";
  const rows = await db.execute<{
    id: string; kind: string; on: string;
    subject: string | null; hue: string | null; code: string | null; detail: string | null;
  }>(sql`
    with person as (
      select id, created_at, archived_at from members where id = ${memberId}
    )
    select 'added:' || p.id as id, 'added' as kind,
           (p.created_at at time zone ${zone})::date::text as "on",
           null::text as subject, null::text as hue, null::text as code, null::text as detail
      from person p
     where p.created_at is not null

    union all
    select 'archived:' || p.id, 'archived',
           (p.archived_at at time zone ${zone})::date::text,
           null, null, null, null
      from person p
     where p.archived_at is not null

    union all
    select 'joined:' || gm.id, 'joinedGroup', gm.joined_on::text,
           g.name, gt.hue, null, null
      from group_memberships gm
      join groups g on g.id = gm.group_id
      left join group_types gt on gt.id = g.type_id
     where gm.member_id = ${memberId} and gm.joined_on is not null

    union all
    select 'left:' || gm.id, 'leftGroup', gm.left_on::text,
           g.name, gt.hue, null, null
      from group_memberships gm
      join groups g on g.id = gm.group_id
      left join group_types gt on gt.id = g.type_id
     where gm.member_id = ${memberId} and gm.left_on is not null

    union all
    select 'milestone:' || m.id, 'milestone', m.occurred_on::text,
           null, null, m.kind::text, m.notes
      from milestones m
     where m.member_id = ${memberId}

    union all
    select 'pipeline:' || pe.id, 'enteredPipeline', pe.started_on::text,
           pl.name, pl.hue, null, null
      from pipeline_entries pe
      join pipelines pl on pl.id = pe.pipeline_id
     where pe.member_id = ${memberId} and pe.started_on is not null

    union all
    select 'pipelineOut:' || pe.id, 'leftPipeline',
           (pe.closed_at at time zone ${zone})::date::text,
           pl.name, pl.hue, null, null
      from pipeline_entries pe
      join pipelines pl on pl.id = pe.pipeline_id
     where pe.member_id = ${memberId} and pe.closed_at is not null

    union all
    select 'followUp:' || f.id, 'followUpDone',
           (f.done_at at time zone ${zone})::date::text,
           f.title, null, null, f.outcome
      from follow_ups f
     where f.member_id = ${memberId} and f.done_at is not null

    order by 3 desc, 1
    limit ${limit}`);

  /* A member who is not there has no rows at all, and the caller reads an
     empty record rather than one with somebody else's history in it. */
  if (rows.length === 0) return [];

  for (const row of rows) {
    out.push({
      id: row.id,
      kind: row.kind as TimelineEntry["kind"],
      on: row.on,
      ...(row.subject === null ? {} : { subject: row.subject }),
      ...(row.hue === null ? {} : { hue: row.hue }),
      ...(row.code === null ? {} : { code: row.code }),
      ...(row.detail === null ? {} : { detail: row.detail }),
    } as TimelineEntry);
  }

  // R2.7, R6.2. Notes come through the notes repo rather than off the table,
  // because a confidential one is encrypted at rest and every read of one
  // writes an audit entry naming the reader. Reading them here without that
  // would be a way to read confidential notes unaudited.
  //
  // A note somebody may not read is absent rather than redacted: a redaction
  // still tells the office that a confidential note about this person exists,
  // which is most of what the note says.
  const written = await listNotesForPerson(db, memberId, viewer.role, {
    tenantId: viewer.tenantId,
    ...(viewer.userId ? { userId: viewer.userId } : {}),
  });
  for (const note of written) {
    if (note.restricted) continue;
    out.push({
      id: `note:${note.id}`,
      kind: "note",
      on: day(note.createdAt)!,
      detail: note.body ?? null,
      code: note.classification,
    });
  }

  // R2.10, R21.11. Background checks, for the roles that hold them.
  if (canSeeChecks(viewer.role)) {
    const checks = await db
      .select({
        id: backgroundChecks.id,
        on: backgroundChecks.completedOn,
        provider: backgroundChecks.provider,
        status: backgroundChecks.status,
      })
      .from(backgroundChecks)
      .where(and(eq(backgroundChecks.memberId, memberId), isNotNull(backgroundChecks.completedOn)))
      .orderBy(desc(backgroundChecks.completedOn))
      .limit(limit);
    for (const row of checks) {
      out.push({
        id: `check:${row.id}`, kind: "check", on: row.on!,
        subject: row.provider, code: row.status,
      });
    }
  }

  // Newest first. Where two things share a day, the order is by kind so the
  // list does not reshuffle between reads.
  out.sort((a, b) => (a.on === b.on ? a.id.localeCompare(b.id) : b.on.localeCompare(a.on)));
  return out.slice(0, limit);
}
