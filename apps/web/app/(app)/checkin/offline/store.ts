"use client";

import type { Roster } from "@connectapp/db";
import type { OfflineEvent } from "@connectapp/db";

/**
 * R8.20, R8.21. What the station is holding.
 *
 * IndexedDB rather than localStorage: the roster for a church of five hundred
 * is larger than localStorage is willing to be, and the event log has to
 * survive the tab being closed and the tablet being locked. Nothing here is
 * worth a dependency, so it is written against the browser API directly.
 *
 * Every read is wrapped, because a station in a private window, or one whose
 * storage was cleared, has to fall back to being an online-only station rather
 * than failing to load.
 */

const DB_NAME = "connectapp-station";
const DB_VERSION = 1;
const KV = "kv";
const EVENTS = "events";

export interface StationSnapshot {
  /** Which station and which service this was pulled for. */
  stationId: string;
  occurrenceId: string;
  roster: Roster;
  rooms: SnapshotRoom[];
  services: SnapshotService[];
  /** R8.21. Codes this station may print with no network. */
  codes: string[];
  churchName: string;
  /** R8.7. Who was already in when the station last had a network. */
  visits: {
    memberId: string; visitId: string; roomId: string | null;
    code: string | null; kind: string;
  }[];
}

export interface SnapshotRoom {
  id: string;
  name: string;
  hue: string;
  capacity: number | null;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  position: number;
}

export interface SnapshotService {
  id: string;
  name: string;
  startsAt: string;
  readableTime: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(EVENTS)) {
        db.createObjectStore(EVENTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function putSnapshot(snapshot: StationSnapshot): Promise<void> {
  try {
    await run(KV, "readwrite", (s) => s.put(snapshot, "snapshot"));
  } catch {
    // A station that cannot write is an online-only station, and it says so.
  }
}

/**
 * What this station is holding, for this station.
 *
 * HRT-436, R8.20, R21.2. `forStation` is not optional cleverness. A check-in
 * tablet is shared: it is signed out of one church and into another, or simply
 * handed over with the tab still open, and the held snapshot carries a
 * church's whole roster with every child's name and allergies in it. Reading
 * it back without asking who it belongs to drew the last church's children on
 * the new church's screen until the network answered, and with no network it
 * never stopped.
 *
 * So a snapshot belonging to another station answers nothing and is thrown
 * away, which is the same thing the station does with a snapshot it has never
 * had: it asks for one.
 */
export async function readSnapshot(forStation?: string): Promise<StationSnapshot | null> {
  try {
    const held = (await run<StationSnapshot | undefined>(KV, "readonly", (s) => s.get("snapshot"))) ?? null;
    if (!held) return null;
    if (forStation && held.stationId !== forStation) {
      await forgetThisChurch();
      return null;
    }
    return held;
  } catch {
    return null;
  }
}

/**
 * HRT-436, R8.20, R21.2. Everything about a church, off this tablet.
 *
 * The roster, the rooms, the service times, the unused codes and the labels
 * waiting to print. Called when somebody signs out and whenever a snapshot
 * turns out to belong to a different station.
 *
 * What it does not throw away is a check-in nobody has told the church about
 * yet. R8 is safety-critical: an event in here is a record of a child being
 * handed over, and losing one to tidy up a tablet is the worst thing this
 * file could do. They stay, and `pendingEvents` refuses to replay them under
 * a church they did not happen in.
 *
 * Returns how many were kept, so the screen can say so rather than leaving
 * somebody to find out on the next service day.
 */
export async function forgetThisChurch(): Promise<{ kept: number }> {
  let kept = 0;
  try {
    kept = (await pendingEvents()).length;
  } catch {
    /* A store that cannot be read holds nothing anybody can rely on, and the
       clearing below is still worth attempting. */
  }

  try {
    await run(KV, "readwrite", (s) => s.delete("snapshot"));
    await run(KV, "readwrite", (s) => s.delete("labels"));
  } catch {
    // A private window, or storage that was cleared underneath us.
  }

  return { kept };
}

/** R8.21. Takes the next unused code, and does not hand it out again. */
export async function takeCode(): Promise<string | null> {
  const snapshot = await readSnapshot();
  if (!snapshot || snapshot.codes.length === 0) return null;
  const [code, ...rest] = snapshot.codes;
  await putSnapshot({ ...snapshot, codes: rest });
  return code ?? null;
}

/**
 * An event, with the station it happened on written beside it.
 *
 * HRT-436. The station is what says which church this belongs to. Without it
 * a tablet moved between churches would hand the second one the first one's
 * check-ins to replay, against member ids and services that are not theirs.
 */
type HeldEvent = OfflineEvent & { stationId?: string };

export async function appendEvent(event: OfflineEvent, stationId?: string): Promise<void> {
  const held: HeldEvent = stationId ? { ...event, stationId } : event;
  await run(EVENTS, "readwrite", (s) => s.put(held));
}

/**
 * What is still waiting to reach the church.
 *
 * HRT-436. With a station named, only the events that happened on it. An
 * event with no station on it was written before this existed and is sent as
 * it always was, because refusing it would lose a check-in to a change in how
 * the record is shaped.
 */
export async function pendingEvents(forStation?: string): Promise<OfflineEvent[]> {
  try {
    const all = await run<HeldEvent[]>(EVENTS, "readonly", (s) => s.getAll());
    const mine = forStation
      ? all.filter((one) => one.stationId === undefined || one.stationId === forStation)
      : all;
    return [...mine].sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    return [];
  }
}

export async function forgetEvents(ids: string[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(EVENTS, "readwrite");
    for (const id of ids) tx.objectStore(EVENTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Labels print from what the station holds, so a print survives the network. */
export async function keepLabels(labels: unknown[]): Promise<void> {
  try {
    await run(KV, "readwrite", (s) => s.put(labels, "labels"));
  } catch {
    // Nothing to do: the labels window falls back to asking the server.
  }
}

export async function readLabels<T>(): Promise<T[]> {
  try {
    return (await run<T[] | undefined>(KV, "readonly", (s) => s.get("labels"))) ?? [];
  } catch {
    return [];
  }
}
