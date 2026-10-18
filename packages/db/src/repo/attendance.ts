import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "../client";
import { attendanceRecords, serviceOccurrences } from "../schema/gatherings";
import { members } from "../schema/members";
import { canManageServices } from "./services";
import { PermissionError } from "../roles";
import { InvalidInputError } from "../errors";
import type { WriteActor } from "./members";

/**
 * R7.3 and R7.7. Who was at a service.
 *
 * A row means present. There is no absent row: absence is the lack of a record
 * rather than something anybody asserts, and R7.6 reads it from the gaps. That
 * also makes correcting a mistake a delete, which the audit trigger records
 * like any other write, so R7.7 comes free rather than needing its own log.
 *
 * The acceptance criterion is 120 members ticked in under three minutes on a
 * tablet with no page reloads, so every write here is one row and the roster is
 * one query.
 */

export interface RosterEntry {
  memberId: string;
  firstName: string;
  preferredName: string | null;
  lastName: string;
  householdName: string | null;
  present: boolean;
}

/**
 * Everyone who could be marked present, and who already is.
 *
 * One query, left joined against the records for this service, because two
 * queries and a merge in the page is the version that goes wrong when somebody
 * is added between them.
 */
export async function listRoster(db: Tx, occurrenceId: string): Promise<RosterEntry[]> {
  const rows = await db
    .select({
      memberId: members.id,
      firstName: members.firstName,
      preferredName: members.preferredName,
      lastName: members.lastName,
      present: sql<boolean>`${attendanceRecords.id} is not null`,
    })
    .from(members)
    .leftJoin(
      attendanceRecords,
      and(
        eq(attendanceRecords.memberId, members.id),
        eq(attendanceRecords.occurrenceId, occurrenceId),
      ),
    )
    .where(isNull(members.archivedAt))
    .orderBy(asc(members.lastName), asc(members.firstName));

  return rows.map((r) => ({ ...r, householdName: null, present: Boolean(r.present) }));
}

async function assertRecordable(db: Tx, occurrenceId: string): Promise<string> {
  const [occurrence] = await db
    .select({ status: serviceOccurrences.status, occursOn: serviceOccurrences.occursOn })
    .from(serviceOccurrences)
    .where(eq(serviceOccurrences.id, occurrenceId))
    .limit(1);

  if (!occurrence) throw new InvalidInputError("service.error.notFound");
  if (occurrence.status === "cancelled") throw new InvalidInputError("attendance.error.cancelled");
  return occurrence.occursOn;
}

/**
 * R2.1 and R7.5. Keeps a person's first visit date in step with the attendance
 * record, in both directions.
 *
 * Set from the earliest service the church has them at, rather than from the
 * service being edited, so back-filling last February puts February on the
 * record and not today. A date somebody typed is left alone: the church knows
 * something the attendance record does not.
 *
 * Taking a mark off runs the same calculation, so a tick in the wrong row does
 * not leave a first visit behind it. Where nothing is left, the date goes back
 * to blank.
 *
 * It fills for everyone rather than for visitors only. What it writes is the
 * earliest attendance the church holds, which for a member whose record starts
 * this year is the earliest attendance the church holds. The lists of who is
 * new read lifecycle status as well as this date, so a member never appears
 * among them.
 */
