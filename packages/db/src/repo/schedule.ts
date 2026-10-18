import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { Tx } from "../client";
import {
  teams, teamPositions, teamMembers, teamMemberPositions,
  servingAssignments, blockoutDates, servingPreferences,
} from "../schema/serving";
import { serviceOccurrences } from "../schema/gatherings";
import { members } from "../schema/members";
import { PermissionError } from "../roles";
import { InvalidInputError } from "../errors";
import { canManageTeams, leadsTeam } from "./serving";
import { notifyRoles } from "./notifications";
import type { WriteActor } from "./members";

/**
 * R10.3 to R10.5. The schedule: who is doing what, at which service.
 *
 * The schedule hangs off the service occurrence rather than off a date. A
 * church with two services on one day runs two different bands, and a row
 * holding a date alone cannot say which one somebody is in.
 *
 * Serving in two places at one hour is allowed, and nothing is said about it.
 * R10.3 asked for it to be a conflict; the church said somebody who runs the
 * desk and reads a lesson in the same service is doing what small churches do,
 * and software that calls it an error is wrong about the church rather than the
 * other way round.
 *
 * What does warn is a day somebody said they are away, and a turn that comes
 * round sooner than they asked for. Both warn rather than refuse: somebody who
 * says yes in the corridor has already decided, and software that will not
 * record the decision is software a church works around.
 */

export const SERVING_FREQUENCIES = ["weekly", "fortnightly", "monthly", "quarterly"] as const;
export type ServingFrequency = (typeof SERVING_FREQUENCIES)[number];

/** Roughly how many days between turns, for the "served recently" warning. */
const GAP_DAYS: Record<ServingFrequency, number> = {
  weekly: 7, fortnightly: 14, monthly: 28, quarterly: 91,
};

export type AssignmentStatus = "pending" | "accepted" | "declined";

export interface Assignment {
  id: string;
  occurrenceId: string;
  teamId: string;
  positionId: string;
  positionName: string;
  memberId: string;
  personName: string;
  status: AssignmentStatus;
  declineReason: string | null;
  overridden: boolean;
  /** R10.6. The link this person answers on. */
  token: string;
}

export interface Blockout {
  id: string;
  memberId: string;
  startsOn: string;
  endsOn: string;
  reason: string | null;
}

/** Why the scheduler was warned, if they were. */
export interface Warning {
  /** R10.4. They said they are away. */
  blockedOut: { startsOn: string; endsOn: string; reason: string | null } | null;
  /** R10.5. They served more recently than their preference asks for. */
  tooSoon: { lastServedOn: string; frequency: ServingFrequency } | null;
}

