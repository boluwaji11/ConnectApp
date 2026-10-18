"use server";

import {
  withTenant, claimStation, lookupPeople, listRooms, suggestRoom,
  checkInFamily, visitsFor, undoCheckIn, roomCounts,
  checkOut, pickupList, stationRoster, reserveCodes, reconcile,
  roomBoard, roomRoster, arriving, moveToRoom,
  canCheckIn, canSupervise, PermissionError,
  type CheckinEntry, type OverrideKind, type PickupPerson,
  type Roster, type OfflineEvent, type Reconciliation,
  type Board, type RoomRosterEntry, type ArrivingChild,
} from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { churchNow } from "@/lib/church-now";
import { getChurch } from "@connectapp/db";

/**
 * SEC-004, R8.x. Who is at the desk.
 *
 * `permissions` is carried on the actor as well as on the transaction context.
 * Without it a church that wrote its own check-in role was refused by every
 * `canCheckIn` below, because a custom role holder carries `role: "member"`
 * and its grants live in the array.
 */
async function context() {
  const session = await requireSession();
  const who = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
  return { session, actor: who, ctx: who };
}

/**
 * SEC-004, R8.8, R8.10. The reads on this screen are not public to the church.
 *
 * The writes here were refused in the repository, which is the documented
 * design, and the reads were refused nowhere: `find`, `pickup` and `floor`
 * carried no check of any kind, and a server action answers whoever can post
 * to it whatever the screen draws. So any signed-in member of the church could
 * read every child's allergies and free-text medical note, the authorised
 * pickup list with its do-not-contact markers, and the live security code of
 * every child currently checked in. Those three together are what a stranger
 * would need to collect somebody else's child.
 */


export interface ClaimResult {
  /** Null when the station has been retired, or belongs to another church. */
  name: string | null;
}

/**
 * R8.2. A device saying which station it is.
 *
 * The device remembers the choice; the church keeps the configuration. A
 * station that has been retired answers null, so a tablet in a cupboard for six
 * months is asked to choose again rather than checking children in against a
 * configuration nobody maintains.
 */
export async function claim(stationId: string): Promise<ClaimResult> {
  const { actor, ctx } = await context();
  if (!canCheckIn(actor)) throw new PermissionError(actor.role, "checkIn");
  const station = await withTenant(ctx, (tx) => claimStation(tx, stationId));
  return { name: station?.name ?? null };
}

export interface FoundPerson {
  id: string;
  name: string;
  lastName: string;
  isChild: boolean;
  ageMonths: number | null;
  /** The room their date of birth points at. A suggestion, always overridable. */
  suggestedRoomId: string | null;
  /** Set when they are already checked in to the service being worked on. */
  checkedIn: boolean;
  /** The visit to check them out of, when they are in. */
  visitId: string | null;
  roomId: string | null;
  /** R8.10. Null means nothing is recorded, which is not the same as clear. */
  allergies: string | null;
  medicalNote: string | null;
}

export interface FoundMatch {
  /** The person who matched, which is what the row is. */
  id: string;
  /** Their full name, the way the church writes it down. */
  name: string;
  /** The household they live in, for the second line. Null when they live alone. */
  household: string | null;
  /** Them and everybody they live with, children first. */
  members: FoundPerson[];
}

export interface FindResult {
  matches?: FoundMatch[];
  error?: string;
}

/**
 * R8.3. Finding somebody from what was typed at the station.
 *
 * A directory lookup: the rows are members, best match first. The household
 * comes with each row so that opening a person puts their family on screen
 * without a second trip to the server, which is the difference between one
 * press for three children and three.
 *
 * The room each child is sent to is worked out here rather than in the browser,
 * because the ages and the room configuration are both the church's and a
 * station that is about to lose its network should not be holding the rules in
 * its head.
 */
