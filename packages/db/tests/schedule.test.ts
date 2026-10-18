/**
 * HRT-80. The schedule: who is doing what, at which gathering (R10.3 to R10.5).
 *
 * The conflict check is why the schedule is one system rather than
 * one per ministry, so most of this is about what the scheduler is warned
 * about: already serving at that hour on somebody else's team, away, or due a
 * break. And about the warning being a warning: a church that cannot write
 * down a decision it already made will keep its schedule in a spreadsheet.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant, closeConnections, type Tx } from "../src/client";
import {
  assign, unassign, assignmentsForTeam, assignmentsForPerson, candidatesFor,
  checkFor, upcomingServices, addBlockout, listBlockouts, removeBlockout,
  setServingPreference, getServingPreference, ScheduleConflictError,
} from "../src/repo/schedule";
import { seedTeams, listTeams, getTeam, addToTeam, setTeamMemberPositions } from "../src/repo/serving";
import { createPerson } from "../src/repo/members";
import { addSpecialService } from "../src/repo/services";
import { InvalidInputError } from "../src/errors";
import type { TenantRole } from "../src/roles";
import { testTenant, dropTenants } from "./helpers/tenant";

let tenant: string;
const SLUG = "scheduletest";
const ids: Record<string, string> = {};
const services: Record<string, string> = {};
let worship: string;
let production: string;
let keys: string;
let vocals: string;
let sound: string;

const as = (role: TenantRole = "owner") => ({ tenantId: tenant, role });
const run = <T>(work: (tx: Tx) => Promise<T>, role: TenantRole = "owner") =>
  withTenant({ tenantId: tenant, role }, work);

const person = async (firstName: string) => {
  const made = await run((tx) =>
    createPerson(tx, as(), { firstName, lastName: "Scheduletest" } as never),
  );
  ids[firstName] = made.id;
  return made.id;
};

beforeAll(async () => {
  tenant = await testTenant(SLUG, "Schedule Test Church");
  await run((tx) => seedTeams(tx, as()));

  const teams = await run((tx) => listTeams(tx));
  worship = teams.find((t) => t.name === "Worship")!.id;
  production = teams.find((t) => t.name === "Production")!.id;

  const w = await run((tx) => getTeam(tx, worship));
  keys = w!.positions.find((p) => p.name === "Keys")!.id;
  vocals = w!.positions.find((p) => p.name === "Vocals")!.id;
  const p = await run((tx) => getTeam(tx, production));
  sound = p!.positions.find((pp) => pp.name === "Sound")!.id;

  await person("Ada");
  await person("Boma");
  await person("Chi");

  for (const id of [ids.Ada!, ids.Boma!, ids.Chi!]) {
    await run((tx) => addToTeam(tx, as(), { teamId: worship, memberId: id }));
    await run((tx) => addToTeam(tx, as(), { teamId: production, memberId: id }));
  }

  // Ada is marked as playing keys, so she sorts first for it.
  const member = (await run((tx) => getTeam(tx, worship)))!.members
    .find((m) => m.memberId === ids.Ada)!;
  await run((tx) =>
    setTeamMemberPositions(tx, as(), { teamId: worship, memberId: member.id, positionIds: [keys] }),
  );

  // Two gatherings at the same hour on one day, and one a week later.
  services.first = (await run((tx) =>
    addSpecialService(tx, as(), { name: "Morning", occursOn: "2027-03-07", startsAt: "10:00" }),
  )).id;
  services.second = (await run((tx) =>
    addSpecialService(tx, as(), { name: "Second morning", occursOn: "2027-03-07", startsAt: "10:00" }),
  )).id;
  services.later = (await run((tx) =>
    addSpecialService(tx, as(), { name: "Next week", occursOn: "2027-03-14", startsAt: "10:00" }),
  )).id;
  services.evening = (await run((tx) =>
    addSpecialService(tx, as(), { name: "Evening", occursOn: "2027-03-07", startsAt: "18:30" }),
  )).id;
});

afterAll(async () => {
  await dropTenants(SLUG);
  await closeConnections();
});

describe("putting somebody down", () => {
  it("records who is in which position at which gathering", async () => {
    await run((tx) =>
      assign(tx, as(), {
        occurrenceId: services.first!, teamId: worship, positionId: keys, memberId: ids.Ada!,
      }),
    );

    const schedule = await run((tx) => assignmentsForTeam(tx, worship, [services.first!]));
    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.personName).toContain("Ada");
    expect(schedule[0]!.positionName).toBe("Keys");
    expect(schedule[0]!.status).toBe("pending");
    expect(schedule[0]!.overridden).toBe(false);
  });

  it("refuses a position that belongs to another team", async () => {
    await expect(
      run((tx) =>
        assign(tx, as(), {
          occurrenceId: services.first!, teamId: worship, positionId: sound, memberId: ids.Boma!,
        }),
      ),
    ).rejects.toThrow(InvalidInputError);
  });

  it("refuses the same person in the same position twice", async () => {
    await expect(
      run((tx) =>
        assign(tx, as(), {
          occurrenceId: services.first!, teamId: worship, positionId: keys, memberId: ids.Ada!,
          anyway: true,
        }),
      ),
    ).rejects.toThrow(InvalidInputError);
  });
});

describe("serving in two places at one hour", () => {
  it("is allowed, because small churches do it", async () => {
    const made = await run((tx) =>
      assign(tx, as(), {
        occurrenceId: services.first!, teamId: production, positionId: sound, memberId: ids.Ada!,
      }),
    );
    expect(made.overridden).toBe(false);
  });

  it("says nothing about it at all", async () => {
    const warning = await run((tx) =>
      checkFor(tx, { memberId: ids.Ada!, occurrenceId: services.second! }),
    );
    expect(warning.blockedOut).toBeNull();
    expect(warning.tooSoon).toBeNull();
  });
});

describe("blockout dates", () => {
  it("refuses a range that ends before it starts", async () => {
    await expect(
      run((tx) =>
        addBlockout(tx, as(), {
          memberId: ids.Boma!, startsOn: "2027-03-10", endsOn: "2027-03-01",
        }),
      ),
    ).rejects.toThrow(InvalidInputError);
  });

  it("warns when the gathering falls inside one, at either end", async () => {
    await run((tx) =>
      addBlockout(tx, as(), {
        memberId: ids.Boma!, startsOn: "2027-03-07", endsOn: "2027-03-14", reason: "Away",
      }),
    );

    for (const occurrenceId of [services.first!, services.later!]) {
      const warning = await run((tx) => checkFor(tx, { memberId: ids.Boma!, occurrenceId }));
      expect(warning.blockedOut?.reason).toBe("Away");
    }
  });

  it("refuses until it is told to go ahead, then says it was told", async () => {
    await expect(
      run((tx) =>
        assign(tx, as(), {
          occurrenceId: services.later!, teamId: worship, positionId: vocals,
          memberId: ids.Boma!,
        }),
      ),
    ).rejects.toThrow(ScheduleConflictError);

    const made = await run((tx) =>
      assign(tx, as(), {
        occurrenceId: services.later!, teamId: worship, positionId: vocals,
        memberId: ids.Boma!, anyway: true,
      }),
    );
    expect(made.overridden).toBe(true);
  });

  it("is listed and can be taken back off by the person it belongs to", async () => {
    const [one] = await run((tx) => listBlockouts(tx, ids.Boma!));
    expect(one?.startsOn).toBe("2027-03-07");

    /*
     * SEC-018. Somebody else's id does not take it off. This used to be a
     * delete by row id with the actor discarded, so any member of the church
     * could clear another member's unavailability and the scheduler would then
     * roster them onto a date they had declared themselves away for.
     */
    await expect(
      run((tx) => removeBlockout(tx, as(), one!.id, ids.Chi!)),
    ).rejects.toThrow(InvalidInputError);
    expect(await run((tx) => listBlockouts(tx, ids.Boma!))).toHaveLength(1);

    await run((tx) => removeBlockout(tx, as(), one!.id, ids.Boma!));
    expect(await run((tx) => listBlockouts(tx, ids.Boma!))).toHaveLength(0);
  });
});

