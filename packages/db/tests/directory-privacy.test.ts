/**
 * HRT-99. What a member lets other members see (R3.2, R3.3, R3.4).
 *
 * The acceptance criterion is the whole test: a member who has hidden their
 * address sees it on their own record and no other member sees it anywhere.
 * The defaults matter as much, because a church that imports two hundred members
 * has consent from none of them.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant, closeConnections, type Tx } from "../src/client";
import {
  memberDirectory, directoryPreferencesFor, setDirectoryPreferences,
} from "../src/repo/directory";
import { DEFAULT_VISIBILITY, entryFor } from "../src/repo/directory-rules";
import { createPerson, listHouseholds } from "../src/repo/members";
import { PermissionError, type TenantRole } from "../src/roles";
import { testTenant, dropTenants } from "./helpers/tenant";

let tenant: string;
let dad: string;
let mum: string;
let loner: string;
let household: string;

const as = (role: TenantRole = "owner") => ({ tenantId: tenant, role });
const run = <T>(work: (tx: Tx) => Promise<T>, role: TenantRole = "owner") =>
  withTenant({ tenantId: tenant, role }, work);

const TODAY = "2026-10-01";
const find = (all: Awaited<ReturnType<typeof memberDirectory>>, name: string) =>
  all.flatMap((h) => h.members).find((p) => p.name === name);

beforeAll(async () => {
  tenant = await testTenant("dirtest", "Directory Test Church");

  const make = async (
    firstName: string,
    dateOfBirth: string,
    household: Record<string, unknown> = {},
  ) =>
    (await run((tx) =>
      createPerson(tx, as(), {
        firstName, lastName: "Privacy", lifecycleStatus: "member", dateOfBirth, ...household,
      } as never),
    )).id;

  dad = await make("David", "1985-04-02", {
    householdName: "The Privacys", householdRole: "head",
    email: "david@privacy.example", phone: "555-0100",
  });
  household = (await run((tx) => listHouseholds(tx))).find((h) => h.name === "The Privacys")!.id;

  mum = await make("Mary", "1987-08-11", {
    householdId: household, householdRole: "spouse", email: "mary@privacy.example",
  });
  /* The household needs a child for the age rules; nothing reads her id. */
  await make("Chloe", "2016-05-20", { householdId: household, householdRole: "child" });
  /* SEC-025. And one the church never recorded a birthday for, which is the
     common case: a family fills in names on a connection card and not dates. */
  await make("Noah", null as unknown as string, {
    householdId: household,
    householdRole: "child",
  });
  loner = await make("Lonnie", "1970-01-01");
});

afterAll(async () => {
  await dropTenants("dirtest");
  await closeConnections();
});

describe("the rule, with nothing behind it (R3.2)", () => {
  const person = {
    id: "p", name: "David Privacy", isChild: false,
    email: "d@example.org", phone: "555", address: "1 Road", birthday: "1985-04-02",
    photoKey: "k",
  };

  it("shows a name and nothing else by default", () => {
    const entry = entryFor(person, DEFAULT_VISIBILITY, null)!;
    expect(entry.name).toBe("David Privacy");
    expect([entry.email, entry.phone, entry.address, entry.birthday, entry.photoKey])
      .toEqual([null, null, null, null, null]);
  });

  it("takes somebody out altogether when they ask (R3.3)", () => {
    expect(entryFor(person, { ...DEFAULT_VISIBILITY, listed: false }, null)).toBeNull();
  });

  it("never shows a child's contact details, whatever anybody set (R3.4)", () => {
    const kid = { ...person, id: "c", name: "Chloe Privacy", isChild: true };
    const everything = {
      listed: true, showEmail: true, showPhone: true, showAddress: true,
      showBirthday: true, showPhoto: true, showChildren: true,
    };
    const entry = entryFor(kid, everything, everything)!;
    expect([entry.email, entry.phone, entry.address, entry.birthday])
      .toEqual([null, null, null, null]);
  });

  it("leaves a child out until the head of the household says so (R3.4)", () => {
    const kid = { ...person, id: "c", isChild: true };
    expect(entryFor(kid, DEFAULT_VISIBILITY, DEFAULT_VISIBILITY)).toBeNull();
    expect(entryFor(kid, DEFAULT_VISIBILITY, { ...DEFAULT_VISIBILITY, showChildren: true }))
      .not.toBeNull();
  });
});