export async function find(
  query: string,
  occurrenceId: string,
  ): Promise<FindResult> {
  const { session, actor, ctx } = await context();

  try {
    if (!canCheckIn(actor)) throw new PermissionError(actor.role, "checkIn");
    return await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const asOf = churchNow(profile?.timezone ?? "America/Chicago").date;

      const [matches, rooms, already] = await Promise.all([
        lookupPeople(tx, query, { asOf }),
        listRooms(tx),
        occurrenceId ? visitsFor(tx, occurrenceId) : Promise.resolve([]),
      ]);

      const found = (person: (typeof matches)[number]["household"][number]): FoundPerson => {
        const visit = already.find((v) => v.memberId === person.id);
        return {
          id: person.id,
          name: person.name,
          lastName: person.lastName,
          isChild: person.isChild,
          ageMonths: person.ageMonths,
          suggestedRoomId: person.isChild
            ? (suggestRoom(rooms, person.ageMonths)?.id ?? null)
            : null,
          checkedIn: Boolean(visit) && visit?.checkedOutAt === null,
          visitId: visit?.id ?? null,
          roomId: visit?.roomId ?? null,
          allergies: person.allergies,
          medicalNote: person.medicalNote,
        };
      };

      return {
        matches: matches.map((match) => ({
          id: match.person.id,
          name: `${match.person.name} ${match.person.lastName}`,
          household: match.householdName,
          members: match.household.map(found),
        })),
      };
    });
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface CheckinResult {
  error?: string;
  /** Who is in each room now, so the desk can warn before the next family. */
  counts?: Record<string, number>;
  /** The code each child was given, so the desk can show what was printed. */
  codes?: Record<string, string>;
}