describe("how often somebody wants to serve", () => {
  it("is kept, changed and cleared", async () => {
    await run((tx) => setServingPreference(tx, as(), { memberId: ids.Chi!, frequency: "monthly" }));
    expect(await run((tx) => getServingPreference(tx, ids.Chi!))).toBe("monthly");

    await run((tx) => setServingPreference(tx, as(), { memberId: ids.Chi!, frequency: "weekly" }));
    expect(await run((tx) => getServingPreference(tx, ids.Chi!))).toBe("weekly");

    await run((tx) => setServingPreference(tx, as(), { memberId: ids.Chi!, frequency: null }));
    expect(await run((tx) => getServingPreference(tx, ids.Chi!))).toBeNull();
  });

  it("warns when they served more recently than they asked to", async () => {
    await run((tx) => setServingPreference(tx, as(), { memberId: ids.Chi!, frequency: "monthly" }));
    await run((tx) =>
      assign(tx, as(), {
        occurrenceId: services.first!, teamId: worship, positionId: vocals, memberId: ids.Chi!,
      }),
    );

    const warning = await run((tx) =>
      checkFor(tx, { memberId: ids.Chi!, occurrenceId: services.later! }),
    );
    expect(warning.tooSoon?.lastServedOn).toBe("2027-03-07");
    expect(warning.tooSoon?.frequency).toBe("monthly");
  });

  it("says nothing to somebody who asked for weekly", async () => {
    await run((tx) => setServingPreference(tx, as(), { memberId: ids.Chi!, frequency: "weekly" }));
    const warning = await run((tx) =>
      checkFor(tx, { memberId: ids.Chi!, occurrenceId: services.later! }),
    );
    expect(warning.tooSoon).toBeNull();
  });
});