export interface PlanCandidate {
  memberId: string;
  name: string;
  /** True when they are marked as playing this position. */
  plays: boolean;
  lastServedOn: string | null;
  frequency: ServingFrequency | null;
  warning: Warning;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (warning: Warning): boolean =>
  warning.blockedOut === null && warning.tooSoon === null;

const displayName = (r: { firstName: string; preferredName: string | null; lastName: string }) =>
  `${r.preferredName ?? r.firstName} ${r.lastName}`;

/** Thrown when the scheduler has not said to go ahead anyway. */
export class ScheduleConflictError extends Error {
  readonly warning: Warning;
  constructor(warning: Warning) {
    super("That person is away, or due a break.");
    this.name = "ScheduleConflictError";
    this.warning = warning;
  }
}

async function mayScheduleFor(db: Tx, actor: WriteActor, teamId: string): Promise<void> {
  if (canManageTeams(actor)) return;
  if (actor.role === "team_leader" && actor.userId && await leadsTeam(db, teamId, actor.userId)) {
    return;
  }
  throw new PermissionError(actor.role, "schedule");
}

/** R10.3. The services this schedule covers, soonest first. */
export async function upcomingServices(
  db: Tx,
  options: { from: string; limit?: number },
): Promise<{ id: string; slug: string; name: string; occursOn: string; startsAt: string }[]> {
  return db
    .select({
      id: serviceOccurrences.id,
      slug: serviceOccurrences.slug,
      name: serviceOccurrences.name,
      occursOn: sql<string>`${serviceOccurrences.occursOn}::text`,
      startsAt: serviceOccurrences.startsAt,
    })
    .from(serviceOccurrences)
    .where(and(
      gte(serviceOccurrences.occursOn, options.from),
      eq(serviceOccurrences.status, "scheduled"),
    ))
    .orderBy(asc(serviceOccurrences.occursOn), asc(serviceOccurrences.startsAt))
    .limit(options.limit ?? 6);
}

/** R10.3. Everyone scheduled on this team across these services. */
export async function assignmentsForTeam(
  db: Tx,
  teamId: string,
  occurrenceIds: string[],
): Promise<Assignment[]> {
  if (occurrenceIds.length === 0) return [];

  const rows = await db
    .select({
      id: servingAssignments.id,
      occurrenceId: servingAssignments.occurrenceId,
      teamId: servingAssignments.teamId,
      positionId: servingAssignments.positionId,
      positionName: teamPositions.name,
      memberId: servingAssignments.memberId,
      status: servingAssignments.status,
      declineReason: servingAssignments.declineReason,
      overridden: servingAssignments.overridden,
      token: servingAssignments.respondToken,
      order: teamPositions.position,
      firstName: members.firstName,
      preferredName: members.preferredName,
      lastName: members.lastName,
    })
    .from(servingAssignments)
    .innerJoin(teamPositions, eq(teamPositions.id, servingAssignments.positionId))
    .innerJoin(members, eq(members.id, servingAssignments.memberId))
    .where(and(
      eq(servingAssignments.teamId, teamId),
      inArray(servingAssignments.occurrenceId, occurrenceIds),
    ))
    .orderBy(asc(teamPositions.position), asc(members.lastName));

  return rows.map((r) => ({
    id: r.id,
    occurrenceId: r.occurrenceId,
    teamId: r.teamId,
    positionId: r.positionId,
    positionName: r.positionName,
    memberId: r.memberId,
    personName: displayName(r),
    status: r.status as AssignmentStatus,
    declineReason: r.declineReason,
    overridden: r.overridden,
    token: r.token,
  }));
}

/** R10.3. Everything one person is down for, soonest first. */
export async function assignmentsForPerson(
  db: Tx,
  memberId: string,
  options: { from?: string; limit?: number } = {},
): Promise<(Assignment & {
  teamName: string;
  /** R24.4. The team's own colour, which marks its dates on a member's screen. */
  teamHue: string;
  occursOn: string;
  startsAt: string;
  serviceName: string;
})[]> {
  const rows = await db
    .select({
      id: servingAssignments.id,
      occurrenceId: servingAssignments.occurrenceId,
      teamId: servingAssignments.teamId,
      teamName: teams.name,
      teamHue: teams.hue,
      positionId: servingAssignments.positionId,
      positionName: teamPositions.name,
      memberId: servingAssignments.memberId,
      status: servingAssignments.status,
      declineReason: servingAssignments.declineReason,
      overridden: servingAssignments.overridden,
      token: servingAssignments.respondToken,
      serviceName: serviceOccurrences.name,
      occursOn: sql<string>`${serviceOccurrences.occursOn}::text`,
      startsAt: serviceOccurrences.startsAt,
      firstName: members.firstName,
      preferredName: members.preferredName,
      lastName: members.lastName,
    })
    .from(servingAssignments)
    .innerJoin(teams, eq(teams.id, servingAssignments.teamId))
    .innerJoin(teamPositions, eq(teamPositions.id, servingAssignments.positionId))
    .innerJoin(members, eq(members.id, servingAssignments.memberId))
    .innerJoin(serviceOccurrences, eq(serviceOccurrences.id, servingAssignments.occurrenceId))
    .where(and(
      eq(servingAssignments.memberId, memberId),
      options.from ? gte(serviceOccurrences.occursOn, options.from) : undefined,
    ))
    .orderBy(asc(serviceOccurrences.occursOn), asc(serviceOccurrences.startsAt))
    .limit(options.limit ?? 20);

  return rows.map((r) => ({
    id: r.id,
    occurrenceId: r.occurrenceId,
    teamId: r.teamId,
    teamName: r.teamName,
    teamHue: r.teamHue,
    positionId: r.positionId,
    positionName: r.positionName,
    memberId: r.memberId,
    personName: displayName(r),
    status: r.status as AssignmentStatus,
    declineReason: r.declineReason,
    overridden: r.overridden,
    token: r.token,
    serviceName: r.serviceName,
    occursOn: r.occursOn,
    startsAt: r.startsAt,
  }));
}

/**
 * R10.3. What a scheduler should know before putting this person here.
 *
 * Two questions: have they said they are away, and did they serve more
 * recently than they asked to.
 */
export async function checkFor(
  db: Tx,
  input: { memberId: string; occurrenceId: string },
): Promise<Warning> {
  const [occurrence] = await db
    .select({
      occursOn: sql<string>`${serviceOccurrences.occursOn}::text`,
      startsAt: serviceOccurrences.startsAt,
    })
    .from(serviceOccurrences)
    .where(eq(serviceOccurrences.id, input.occurrenceId))
    .limit(1);
  if (!occurrence) throw new InvalidInputError("schedule.error.occurrence");

  const [away] = await db
    .select({
      startsOn: sql<string>`${blockoutDates.startsOn}::text`,
      endsOn: sql<string>`${blockoutDates.endsOn}::text`,
      reason: blockoutDates.reason,
    })
    .from(blockoutDates)
    .where(and(
      eq(blockoutDates.memberId, input.memberId),
      lte(blockoutDates.startsOn, occurrence.occursOn),
      gte(blockoutDates.endsOn, occurrence.occursOn),
    ))
    .limit(1);

  const [preference] = await db
    .select({ frequency: servingPreferences.frequency })
    .from(servingPreferences)
    .where(eq(servingPreferences.memberId, input.memberId))
    .limit(1);

  let tooSoon: Warning["tooSoon"] = null;
  if (preference) {
    const frequency = preference.frequency as ServingFrequency;
    const gap = GAP_DAYS[frequency] ?? 0;

    const [last] = await db
      .select({ on: sql<string>`${serviceOccurrences.occursOn}::text` })
      .from(servingAssignments)
      .innerJoin(serviceOccurrences, eq(serviceOccurrences.id, servingAssignments.occurrenceId))
      .where(and(
        eq(servingAssignments.memberId, input.memberId),
        sql`${servingAssignments.status} <> 'declined'`,
        sql`${serviceOccurrences.occursOn}::text < ${occurrence.occursOn}`,
      ))
      .orderBy(desc(serviceOccurrences.occursOn))
      .limit(1);

    if (last) {
      const since = Math.round(
        (Date.parse(`${occurrence.occursOn}T00:00:00Z`) - Date.parse(`${last.on}T00:00:00Z`))
        / 86_400_000,
      );
      if (since < gap) tooSoon = { lastServedOn: last.on, frequency };
    }
  }

  return { blockedOut: away ?? null, tooSoon };
}

/**
 * R10.3 to R10.5. Who could fill this position at this service, and what the
 * scheduler should know about each of them.
 */
export async function candidatesFor(
  db: Tx,
  input: { teamId: string; positionId: string; occurrenceId: string },
): Promise<PlanCandidate[]> {
  const roster = await db
    .select({
      teamMemberId: teamMembers.id,
      memberId: teamMembers.memberId,
      firstName: members.firstName,
      preferredName: members.preferredName,
      lastName: members.lastName,
    })
    .from(teamMembers)
    .innerJoin(members, eq(members.id, teamMembers.memberId))
    .where(and(
      eq(teamMembers.teamId, input.teamId),
      isNull(teamMembers.leftOn),
      isNull(members.archivedAt),
    ))
    .orderBy(asc(members.lastName), asc(members.firstName));

  if (roster.length === 0) return [];

  /*
   * R10.2. Who plays this position.
   *
   * The row is keyed on the membership rather than on the person, which is
   * the same distinction the roster above keeps. Matched on the person's id
   * it never found anybody, so the board put nobody at the top of a position
   * they actually play.
   */
  const plays = await db
    .select({ teamMemberId: teamMemberPositions.memberId })
    .from(teamMemberPositions)
    .where(and(
      eq(teamMemberPositions.positionId, input.positionId),
      inArray(teamMemberPositions.memberId, roster.map((r) => r.teamMemberId)),
    ));
  const playing = new Set(plays.map((p) => p.teamMemberId));

  const preferences = await db
    .select({ memberId: servingPreferences.memberId, frequency: servingPreferences.frequency })
    .from(servingPreferences)
    .where(inArray(servingPreferences.memberId, roster.map((r) => r.memberId)));
  const byPerson = new Map(preferences.map((p) => [p.memberId, p.frequency as ServingFrequency]));

  const out: PlanCandidate[] = [];
  for (const person of roster) {
    const warning = await checkFor(db, {
      memberId: person.memberId,
      occurrenceId: input.occurrenceId,
    });
    out.push({
      memberId: person.memberId,
      name: displayName(person),
      plays: playing.has(person.teamMemberId),
      lastServedOn: warning.tooSoon?.lastServedOn ?? null,
      frequency: byPerson.get(person.memberId) ?? null,
      warning,
    });
  }

  // Whoever plays the position and has nothing against them, first.
  return out.sort((a, b) =>
    Number(b.plays) - Number(a.plays)
    || Number(clean(b.warning)) - Number(clean(a.warning))
    || a.name.localeCompare(b.name));
}

export interface AssignInput {
  occurrenceId: string;
  teamId: string;
  positionId: string;
  memberId: string;
  /** True when the scheduler has read the warning and gone ahead. */
  anyway?: boolean;
}

/**
 * R10.3. Puts somebody down.
 *
 * Refuses once where they are away or due a break, then records that it was
 * told to go ahead.
 */
/**
 * The last date that is past wherever the church is.
 *
 * The grid draws its line against the church's own clock, and the server
 * does not hold a timezone at this point in the call. Rather than query for
 * one, it gives a day's grace: a church fourteen hours behind the server is
 * never refused a date its own screen still shows as today.
 */
const longGone = () => {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

export async function assign(
  db: Tx,
  actor: WriteActor,
  input: AssignInput,
): Promise<{ id: string; overridden: boolean }> {
  await mayScheduleFor(db, actor, input.teamId);

  const [position] = await db
    .select({ id: teamPositions.id })
    .from(teamPositions)
    .where(and(
      eq(teamPositions.id, input.positionId),
      eq(teamPositions.teamId, input.teamId),
      isNull(teamPositions.archivedAt),
    ))
    .limit(1);
  if (!position) throw new InvalidInputError("schedule.error.position");

  /*
   * R10.3. Nobody is put on a date that has gone.
   *
   * A rota is a plan. Asking somebody to serve last Tuesday sends a request
   * they cannot answer and puts a name against a service that has already
   * happened. The grid closes those columns against the church's own clock,
   * and this is the backstop under it, since a screen is never the guard.
   */
  const [when] = await db
    .select({ day: serviceOccurrences.occursOn })
    .from(serviceOccurrences)
    .where(eq(serviceOccurrences.id, input.occurrenceId))
    .limit(1);
  if (when && when.day < longGone()) throw new InvalidInputError("schedule.error.past");

  const warning = await checkFor(db, {
    memberId: input.memberId,
    occurrenceId: input.occurrenceId,
  });
  const warned = !clean(warning);
  if (warned && !input.anyway) throw new ScheduleConflictError(warning);

  const [row] = await db
    .insert(servingAssignments)
    .values({
      tenantId: actor.tenantId,
      occurrenceId: input.occurrenceId,
      teamId: input.teamId,
      positionId: input.positionId,
      memberId: input.memberId,
      overridden: warned,
    })
    .onConflictDoNothing()
    .returning({ id: servingAssignments.id });

  if (!row) throw new InvalidInputError("schedule.error.already");
  return { id: row.id, overridden: warned };
}

/** R10.3. Takes somebody off. The slot goes back to empty. */
export async function unassign(db: Tx, actor: WriteActor, id: string): Promise<void> {
  const [row] = await db
    .select({ teamId: servingAssignments.teamId })
    .from(servingAssignments)
    .where(eq(servingAssignments.id, id))
    .limit(1);
  if (!row) throw new InvalidInputError("schedule.error.missing");

  await mayScheduleFor(db, actor, row.teamId);
  await db.delete(servingAssignments).where(eq(servingAssignments.id, id));
}

/**
 * R10.6, R17.7. A member answering their own serving request, signed in.
 *
 * The emailed link answers by token and runs as the owner, because nobody is
 * signed in on that path. In the portal they are, so this one runs inside the
 * tenant and will only touch a row that is theirs: the member id comes from
 * the session rather than from the request.
 */
export async function answerMyAssignment(
  db: Tx,
  actor: WriteActor & { memberId: string },
  input: { id: string; accept: boolean; reason?: string | null },
): Promise<void> {
  const changed = await db
    .update(servingAssignments)
    .set({
      status: input.accept ? "accepted" : "declined",
      declineReason: input.accept ? null : (input.reason?.trim() || null),
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(servingAssignments.id, input.id),
      eq(servingAssignments.memberId, actor.memberId),
    ))
    .returning({
      id: servingAssignments.id,
      teamId: servingAssignments.teamId,
      occurrenceId: servingAssignments.occurrenceId,
    });

  if (changed.length === 0) throw new InvalidInputError("respond.error.unknown");

  /*
   * R10.5, R24.6. An answer is only worth asking for if it reaches whoever
   * has to fill the gap. A decline two days out is the one a rota holder has
   * to act on, and an acceptance is how they know they can stop chasing.
   */
  const row = changed[0]!;
  const [about] = await db
    .select({
      first: members.firstName,
      last: members.lastName,
      team: teams.name,
      /* R24.6. The board is opened on one team in one month, so a line about
         a gap has to carry both or it lands on whatever the board last
         showed and the reader goes looking again. */
      teamSlug: teams.slug,
      day: serviceOccurrences.occursOn,
    })
    .from(servingAssignments)
    .innerJoin(members, eq(members.id, servingAssignments.memberId))
    .innerJoin(teams, eq(teams.id, servingAssignments.teamId))
    .innerJoin(serviceOccurrences, eq(serviceOccurrences.id, servingAssignments.occurrenceId))
    .where(eq(servingAssignments.id, row.id))
    .limit(1);

  await notifyRoles(db, actor.tenantId, ["owner", "admin", "staff"], {
    kind: input.accept ? "serving_accepted" : "serving_declined",
    messageKey: input.accept ? "bell.servingAccepted" : "bell.servingDeclined",
    params: {
      name: [about?.first, about?.last].filter(Boolean).join(" "),
      team: about?.team ?? "",
      date: about?.day ?? "",
    },
    href: `/schedule?at=${(about?.day ?? "").slice(0, 7)}&team=${about?.teamSlug ?? ""}`,
  });
}

// ---------------------------------------------------------------------------
// R10.4. Blockout dates
// ---------------------------------------------------------------------------

export async function listBlockouts(
  db: Tx,
  memberId: string,
  options: { from?: string } = {},
): Promise<Blockout[]> {
  return db
    .select({
      id: blockoutDates.id,
      memberId: blockoutDates.memberId,
      startsOn: sql<string>`${blockoutDates.startsOn}::text`,
      endsOn: sql<string>`${blockoutDates.endsOn}::text`,
      reason: blockoutDates.reason,
    })
    .from(blockoutDates)
    .where(and(
      eq(blockoutDates.memberId, memberId),
      options.from ? gte(blockoutDates.endsOn, options.from) : undefined,
    ))
    .orderBy(asc(blockoutDates.startsOn));
}

export async function addBlockout(
  db: Tx,
  actor: WriteActor,
  input: { memberId: string; startsOn: string; endsOn: string; reason?: string | null },
): Promise<{ id: string }> {
  if (!ISO.test(input.startsOn) || !ISO.test(input.endsOn)) {
    throw new InvalidInputError("blockout.error.date");
  }
  if (input.endsOn < input.startsOn) throw new InvalidInputError("blockout.error.order");

  const [row] = await db
    .insert(blockoutDates)
    .values({
      tenantId: actor.tenantId,
      memberId: input.memberId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      reason: input.reason?.trim() || null,
    })
    .returning({ id: blockoutDates.id });

  return { id: row!.id };
}

/**
 * R10.5. Taking back an unavailable date.
 *
 * SEC-018. Whose row it is decides it. This took an id and an actor it threw
 * away, so any member of the church could delete any other member's
 * unavailability by its id, and the scheduler would then roster that person
 * onto a date they had declared themselves away for. `addBlockout` resolves the
 * member from the session and `answerMyAssignment` constrains on it; this was
 * the one in the family that did neither.
 *
 * The member is required rather than optional, because the only caller is
 * somebody managing their own dates and it resolves them from the session
 * already. A screen that lets a scheduler clear somebody else's would be a
 * different function with a permission check in it.
 */
export async function removeBlockout(
  db: Tx,
  actor: WriteActor,
  id: string,
  memberId: string,
): Promise<void> {
  const gone = await db
    .delete(blockoutDates)
    .where(and(eq(blockoutDates.id, id), eq(blockoutDates.memberId, memberId)))
    .returning({ id: blockoutDates.id });
  if (gone.length === 0) throw new InvalidInputError("blockout.error.missing");
}

// ---------------------------------------------------------------------------
// R10.5. How often somebody wants to serve
// ---------------------------------------------------------------------------

export async function getServingPreference(
  db: Tx,
  memberId: string,
): Promise<ServingFrequency | null> {
  const [row] = await db
    .select({ frequency: servingPreferences.frequency })
    .from(servingPreferences)
    .where(eq(servingPreferences.memberId, memberId))
    .limit(1);
  return (row?.frequency as ServingFrequency) ?? null;
}

export async function setServingPreference(
  db: Tx,
  actor: WriteActor,
  input: { memberId: string; frequency: ServingFrequency | null },
): Promise<void> {
  if (input.frequency === null) {
    await db.delete(servingPreferences).where(eq(servingPreferences.memberId, input.memberId));
    return;
  }
  if (!SERVING_FREQUENCIES.includes(input.frequency)) {
    throw new InvalidInputError("preference.error.frequency");
  }

  await db
    .insert(servingPreferences)
    .values({
      tenantId: actor.tenantId,
      memberId: input.memberId,
      frequency: input.frequency,
    })
    .onConflictDoUpdate({
      target: servingPreferences.memberId,
      set: { frequency: input.frequency, updatedAt: new Date() },
    });
}

/**
 * R10.6. How a team's schedule stands: waiting, accepted, declined.
 *
 * Read from today onwards, because last month's answers are not what somebody
 * opening the list is asking about.
 */
export interface AnswerCounts {
  pending: number;
  accepted: number;
  declined: number;
}

export async function answerCounts(
  db: Tx,
  options: { teamIds: string[]; from: string },
): Promise<Record<string, AnswerCounts>> {
  if (options.teamIds.length === 0) return {};

  const rows = await db
    .select({
      teamId: servingAssignments.teamId,
      status: servingAssignments.status,
      count: sql<number>`count(*)::int`,
    })
    .from(servingAssignments)
    .innerJoin(serviceOccurrences, eq(serviceOccurrences.id, servingAssignments.occurrenceId))
    .where(and(
      inArray(servingAssignments.teamId, options.teamIds),
      sql`${serviceOccurrences.occursOn}::text >= ${options.from}`,
      eq(serviceOccurrences.status, "scheduled"),
    ))
    .groupBy(servingAssignments.teamId, servingAssignments.status);

  const out: Record<string, AnswerCounts> = {};
  for (const id of options.teamIds) out[id] = { pending: 0, accepted: 0, declined: 0 };

  for (const row of rows) {
    const bucket = out[row.teamId];
    if (!bucket) continue;
    if (row.status === "accepted") bucket.accepted += row.count;
    else if (row.status === "declined") bucket.declined += row.count;
    else bucket.pending += row.count;
  }
  return out;
}

// ---------------------------------------------------------------------------
// R11.9. Who serves, read from the plan
// ---------------------------------------------------------------------------

/**
 * One person down for one position at this service.
 *
 * The status is carried through, because a request somebody declined leaves the
 * position open and the plan has to say so.
 */
export interface PlanRosterEntry {
  assignmentId: string;
  memberId: string;
  personName: string;
  status: AssignmentStatus;
  overridden: boolean;
  token: string;
}

export interface PlanRosterPosition {
  id: string;
  name: string;
  /** How many the church wants here. */
  needed: number;
  entries: PlanRosterEntry[];
  /** How many are still wanted. A declined request counts as nobody. */
  short: number;
}

export interface PlanRosterTeam {
  id: string;
  name: string;
  hue: string;
  positions: PlanRosterPosition[];
}

/**
 * R11.9. The teams and positions for one service, with who is in them.
 *
 * This is the same schedule the serving pages write, read from the other end,
 * so a name put down here is a request that person answers in the usual way.
 * A team with nothing to fill and nobody in it is left out, because a plan
 * listing every team in the church is a plan nobody reads to the bottom of.
 */
export async function rosterFor(db: Tx, occurrenceId: string): Promise<PlanRosterTeam[]> {
  const slots = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      hue: teams.hue,
      teamOrder: teams.position,
      positionId: teamPositions.id,
      positionName: teamPositions.name,
      needed: teamPositions.needed,
      positionOrder: teamPositions.position,
    })
    .from(teams)
    .innerJoin(teamPositions, eq(teamPositions.teamId, teams.id))
    .where(and(isNull(teams.archivedAt), isNull(teamPositions.archivedAt)))
    .orderBy(asc(teams.position), asc(teams.name), asc(teamPositions.position));