export async function checkIn(
  occurrenceId: string,
  stationId: string | null,
  entries: CheckinEntry[],
  ): Promise<CheckinResult> {
  const { session, actor, ctx } = await context();
  try {
    return await withTenant(ctx, async (tx) => {
      const visits = await checkInFamily(tx, actor, {
        occurrenceId,
        stationId,
        userId: session.userId,
        entries,
      });

      const codes: Record<string, string> = {};
      for (const visit of visits) if (visit.code) codes[visit.memberId] = visit.code;

      return { counts: await roomCounts(tx, occurrenceId), codes };
    });
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function undo(
  occurrenceId: string,
  memberId: string,
  ): Promise<CheckinResult> {
  const { actor, ctx } = await context();
  try {
    return await withTenant(ctx, async (tx) => {
      await undoCheckIn(tx, actor, occurrenceId, memberId);
      return { counts: await roomCounts(tx, occurrenceId) };
    });
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface PickupResult {
  members?: PickupPerson[];
  error?: string;
}

/** R8.8. Who the church has recorded as allowed to collect this child. */
export async function pickup(childId: string): Promise<PickupResult> {
  const { actor, ctx } = await context();
  try {
    if (!canCheckIn(actor)) throw new PermissionError(actor.role, "checkIn");
    return { members: await withTenant(ctx, (tx) => pickupList(tx, childId)) };
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface ReleaseResult {
  released?: boolean;
  /** What stopped it, as something to show and decide about. */
  block?: { kind: OverrideKind; message: string };
  error?: string;
}

const BLOCKED: Record<string, string> = {
  code: "checkout.block.code",
  pickup: "checkout.block.pickup",
  restriction: "checkout.block.restriction",
};

/**
 * R8.7 to R8.9. Releasing a child, or saying why not.
 *
 * A block comes back as something to read and decide about rather than an
 * error, because deciding is what a supervisor is for and the decision is
 * recorded either way.
 */
export async function release(
  visitId: string,
  code: string,
  collectedBy: string | null,
  override: { kind: OverrideKind; reason: string } | null,
  ): Promise<ReleaseResult> {
  const { session, actor, ctx } = await context();
  try {
    const result = await withTenant(ctx, (tx) =>
      checkOut(tx, actor, {
        visitId,
        code,
        collectedBy,
        override,
        userId: session.userId,
      }),
    );

    if (result.released) return { released: true };
    return {
      released: false,
      block: {
        kind: result.block!.kind,
        message: t(BLOCKED[result.block!.kind] as never),
      },
    };
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface SnapshotResult {
  snapshot?: {
    stationId: string;
    occurrenceId: string;
    roster: Roster;
    rooms: {
      id: string; name: string; hue: string; capacity: number | null;
      minAgeMonths: number | null; maxAgeMonths: number | null; position: number;
    }[];
    codes: string[];
    churchName: string;
    /** R8.7. Who is already checked in, with the code on their label. */
    visits: {
      memberId: string; visitId: string; roomId: string | null;
      code: string | null; kind: string;
    }[];
  };
  error?: string;
}

/**
 * R8.20, R8.21. What the station takes with it.
 *
 * Pulled when a station is claimed, when a service is chosen, and after every
 * reconciliation, so the tablet standing in the lobby at 09:40 is already
 * holding the directory, the rooms, the medical notes, the pickup lists, and a
 * block of codes nobody else can print.
 */
export async function snapshot(
  stationId: string,
  occurrenceId: string,
  ): Promise<SnapshotResult> {
  const { session, actor, ctx } = await context();

  try {
    /* SEC-004. Said outright. This was refused only because `reserveCodes`
       further down the same `Promise.all` refuses, which is a guard one
       reordering away from not being one, and the roster it returns is every
       member's medical note and every child's pickup list. */
    if (!canCheckIn(actor)) throw new PermissionError(actor.role, "checkIn");

    return await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const asOf = churchNow(profile?.timezone ?? "America/Chicago").date;

      const [roster, rooms, block, already] = await Promise.all([
        stationRoster(tx, { asOf }),
        listRooms(tx),
        reserveCodes(tx, actor, { occurrenceId, stationId }),
        visitsFor(tx, occurrenceId),
      ]);

      return {
        snapshot: {
          stationId,
          occurrenceId,
          roster,
          rooms: rooms
            .filter((r) => r.archivedAt === null)
            .map((r) => ({
              id: r.id,
              name: r.name,
              hue: r.hue,
              capacity: r.capacity,
              minAgeMonths: r.minAgeMonths,
              maxAgeMonths: r.maxAgeMonths,
              position: r.position,
            })),
          codes: block.codes,
          churchName: session.tenantName,
          visits: already
            .filter((v) => v.checkedOutAt === null)
            .map((v) => ({
              memberId: v.memberId, visitId: v.id, roomId: v.roomId,
              code: v.code, kind: v.kind,
            })),
        },
      };
    });
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface SyncResult {
  result?: Reconciliation;
  error?: string;
}

/**
 * R8.23. The station's log, replayed.
 *
 * Conflicts come back rather than being resolved here, because a child checked
 * in at two stations is a question about where a child physically is, and the
 * answer to that is a person walking to a room.
 */
export async function sync(
  stationId: string,
  events: OfflineEvent[],
  ): Promise<SyncResult> {
  const { session, actor, ctx } = await context();
  try {
    return {
      result: await withTenant(ctx, (tx) =>
        reconcile(tx, actor, { stationId, userId: session.userId, events }),
      ),
    };
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface FloorResult {
  board?: Board;
  rosters?: Record<string, RoomRosterEntry[]>;
  waiting?: ArrivingChild[];
  error?: string;
}

/**
 * R8.14, R8.18. The floor as it is right now: every class, who is in it, and
 * the children who are here and have not been put in one yet.
 *
 * Counted on every read. A tally that drifts is worse than no tally, because
 * somebody will trust it in the minute they should be walking to the room.
 */
export async function floor(occurrenceId: string): Promise<FloorResult> {
  const { session, actor, ctx } = await context();

  try {
    if (!canSupervise(actor)) throw new PermissionError(actor.role, "checkIn");
    return await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const today = churchNow(profile?.timezone ?? "America/Chicago").date;
      const live = await roomBoard(tx, occurrenceId);
      const rosters: Record<string, RoomRosterEntry[]> = {};
      for (const room of live.rooms) {
        rosters[room.roomId] = await roomRoster(tx, occurrenceId, room.roomId);
      }
      return { board: live, rosters, waiting: await arriving(tx, occurrenceId, today) };
    });
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R8.14. Putting a child in a class, or moving them to another one. */
export async function place(
  visitId: string,
  roomId: string | null,
  ): Promise<{ error?: string }> {
  const { actor, ctx } = await context();

  try {
    await withTenant(ctx, (tx) => moveToRoom(tx, actor, visitId, roomId));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R8.14. Checking a child in from the floor screen.
 *
 * The same write the desk makes, for the person walking the corridor who has
 * found a child nobody put through the queue.
 */
export async function checkInTo(
  input: { occurrenceId: string; memberId: string; roomId: string },
  ): Promise<{ error?: string }> {
  const { session, actor, ctx } = await context();

  try {
    await withTenant(ctx, (tx) =>
      checkInFamily(tx, actor, {
        occurrenceId: input.occurrenceId,
        userId: session.userId,
        entries: [{ memberId: input.memberId, roomId: input.roomId }],
      }),
    );
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}