describe("who could fill a position", () => {
  it("puts whoever plays it, and has nothing against them, at the top", async () => {
    const found = await run((tx) =>
      candidatesFor(tx, { teamId: worship, positionId: keys, occurrenceId: services.later! }),
    );
    expect(found[0]!.name).toContain("Ada");
    expect(found[0]!.plays).toBe(true);
  });

  it("lists the whole roster rather than hiding anybody", async () => {
    const found = await run((tx) =>
      candidatesFor(tx, { teamId: worship, positionId: keys, occurrenceId: services.second! }),
    );
    expect(found.map((c) => c.name)).toHaveLength(3);
  });
});

describe("one person's own schedule", () => {
  it("reads every team at once, soonest first", async () => {
    const mine = await run((tx) => assignmentsForPerson(tx, ids.Ada!, { from: "2027-01-01" }));
    expect(mine.map((a) => a.teamName).sort()).toEqual(["Production", "Worship"]);
    expect(mine[0]!.occursOn <= mine[1]!.occursOn).toBe(true);
  });

  it("drops what was taken off", async () => {
    const [first] = await run((tx) => assignmentsForPerson(tx, ids.Ada!, { from: "2027-01-01" }));
    await run((tx) => unassign(tx, as(), first!.id));
    const after = await run((tx) => assignmentsForPerson(tx, ids.Ada!, { from: "2027-01-01" }));
    expect(after.map((a) => a.id)).not.toContain(first!.id);
  });
});

describe("the gatherings a schedule covers", () => {
  it("is soonest first, from the day asked about", async () => {
    const found = await run((tx) => upcomingServices(tx, { from: "2027-03-01", limit: 10 }));
    const days = found.map((o) => `${o.occursOn} ${o.startsAt}`);
    expect([...days].sort()).toEqual(days);
    expect(found.length).toBeGreaterThanOrEqual(4);
  });
});
