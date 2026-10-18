import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  putSnapshot, readSnapshot, forgetThisChurch,
  appendEvent, pendingEvents, type StationSnapshot,
} from "../app/(app)/checkin/offline/store";

/**
 * HRT-436, R8.20, R21.2. A shared tablet does not keep one church's children.
 *
 * The station holds a whole roster so it keeps working with no network, which
 * is R8.20 and is not negotiable. What it held was every child's name and
 * allergies, and it held them through a sign-out and through being handed to
 * another church.
 *
 * The other half of this is the part that must not be got wrong. An event
 * waiting to be sent is a record of a child being handed over, so clearing a
 * tablet never throws one away. It is kept, and it is refused to a church it
 * did not happen in.
 */

const snapshotFor = (stationId: string, church: string): StationSnapshot => ({
  stationId,
  occurrenceId: "occurrence-1",
  roster: { takenAt: new Date().toISOString(), children: [] } as never,
  rooms: [],
  services: [],
  codes: ["AAA111", "BBB222"],
  churchName: church,
  visits: [],
});

const checkIn = (id: string, occurrenceId = "occurrence-1") => ({
  id,
  kind: "checkin" as const,
  at: new Date().toISOString(),
  occurrenceId,
  memberId: `member-${id}`,
  roomId: null,
  child: true,
  code: "AAA111",
  bagLabel: false,
});

beforeEach(async () => {
  await forgetThisChurch();
  for (const event of await pendingEvents()) {
    const { forgetEvents } = await import("../app/(app)/checkin/offline/store");
    await forgetEvents([event.id]);
  }
});

describe("what a sign-out leaves behind", () => {
  it("keeps nothing about the church", async () => {
    await putSnapshot(snapshotFor("station-a", "Riverside Fellowship"));
    expect(await readSnapshot()).not.toBeNull();

    await forgetThisChurch();

    expect(await readSnapshot()).toBeNull();
  });

  it("keeps a check-in nobody has been told about", async () => {
    await putSnapshot(snapshotFor("station-a", "Riverside Fellowship"));
    await appendEvent(checkIn("one"), "station-a");

    const { kept } = await forgetThisChurch();

    expect(kept).toBe(1);
    expect((await pendingEvents()).map((e) => e.id)).toEqual(["one"]);
  });
});

describe("a tablet handed to another church", () => {
  it("draws nothing of the last church's, even with no network", async () => {
    await putSnapshot(snapshotFor("station-a", "Riverside Fellowship"));

    /* The station that is open now, which is not the one that wrote this. */
    expect(await readSnapshot("station-b")).toBeNull();
  });

  it("throws the other church's away rather than leaving it to be found", async () => {
    await putSnapshot(snapshotFor("station-a", "Riverside Fellowship"));
    await readSnapshot("station-b");

    /* Gone for the station that wrote it as well, which is the point: the
       roster is off the tablet, not merely hidden from one screen. */
    expect(await readSnapshot("station-a")).toBeNull();
  });

  it("still answers for the station that wrote it", async () => {
    await putSnapshot(snapshotFor("station-a", "Riverside Fellowship"));
    expect((await readSnapshot("station-a"))?.churchName).toBe("Riverside Fellowship");
  });

  it("does not offer one church's check-ins to another", async () => {
    await appendEvent(checkIn("theirs"), "station-a");
    await appendEvent(checkIn("ours"), "station-b");

    expect((await pendingEvents("station-b")).map((e) => e.id)).toEqual(["ours"]);
    expect((await pendingEvents("station-a")).map((e) => e.id)).toEqual(["theirs"]);
  });

  it("still sends an event written before this existed", async () => {
    /* Refusing one would lose a check-in to a change in how the record is
       shaped, which is the one outcome R8 does not allow. */
    await appendEvent(checkIn("older"));
    expect((await pendingEvents("station-b")).map((e) => e.id)).toEqual(["older"]);
  });
});