async function syncFirstVisit(db: Tx, personIds: string[]): Promise<void> {
  if (personIds.length === 0) return;

  /*
   * SEC-027. Each id a parameter, rather than quoted into the statement.
   *
   * This built `array['<id>','<id>']::uuid[]` by concatenation, and the ids
   * reach it from a server action's own argument. Nothing exploitable came of
   * it: both callers run an insert or a delete against a uuid column with the
   * same values first, so a malformed id aborts the transaction before this
   * statement is parsed. That is a protection by accident, not by design, and
   * it lasts exactly as long as nobody reorders those two statements or adds a
   * third caller. One `sql.join` removes the question.
   */
  const ids = sql`array[${sql.join(personIds.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;

  await db.execute(sql`
    update members p
       set first_visit_on = seen.first_on, updated_at = now()
      from (
        select ar.member_id,
               min(o.occurs_on) as first_on
          from attendance_records ar
          join service_occurrences o on o.id = ar.occurrence_id
         where ar.member_id = any(${ids})
           and o.status = 'scheduled'
         group by ar.member_id
      ) seen
     where p.id = seen.member_id
       and (p.first_visit_on is null or p.first_visit_on > seen.first_on)
  `);

  // Nobody left at any service, so the date this produced goes with it.
  await db.execute(sql`
    update members p
       set first_visit_on = null, updated_at = now()
     where p.id = any(${ids})
       and p.first_visit_on is not null
       and not exists (
         select 1
           from attendance_records ar
           join service_occurrences o on o.id = ar.occurrence_id
          where ar.member_id = p.id and o.status = 'scheduled'
       )
  `);
}

/**
 * Marks one person present, or takes the mark off.
 *
 * Idempotent in both directions, because a tablet under a thumb sends the same
 * press twice and the second one must not undo the first.
 */
export async function setPresent(
  db: Tx,
  actor: WriteActor,
  occurrenceId: string,
  memberId: string,
  present: boolean,
): Promise<{ present: boolean }> {
  if (!canManageServices(actor)) throw new PermissionError(actor.role, "recordAttendance");
  await assertRecordable(db, occurrenceId);

  if (present) {
    await db
      .insert(attendanceRecords)
      .values({ tenantId: actor.tenantId, occurrenceId, memberId, source: "roster" })
      .onConflictDoNothing();
  } else {
    await db
      .delete(attendanceRecords)
      .where(and(
        eq(attendanceRecords.occurrenceId, occurrenceId),
        eq(attendanceRecords.memberId, memberId),
      ));
  }

  await syncFirstVisit(db, [memberId]);
  return { present };
}

/** The same, for a selection. One statement rather than one per person. */
export async function setPresentMany(
  db: Tx,
  actor: WriteActor,
  occurrenceId: string,
  personIds: string[],
  present: boolean,
): Promise<{ changed: number }> {
  if (!canManageServices(actor)) throw new PermissionError(actor.role, "recordAttendance");
  if (personIds.length === 0) return { changed: 0 };
  await assertRecordable(db, occurrenceId);

  if (present) {
    const written = await db
      .insert(attendanceRecords)
      .values(personIds.map((memberId) => ({
        tenantId: actor.tenantId, occurrenceId, memberId, source: "roster",
      })))
      .onConflictDoNothing()
      .returning({ id: attendanceRecords.id });
    await syncFirstVisit(db, personIds);
    return { changed: written.length };
  }

  const gone = await db
    .delete(attendanceRecords)
    .where(and(
      eq(attendanceRecords.occurrenceId, occurrenceId),
      inArray(attendanceRecords.memberId, personIds),
    ))
    .returning({ id: attendanceRecords.id });

  await syncFirstVisit(db, personIds);
  return { changed: gone.length };
}

export async function countPresent(db: Tx, occurrenceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.occurrenceId, occurrenceId));
  return Number(row?.n ?? 0);
}

export interface PersonAttendance {
  occurrenceId: string;
  occursOn: string;
  name: string;
}

/**
 * One person's history, most recent first.
 *
 * R7.5 counts the first two of these to flag a visitor, and R7.6 reads the
 * gaps. Both want the same query, so it lives here once.
 */
export async function attendanceForPerson(
  db: Tx,
  memberId: string,
  limit = 100,
): Promise<PersonAttendance[]> {
  return db
    .select({
      occurrenceId: serviceOccurrences.id,
      occursOn: serviceOccurrences.occursOn,
      name: serviceOccurrences.name,
    })
    .from(attendanceRecords)
    .innerJoin(serviceOccurrences, eq(serviceOccurrences.id, attendanceRecords.occurrenceId))
    .where(eq(attendanceRecords.memberId, memberId))
    .orderBy(desc(serviceOccurrences.occursOn))
    .limit(limit);
}

/** How many were marked present at each of these services. */
export async function countsFor(
  db: Tx,
  occurrenceIds: string[],
): Promise<Record<string, number>> {
  if (occurrenceIds.length === 0) return {};

  const rows = await db
    .select({ occurrenceId: attendanceRecords.occurrenceId, n: sql<string>`count(*)` })
    .from(attendanceRecords)
    .where(inArray(attendanceRecords.occurrenceId, occurrenceIds))
    .groupBy(attendanceRecords.occurrenceId);

  return Object.fromEntries(rows.map((r) => [r.occurrenceId, Number(r.n)]));
}

export interface VisitNumber {
  memberId: string;
  /** 1 on their first ever service, 2 on their second. */
  visit: number;
}

/**
 * R7.5. Which of these members are here for the first or second time.
 *
 * Counted from the record rather than stored on the person, because a flag
 * written at the time is wrong the moment somebody corrects a mistake, adds a
 * service that was missed, or imports a year of history.
 *
 * Only members the church has recorded as visitors. A church of two hundred
 * starts using ConnectApp at one service and marks two hundred regulars present: the
 * attendance record says every one of them is here for the first time, and it
 * is wrong about all two hundred. The record began that day. They did not.
 *
 * Ties on a date count together, so a person at both services on their first
 * service is first-time at both rather than second-time at the later one. They
 * turned up once.
 */
export async function visitNumbers(db: Tx, occurrenceId: string): Promise<VisitNumber[]> {
  const rows = await db.execute<{ member_id: string; visit: string }>(sql`
    select a.member_id,
           (select count(distinct o2.occurs_on)
              from attendance_records a2
              join service_occurrences o2 on o2.id = a2.occurrence_id
             where a2.member_id = a.member_id
               and o2.occurs_on <= o.occurs_on) as visit
      from attendance_records a
      join service_occurrences o on o.id = a.occurrence_id
      join members p on p.id = a.member_id
     where a.occurrence_id = ${occurrenceId}
       and p.lifecycle_status = 'visitor'
  `);

  return (rows as unknown as { member_id: string; visit: string }[]).map((r) => ({
    memberId: r.member_id,
    visit: Number(r.visit),
  }));
}

export interface Visitor {
  memberId: string;
  firstName: string;
  preferredName: string | null;
  lastName: string;
  occursOn: string;
  serviceName: string;
  visit: number;
}

/**
 * R7.5. Everyone whose first or second visit falls in a window.
 *
 * This is the follow-up list after a service day, and the source the
 * first-visit and second-visit pipelines in R5.3 read.
 */
export async function visitorsBetween(
  db: Tx,
  from: string,
  to: string,
  visit: 1 | 2,
): Promise<Visitor[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    with numbered as (
      select a.member_id,
             o.occurs_on,
             o.name as service_name,
             (select count(distinct o2.occurs_on)
                from attendance_records a2
                join service_occurrences o2 on o2.id = a2.occurrence_id
               where a2.member_id = a.member_id
                 and o2.occurs_on <= o.occurs_on) as visit
        from attendance_records a
        join service_occurrences o on o.id = a.occurrence_id
       where o.occurs_on between ${from} and ${to}
    )
    select distinct on (n.member_id)
           n.member_id, n.occurs_on, n.service_name, n.visit,
           p.first_name, p.preferred_name, p.last_name
      from numbered n
      join members p on p.id = n.member_id
     where n.visit = ${visit}
       and p.archived_at is null
       and p.lifecycle_status = 'visitor'
     order by n.member_id, n.occurs_on
  `);

  return (rows as unknown as Record<string, string>[])
    .map((r) => ({
      memberId: String(r["member_id"]),
      firstName: String(r["first_name"]),
      preferredName: (r["preferred_name"] as string | null) ?? null,
      lastName: String(r["last_name"]),
      occursOn: String(r["occurs_on"]).slice(0, 10),
      serviceName: String(r["service_name"]),
      visit: Number(r["visit"]),
    }))
    // Most recent first, then by name. Without the second key, two members whose
    // first visit was at the same service swap places between loads, and a list that
    // reorders itself is a list somebody loses their place in.
    .sort(
      (a, b) =>
        b.occursOn.localeCompare(a.occursOn) ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
}