  const assignments = await db
    .select({
      id: servingAssignments.id,
      teamId: servingAssignments.teamId,
      positionId: servingAssignments.positionId,
      memberId: servingAssignments.memberId,
      status: servingAssignments.status,
      overridden: servingAssignments.overridden,
      token: servingAssignments.respondToken,
      firstName: members.firstName,
      preferredName: members.preferredName,
      lastName: members.lastName,
    })
    .from(servingAssignments)
    .innerJoin(members, eq(members.id, servingAssignments.memberId))
    .where(eq(servingAssignments.occurrenceId, occurrenceId))
    .orderBy(asc(members.lastName), asc(members.firstName));

  const byPosition = new Map<string, PlanRosterEntry[]>();
  for (const row of assignments) {
    const entry: PlanRosterEntry = {
      assignmentId: row.id,
      memberId: row.memberId,
      personName: displayName(row),
      status: row.status as AssignmentStatus,
      overridden: row.overridden,
      token: row.token,
    };
    const held = byPosition.get(row.positionId);
    if (held) held.push(entry);
    else byPosition.set(row.positionId, [entry]);
  }

  const out: PlanRosterTeam[] = [];
  for (const slot of slots) {
    const entries = byPosition.get(slot.positionId) ?? [];
    if (slot.needed === 0 && entries.length === 0) continue;

    let team = out.find((x) => x.id === slot.teamId);
    if (!team) {
      team = { id: slot.teamId, name: slot.teamName, hue: slot.hue, positions: [] };
      out.push(team);
    }

    const standing = entries.filter((e) => e.status !== "declined").length;
    team.positions.push({
      id: slot.positionId,
      name: slot.positionName,
      needed: slot.needed,
      entries,
      short: Math.max(slot.needed - standing, 0),
    });
  }

