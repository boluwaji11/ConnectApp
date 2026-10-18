"use client";

import * as React from "react";
import { search, suggestRoom } from "@connectapp/db/rules";
import type { Conflict, OfflineEvent, RosterPerson } from "@connectapp/db";
import { snapshot as pullSnapshot, sync } from "../actions";
import type { FoundMatch, FoundPerson } from "../actions";
import { releaseBlock, readCode, type OverrideKind } from "@connectapp/db/rules";
import {
  appendEvent, forgetEvents, pendingEvents, putSnapshot, readSnapshot, takeCode,
  type StationSnapshot,
} from "./store";

/**
 * R8.20 to R8.23. The station, with or without a network.
 *
 * The design case is two minutes before a service with forty families queuing and the wifi
 * down, so the station does not ask whether it is online before it works. It
 * works, from what it is holding, and sends what it did when there is somewhere
 * to send it.
 *
 * Connection state is shown rather than inferred by the volunteer from a screen
 * that stopped responding (R8.22).
 */

/** How often a station that believes it is online checks that it still is. */
const PULL_EVERY_MS = 5 * 60 * 1000;

export interface StationState {
  online: boolean;
  /** Events written at this station and not yet accepted by the server. */
  waiting: number;
  /** R8.23. What reconciliation could not do on its own. */
  conflicts: Conflict[];
  /** When the roster it is holding was pulled. */
  heldSince: string | null;
  /** How many codes are left in the block, so a supervisor can see it running out. */
  codesLeft: number;
}