export interface AbsentPerson {
  memberId: string;
  firstName: string;
  preferredName: string | null;
  lastName: string;
  /** The last held service they were at. */
  lastSeenOn: string;
  /** Held services since, that they were not at. */
  missed: number;
}

export const DEFAULT_ABSENCE_THRESHOLD = 3;

/**
 * R7.6. People who have stopped coming.
 *
 * Counted against the services that were actually held: cancelled ones are not
 * in it, so a church that cancelled a service for snow does not accuse half its
 * congregation of drifting the following week. Two services on one day count
 * once, for the same reason a visit does.
 *
 * Members and regular attenders only. A visitor who came once and never came
 * back is a follow-up that did not land, which is the other list. Somebody
 * already marked inactive is somebody the church has already noticed. And
 * anybody who has never attended has not stopped coming: putting them here
 * buries the members who have.
 */
export async function absentPeople(
  db: Tx,
  opts: { threshold?: number; asOf?: string } = {},
): Promise<AbsentPerson[]> {
  const threshold = opts.threshold ?? DEFAULT_ABSENCE_THRESHOLD;
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  const rows = await db.execute<Record<string, unknown>>(sql`
    with held as (
      select distinct occurs_on
        from service_occurrences
       where status = 'scheduled' and occurs_on <= ${asOf}
    ),
    last_seen as (
      select a.member_id, max(o.occurs_on) as last_on
        from attendance_records a
        join service_occurrences o on o.id = a.occurrence_id
       where o.status = 'scheduled' and o.occurs_on <= ${asOf}
       group by a.member_id
    )
    select p.id, p.first_name, p.preferred_name, p.last_name, l.last_on,
           (select count(*) from held h where h.occurs_on > l.last_on) as missed
      from last_seen l
      join members p on p.id = l.member_id
     where p.archived_at is null
       and p.lifecycle_status in ('member', 'regular_attender')
  `);

  return (rows as unknown as Record<string, string>[])
    .map((r) => ({
      memberId: String(r["id"]),
      firstName: String(r["first_name"]),
      preferredName: (r["preferred_name"] as string | null) ?? null,
      lastName: String(r["last_name"]),
      lastSeenOn: String(r["last_on"]).slice(0, 10),
      missed: Number(r["missed"]),
    }))
    .filter((r) => r.missed >= threshold)
    // Longest gone first, then by name so the order holds between loads.
    .sort(
      (a, b) =>
        b.missed - a.missed ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
}