  return out;
}

/**
 * R10.4. Who on this team is away, across the dates on screen.
 *
 * One query for the whole grid rather than one a slot, because the schedule
 * screen asks the same question of twenty cells at once.
 */
export async function blockoutsFor(
  db: Tx,
  personIds: string[],
  window: { from: string; to: string },
): Promise<Blockout[]> {
  if (personIds.length === 0) return [];

  return db
    .select({
      id: blockoutDates.id,
      memberId: blockoutDates.memberId,
      startsOn: sql<string>`${blockoutDates.startsOn}::text`,
      endsOn: sql<string>`${blockoutDates.endsOn}::text`,
      reason: blockoutDates.reason,
    })
    .from(blockoutDates)
    .where(and(
      inArray(blockoutDates.memberId, personIds),
      lte(blockoutDates.startsOn, window.to),
      gte(blockoutDates.endsOn, window.from),
    ))
    .orderBy(asc(blockoutDates.startsOn));
}

/**
 * R10.3. How many slots each team still has to fill across these services.
 *
 * Counted as what the positions ask for against what has been scheduled, so a
 * declined request reads as an open slot, which is what it is.
 */
export async function openSlots(
  db: Tx,
  occurrenceIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (occurrenceIds.length === 0) return out;

  const wanted = await db
    .select({
      teamId: teamPositions.teamId,
      needed: sql<number>`coalesce(sum(${teamPositions.needed}), 0)::int`,
    })
    .from(teamPositions)
    .where(isNull(teamPositions.archivedAt))
    .groupBy(teamPositions.teamId);

  const taken = await db
    .select({
      teamId: servingAssignments.teamId,
      filled: sql<number>`count(*)::int`,
    })
    .from(servingAssignments)
    .where(and(
      inArray(servingAssignments.occurrenceId, occurrenceIds),
      ne(servingAssignments.status, "declined"),
    ))
    .groupBy(servingAssignments.teamId);

  const filled = new Map(taken.map((row) => [row.teamId, row.filled]));
  for (const row of wanted) {
    out[row.teamId] = Math.max(
      0,
      row.needed * occurrenceIds.length - (filled.get(row.teamId) ?? 0),
    );
  }
  return out;
}