export function useStation(stationId: string, occurrenceId: string, church: string) {
  const [snapshot, setSnapshot] = React.useState<StationSnapshot | null>(null);
  const [online, setOnline] = React.useState(true);
  const [waiting, setWaiting] = React.useState(0);
  const [conflicts, setConflicts] = React.useState<Conflict[]>([]);
  /** Who this station checked in while it was on its own, and with what code. */
  const [local, setLocal] = React.useState<Record<string, { roomId: string | null; code: string | null }>>({});

  const countWaiting = React.useCallback(async () => {
    const events = await pendingEvents(stationId);
    setWaiting(events.length);

    const mine: Record<string, { roomId: string | null; code: string | null }> = {};
    for (const event of events) {
      if (event.kind === "checkin") mine[event.memberId] = { roomId: event.roomId, code: event.code };
      else delete mine[event.memberId];
    }
    setLocal(mine);
  }, [stationId]);

  /** R8.23. Send what this station did, then take a fresh roster and codes. */
  const reconcile = React.useCallback(async () => {
    /* HRT-436. Only what happened on this station. A tablet carried between
       churches must not hand the second one the first one's check-ins. */
    const events = await pendingEvents(stationId);
    if (events.length > 0) {
      const sent = await sync(stationId, events);
      if (sent.error) return false;
      await forgetEvents(events.map((e) => e.id));
      if (sent.result && sent.result.conflicts.length > 0) {
        setConflicts((was) => [...was, ...sent.result!.conflicts]);
      }
    }
    await countWaiting();
    return true;
  }, [stationId, church, countWaiting]);

  const pull = React.useCallback(async () => {
    const fresh = await pullSnapshot(stationId, occurrenceId);
    if (fresh.error || !fresh.snapshot) {
      setOnline(false);
      return;
    }
    const held: StationSnapshot = { ...fresh.snapshot, services: [] };
    await putSnapshot(held);
    setSnapshot(held);
    setOnline(true);
  }, [stationId, occurrenceId, church]);

  // What it is already holding, before anything is asked of the network.
  React.useEffect(() => {
    /* HRT-436, R8.20, R21.2. Only this station's, so a tablet that was last
       used by another church draws nothing of theirs while the network
       answers, and nothing at all when it cannot. */
    void readSnapshot(stationId).then((held) => {
      if (held) setSnapshot(held);
    });
    void countWaiting();
  }, [stationId, countWaiting]);

  React.useEffect(() => {
    if (!occurrenceId) return;
    let live = true;

    const beat = async () => {
      if (!live || typeof navigator !== "undefined" && !navigator.onLine) {
        setOnline(false);
        return;
      }
      if (await reconcile()) await pull();
    };

    void beat();
    const timer = setInterval(() => void beat(), PULL_EVERY_MS);

    const back = () => void beat();
    const gone = () => setOnline(false);
    window.addEventListener("online", back);
    window.addEventListener("offline", gone);

    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("online", back);
      window.removeEventListener("offline", gone);
    };
  }, [occurrenceId, pull, reconcile]);

  /**
   * R8.20. The same lookup the server does, against what the station holds.
   *
   * The ranking rules come from `@connectapp/db/rules`, which is the file the SQL
   * is written to match, so a family found at 09:57 is found the same way at
   * 09:59 with the router unplugged.
   */
  const searchLocal = React.useCallback(
    (query: string): FoundMatch[] => {
      if (!snapshot) return [];
      const roster = snapshot.roster.members;
      const found = search(roster, query, 20);
      const byHousehold = new Map<string, RosterPerson[]>();
      for (const person of roster) {
        if (!person.householdId) continue;
        const list = byHousehold.get(person.householdId) ?? [];
        list.push(person);
        byHousehold.set(person.householdId, list);
      }

      const asFound = (person: RosterPerson): FoundPerson => {
        const visit = local[person.id];
        // Somebody checked in before the network went is still checked in, and
        // the station holds their visit so they can still be collected.
        const before = snapshot.visits.find((v) => v.memberId === person.id);
        return {
          id: person.id,
          name: person.preferredName?.trim() || person.firstName,
          lastName: person.lastName,
          isChild: person.isChild,
          ageMonths: person.ageMonths,
          suggestedRoomId: person.isChild
            ? (suggestRoom(
                snapshot.rooms.map((r) => ({ ...r, archivedAt: null })),
                person.ageMonths,
              )?.id ?? null)
            : null,
          checkedIn: Boolean(visit ?? before),
          visitId: visit ? person.id : (before?.visitId ?? null),
          roomId: visit?.roomId ?? before?.roomId ?? null,
          allergies: person.allergies,
          medicalNote: person.medicalNote,
        };
      };

      return found.map((person) => {
        const household = person.householdId
          ? (byHousehold.get(person.householdId) ?? [person])
          : [person];
        const ordered = [...household].sort(
          (a, b) =>
            Number(b.isChild) - Number(a.isChild) ||
            (a.ageMonths ?? Number.MAX_SAFE_INTEGER) - (b.ageMonths ?? Number.MAX_SAFE_INTEGER) ||
            a.firstName.localeCompare(b.firstName),
        );
        return {
          id: person.id,
          name: `${person.preferredName?.trim() || person.firstName} ${person.lastName}`,
          household: person.householdName,
          members: ordered.map(asFound),
        };
      });
    },
    [snapshot, local],
  );

  /**
   * R8.21. A check-in with no network.
   *
   * The code comes off the block the station was given, so the label pair it
   * prints is unique for the church without asking anybody. The event is
   * written to the log before the screen says done, because a check-in the
   * station cannot replay is a child nobody can account for.
   */
  const checkInLocally = React.useCallback(
    async (
      entries: { memberId: string; roomId: string | null; child: boolean; bagLabel?: boolean }[],
    ) => {
      const codes: Record<string, string> = {};
      const at = new Date().toISOString();

      for (const entry of entries) {
        const code = entry.child ? await takeCode() : null;
        if (entry.child && !code) throw new Error("codes");
        if (code) codes[entry.memberId] = code;

        const event: OfflineEvent = {
          id: crypto.randomUUID(),
          kind: "checkin",
          at,
          occurrenceId,
          memberId: entry.memberId,
          roomId: entry.roomId,
          child: entry.child,
          code,
          bagLabel: entry.bagLabel === true,
        };
        await appendEvent(event, stationId);
      }

      const held = await readSnapshot(stationId);
      if (held) setSnapshot(held);
      await countWaiting();
      return codes;
    },
    [occurrenceId, countWaiting],
  );

  /**
   * R8.7 to R8.9. Who may collect this child, and the code on their label, from
   * what the station is holding rather than from the server.
   */
  const releaseLocally = React.useCallback(
    async (input: {
      memberId: string;
      typed: string;
      collectedBy: string | null;
      override: { kind: OverrideKind; reason: string } | null;
    }): Promise<OverrideKind | null> => {
      const visit = snapshot?.visits.find((v) => v.memberId === input.memberId);
      const expected = local[input.memberId]?.code ?? visit?.code ?? null;
      const pickup = snapshot?.roster.pickup[input.memberId] ?? [];

      const stopped = releaseBlock({
        kind: visit?.kind === "adult" ? "adult" : "child",
        expected,
        typed: readCode(input.typed),
        collectedBy: input.collectedBy,
        restricted: pickup.filter((p) => p.restricted).map((p) => p.id),
        allowed: pickup.map((p) => p.id),
        override: input.override,
      });
      if (stopped) return stopped;

      await checkOutLocally({
        memberId: input.memberId,
        code: readCode(input.typed),
        collectedBy: input.collectedBy,
        override: input.override,
      });
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, local],
  );

  const checkOutLocally = React.useCallback(
    async (input: {
      memberId: string;
      code: string;
      collectedBy: string | null;
      override: { kind: OverrideKind; reason: string } | null;
    }) => {
      await appendEvent({
        id: crypto.randomUUID(),
        kind: "checkout",
        at: new Date().toISOString(),
        occurrenceId,
        ...input,
      }, stationId);
      await countWaiting();
    },
    [occurrenceId, stationId, countWaiting],
  );

  const state: StationState = {
    online,
    waiting,
    conflicts,
    heldSince: snapshot?.roster.takenAt ?? null,
    codesLeft: snapshot?.codes.length ?? 0,
  };

  /** R8.21. Taking back a check-in this station has not sent yet. */
  const undoLocally = React.useCallback(
    async (memberId: string) => {
      const events = await pendingEvents(stationId);
      const mine = events.filter((e) => e.kind === "checkin" && e.memberId === memberId);
      await forgetEvents(mine.map((e) => e.id));
      await countWaiting();
    },
    [stationId, countWaiting],
  );

  return {
    state,
    snapshot,
    searchLocal,
    checkInLocally,
    checkOutLocally,
    releaseLocally,
    undoLocally,
    pickupFor: (memberId: string) => snapshot?.roster.pickup[memberId] ?? [],
    reconcile,
    dismissConflicts: () => setConflicts([]),
  };
}