describe("the directory (R3.1)", () => {
  it("groups by household and shows names", async () => {
    const all = await run((tx) => memberDirectory(tx, { asOf: TODAY }), "member");
    const theirs = all.find((h) => h.name === "The Privacys")!;
    expect(theirs.members.map((p) => p.name).sort()).toEqual(["David Privacy", "Mary Privacy"]);
    expect(find(all, "Lonnie Privacy")).toBeDefined();
  });

  it("publishes nothing nobody turned on", async () => {
    const all = await run((tx) => memberDirectory(tx, { asOf: TODAY }), "member");
    expect(all.flatMap((h) => h.members).every((p) => p.email === null && p.address === null))
      .toBe(true);
  });

  it("shows what a member chose to publish", async () => {
    await run((tx) =>
      setDirectoryPreferences(tx, { ...as(), memberId: dad }, dad, {
        showEmail: true, showAddress: true,
      }),
    );
    const all = await run((tx) => memberDirectory(tx, { asOf: TODAY }), "member");
    const david = find(all, "David Privacy")!;
    expect(david.email).not.toBeNull();
    // Mary has published nothing, and lives at the same address.
    expect(find(all, "Mary Privacy")!.address).toBeNull();
  });

  it("takes somebody out when they opt out, and keeps their record", async () => {
    await run((tx) =>
      setDirectoryPreferences(tx, { ...as(), memberId: loner }, loner, { listed: false }),
    );
    const all = await run((tx) => memberDirectory(tx, { asOf: TODAY }), "member");
    expect(find(all, "Lonnie Privacy")).toBeUndefined();

    const theirs = await run((tx) => directoryPreferencesFor(tx, loner));
    expect(theirs.listed).toBe(false);
  });

  it("shows a child only once the head of the household opts in", async () => {
    const before = await run((tx) => memberDirectory(tx, { asOf: TODAY }), "member");
    expect(find(before, "Chloe Privacy")).toBeUndefined();

    await run((tx) =>
      setDirectoryPreferences(tx, { ...as(), memberId: dad }, dad, { showChildren: true }),
    );

    const after = await run((tx) => memberDirectory(tx, { asOf: TODAY }), "member");
    const chloe = find(after, "Chloe Privacy")!;
    expect(chloe.isChild).toBe(true);
    expect([chloe.email, chloe.phone, chloe.birthday]).toEqual([null, null, null]);
  });

  /*
   * SEC-025, R3.4. A minor with no birthday on file is still a minor.
   *
   * The age test read the date of birth and nothing else, so this child fell
   * through to the adult branch, where `listed` defaults to true and contact
   * details are published if anything ever set the preference. The directory is
   * the one surface that publishes and it was the one place without the
   * household-role fallback that the check-in lookup and the station roster
   * both have.
   */
  it("treats a child with no recorded birthday as a child", async () => {
    const all = await run((tx) => memberDirectory(tx, { asOf: TODAY }), "member");
    const noah = find(all, "Noah Privacy");

    /* Visible at all only because the head opted in above, and then only as a
       name: never an address, a phone or a birthday. */
    expect(noah?.isChild).toBe(true);
    expect([noah?.email, noah?.phone, noah?.birthday, noah?.address])
      .toEqual([null, null, null, null]);
  });

  it("finds somebody by their name or their household", async () => {
    const byName = await run((tx) => memberDirectory(tx, { asOf: TODAY, q: "mary" }), "member");
    expect(byName.flatMap((h) => h.members).map((p) => p.name)).toEqual(["Mary Privacy"]);

    const byHousehold = await run((tx) => memberDirectory(tx, { asOf: TODAY, q: "privacys" }), "member");
    expect(byHousehold.length).toBe(1);
  });
});

describe("whose settings they are (R3.2)", () => {
  it("are the member's own", async () => {
    const theirs = await run((tx) =>
      setDirectoryPreferences(tx, { tenantId: tenant, role: "member", memberId: mum }, mum, {
        showPhone: true,
      }), "member");
    expect(theirs.showPhone).toBe(true);
  });

  it("are refused to another member", async () => {
    await expect(
      run((tx) =>
        setDirectoryPreferences(tx, { tenantId: tenant, role: "member", memberId: mum }, dad, {
          listed: false,
        }), "member"),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("can be changed by the church, because somebody rings up and asks", async () => {
    const theirs = await run((tx) =>
      setDirectoryPreferences(tx, { tenantId: tenant, role: "staff" }, dad, { listed: false }),
      "staff");
    expect(theirs.listed).toBe(false);

    await run((tx) =>
      setDirectoryPreferences(tx, { tenantId: tenant, role: "staff" }, dad, { listed: true }),
      "staff");
  });
});

describe("another church's directory", () => {
  it("is never returned", async () => {
    const otherId = await testTenant("dirtest2", "Other Directory Church");
    const theirs = await withTenant({ tenantId: otherId, role: "member" }, (tx) =>
      memberDirectory(tx, { asOf: TODAY }),
    );
    expect(theirs).toEqual([]);
    await dropTenants("dirtest2");
  });
});
