/**
 * HRT-59. Letting a child go (R8.7 to R8.9).
 *
 * This is the function the whole of check-in exists to protect, and these are
 * the tests that would catch the failure the PRD calls critical: a child
 * leaving with the wrong adult.
 *
 * Every rule here can be overridden, because a real Sunday produces cases no
 * rule anticipated. The tests are as much about the override being recorded as
 * about the rule stopping anybody.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { owner, withTenant, closeConnections, type Tx } from "../src/client";
import { checkOut, pickupList, overridesFor } from "../src/repo/checkout";
import { releaseBlock } from "../src/repo/release-rules";
import { checkInFamily, visitsFor } from "../src/repo/checkin";
import { addSpecialService } from "../src/repo/services";
import { addRoom } from "../src/repo/rooms";
import { createPerson } from "../src/repo/members";
import { addRelationship } from "../src/repo/relationships";
import { InvalidInputError } from "../src/errors";
import { PermissionError, type TenantRole } from "../src/roles";
import { testTenant, dropTenants } from "./helpers/tenant";

let tenant: string;
let service: string;
let room: string;
let child: string;
let mother: string;
let grandmother: string;
let stranger: string;
let restricted: string;
let household: string;

const as = (role: TenantRole = "owner") => ({ tenantId: tenant, role });
const run = <T>(work: (tx: Tx) => Promise<T>, role: TenantRole = "owner") =>
  withTenant({ tenantId: tenant, role }, work);

const today = new Date().toISOString().slice(0, 10);

/** Checks the child in again, so each test starts with them in the room. */
const freshVisit = async (): Promise<{ id: string; code: string }> => {
  await owner()`delete from checkin_visits where tenant_id = ${tenant}`;
  await run((tx) => checkInFamily(tx, as(), {
    occurrenceId: service,
    entries: [{ memberId: child, roomId: room, child: true }],
  }));
  const [visit] = await run((tx) => visitsFor(tx, service));
  return { id: visit!.id, code: visit!.code! };
};

beforeAll(async () => {
  const rowId = await testTenant("checkouttest", "Checkout Test Church");
  tenant = rowId;

  room = (await run((tx) => addRoom(tx, as(), { name: "Kids" }))).id;
  service = (await run((tx) => addSpecialService(tx, as(), {
    name: "Sunday", occursOn: today, startsAt: "09:00",
  }))).id;

  mother = (await run((tx) => createPerson(tx, as(), {
    firstName: "Elena", lastName: "Ochoa", lifecycleStatus: "member",
    householdName: "Ochoa", householdRole: "head",
  } as never))).id;

  const [m] = await owner()<{ household_id: string }[]>`
    select household_id from household_memberships where member_id = ${mother}`;
  household = m!.household_id;

  child = (await run((tx) => createPerson(tx, as(), {
    firstName: "Mia", lastName: "Ochoa", dateOfBirth: "2019-06-11",
    lifecycleStatus: "member", householdId: household, householdRole: "child",
  } as never))).id;

  grandmother = (await run((tx) => createPerson(tx, as(), {
    firstName: "Rosa", lastName: "Ochoa", lifecycleStatus: "member",
  } as never))).id;

  stranger = (await run((tx) => createPerson(tx, as(), {
    firstName: "Mark", lastName: "Nobody", lifecycleStatus: "visitor",
  } as never))).id;

  // In the household, which is how somebody ends up on the pickup list, and
  // named by a restriction, which is the custody case this exists for. The
  // product refuses to record them as a guardian at all once the order is in
  // place, so this is the only shape the two facts can take together.
  restricted = (await run((tx) => createPerson(tx, as(), {
    firstName: "Carl", lastName: "Restricted", lifecycleStatus: "member",
    householdId: household, householdRole: "other",
  } as never))).id;

  // Recorded as allowed to collect, and recorded as not allowed near her.
  await run((tx) => addRelationship(tx, as(), {
    memberId: child, relatedMemberId: grandmother, kind: "guardian",
  }));
  await run((tx) => addRelationship(tx, as(), {
    memberId: child, relatedMemberId: restricted, kind: "do_not_contact",
  }));
});

afterAll(async () => {
  await dropTenants("checkouttest");
  await closeConnections();
});

describe("who may collect (R8.8)", () => {
  it("is anybody recorded as a guardian, and anybody in the household", async () => {
    const list = await run((tx) => pickupList(tx, child));
    const names = list.map((p) => p.name);

    expect(names).toContain("Rosa Ochoa");
    expect(names).toContain("Elena Ochoa");
    // A church that has to name every parent before a Sunday works will stop
    // keeping the list, and a list nobody maintains protects nobody.
    expect(list.find((p) => p.name === "Elena Ochoa")!.basis).toBe("household");
    expect(names).not.toContain("Mark Nobody");
  });

  it("marks somebody a restriction names, rather than hiding them", async () => {
    const list = await run((tx) => pickupList(tx, child));
    const carl = list.find((p) => p.name === "Carl Restricted");
    // Hiding them would tell the volunteer nothing. Being told why is the point.
    expect(carl?.restricted).toBe(true);
  });
});

describe("the code (R8.7)", () => {
  it("releases a child when it matches", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: visit.code, collectedBy: mother,
    }));
    expect(result.released).toBe(true);
  });

  it("forgives how it was typed", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: ` ${visit.code.toLowerCase()} `, collectedBy: mother,
    }));
    expect(result.released).toBe(true);
  });

  it("releases nobody when it is wrong", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: "22222", collectedBy: mother,
    }));

    expect(result.released).toBe(false);
    expect(result.block?.kind).toBe("code");

    const [after] = await run((tx) => visitsFor(tx, service));
    expect(after!.checkedOutAt).toBeNull();
  });

  it("releases nobody when it is missing", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: "", collectedBy: mother,
    }));
    expect(result.released).toBe(false);
  });
});

describe("the pickup list (R8.8)", () => {
  it("stops somebody who is not on it, holding the right code", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: visit.code, collectedBy: stranger,
    }));

    expect(result.released).toBe(false);
    expect(result.block?.kind).toBe("pickup");
  });

  /*
   * SEC-013. Through the real path, because the pure rule only proves the
   * decision and not that the lists reached it. `checkOut` read both lists
   * only when a collector was named, so the rule was handed two empty arrays
   * for exactly the case that mattered.
   */
  it("stops a release where nobody said who is collecting", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: visit.code, collectedBy: null,
    }));

    expect(result.released).toBe(false);
    expect(result.block?.kind).toBe("unnamed");
  });

  it("releases on a recorded decision, and writes the reason down", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id,
      code: visit.code,
      collectedBy: null,
      override: { kind: "unnamed", reason: "Grandmother, known to the room leader" },
    }));

    expect(result.released).toBe(true);

    const [row] = await owner()<{ reason_kind: string; reason: string }[]>`
      select reason_kind, reason from checkin_overrides where visit_id = ${visit.id}`;
    expect(row?.reason_kind).toBe("unnamed");
    expect(row?.reason).toContain("Grandmother");
  });
});

describe("a restriction (R8.9)", () => {
  it("stops the person it names, code or no code", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: visit.code, collectedBy: restricted,
    }));

    // They are on the list because they live there, and it makes no difference.
    expect(result.released).toBe(false);
    expect(result.block?.kind).toBe("restriction");
  });

  it("is asked about before the code, so the conversation happens once", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: "22222", collectedBy: restricted,
    }));
    expect(result.block?.kind).toBe("restriction");
  });
});

describe("an override (R8.7)", () => {
  it("passes the rule, and is written down", async () => {
    const visit = await freshVisit();
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id,
      code: "",
      collectedBy: grandmother,
      override: { kind: "code", reason: "Label went through the wash" },
      userId: null,
    }));

    expect(result.released).toBe(true);

    const records = await run((tx) => overridesFor(tx, service));
    expect(records.length).toBe(1);
    expect(records[0]!.childName).toBe("Mia Ochoa");
    expect(records[0]!.reasonKind).toBe("code");
    expect(records[0]!.reason).toBe("Label went through the wash");
    expect(records[0]!.collectedByName).toBe("Rosa Ochoa");
  });

  it("passes only the rule it names", async () => {
    const visit = await freshVisit();
    // An override of the code says nothing about who is standing there.
    const result = await run((tx) => checkOut(tx, as(), {
      visitId: visit.id,
      code: "",
      collectedBy: stranger,
      override: { kind: "code", reason: "No label" },
    }));

    expect(result.released).toBe(false);
    expect(result.block?.kind).toBe("pickup");
  });

  it("refuses an empty reason, because the reason is what the row records", async () => {
    const visit = await freshVisit();
    await expect(
      run((tx) => checkOut(tx, as(), {
        visitId: visit.id,
        code: "",
        collectedBy: mother,
        override: { kind: "code", reason: "   " },
      })),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

});

describe("twice", () => {
  it("is refused, and the record says when they went", async () => {
    const visit = await freshVisit();
    await run((tx) => checkOut(tx, as(), {
      visitId: visit.id, code: visit.code, collectedBy: mother,
    }));

    await expect(
      run((tx) => checkOut(tx, as(), {
        visitId: visit.id, code: visit.code, collectedBy: mother,
      })),
    ).rejects.toBeInstanceOf(InvalidInputError);

    const [after] = await run((tx) => visitsFor(tx, service));
    expect(after!.checkedOutAt).not.toBeNull();
  });
});

describe("who may run a checkout", () => {
  it("refuses a role that does not run a station", async () => {
    const visit = await freshVisit();
    await expect(
      run((tx) => checkOut(tx, as("member"), {
        visitId: visit.id, code: visit.code, collectedBy: mother,
      }), "member"),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

/**
 * R8.7. The release decision on its own, with no database behind it.
 *
 * The station runs this same function with no network, so the one rule that
 * must never bend is asserted here rather than only through the query layer: a
 * child is released on a code, and the absence of a code is not a match.
 */
describe("the release rule", () => {
  const base = {
    kind: "child" as const,
    expected: "AB3DE",
    typed: "AB3DE",
    collectedBy: null,
    restricted: [],
    allowed: [],
    override: null,
  };

  it("lets a child go on the code that was printed", () => {
    expect(releaseBlock(base)).toBeNull();
  });

  /*
   * SEC-013, R8.8, R8.9. The list is the control, so it is asked even when
   * nobody says who is collecting.
   *
   * Both the restriction check and the pickup check sat inside
   * `if (q.collectedBy)`. The checkout dialog opens with nobody selected and
   * its last option is "someone else", which maps to null, so the ordinary
   * path through the screen released a child on the code alone: no list was
   * consulted, no override was involved, and therefore no reason was asked for
   * and no row was written. A person a court order names was released by that
   * path provided they did not say who they were.
   */
  describe("an unnamed collector", () => {
    it("is refused for a child whose records name who may collect them", () => {
      expect(releaseBlock({ ...base, allowed: ["mum"] })).toBe("unnamed");
    });

    it("is refused for a child with a restriction on record", () => {
      expect(releaseBlock({ ...base, restricted: ["ex"] })).toBe("unnamed");
    });

    it("is refused even when the code is right, because the code is not the question", () => {
      expect(releaseBlock({ ...base, typed: "AB3DE", allowed: ["mum"] })).toBe("unnamed");
    });

    it("still needs the code once somebody has decided about the name", () => {
      expect(
        releaseBlock({ ...base, typed: "WRONG", allowed: ["mum"], override: { kind: "unnamed" } }),
      ).toBe("code");
    });

    it("goes through on a recorded decision, which is what writes the reason down", () => {
      expect(
        releaseBlock({ ...base, allowed: ["mum"], override: { kind: "unnamed" } }),
      ).toBeNull();
    });

    it("is not asked of a church that has recorded neither list", () => {
      /* A church with no pickup lists filled in is not made to justify every
         release, which is what made "someone else" the habit. */
      expect(releaseBlock(base)).toBeNull();
    });

    it("is not asked of an adult, who is not being collected", () => {
      expect(
        releaseBlock({ ...base, kind: "adult", expected: null, typed: "", allowed: ["mum"] }),
      ).toBeNull();
    });

    it("does not let an override of another kind stand in for it", () => {
      for (const kind of ["code", "pickup", "restriction"] as const) {
        expect(
          releaseBlock({ ...base, allowed: ["mum"], override: { kind } }),
          kind,
        ).toBe("unnamed");
      }
    });

    it("still refuses a named person who is on neither list", () => {
      expect(releaseBlock({ ...base, collectedBy: "stranger", allowed: ["mum"] })).toBe("pickup");
    });

    it("still refuses a named person a restriction names", () => {
      expect(
        releaseBlock({ ...base, collectedBy: "ex", restricted: ["ex"], allowed: ["ex"] }),
      ).toBe("restriction");
    });

    it("lets a named person on the list through", () => {
      expect(releaseBlock({ ...base, collectedBy: "mum", allowed: ["mum"] })).toBeNull();
    });
  });

  it("refuses a child whose visit carries no code at all", () => {
    expect(releaseBlock({ ...base, expected: null, typed: "" })).toBe("code");
    expect(releaseBlock({ ...base, expected: null, typed: "AB3DE" })).toBe("code");
  });

  it("asks an adult for no code, because a badge is not a claim on anybody", () => {
    expect(releaseBlock({ ...base, kind: "adult", expected: null, typed: "" })).toBeNull();
  });

  it("stops a restriction before it asks about the code", () => {
    expect(
      releaseBlock({ ...base, collectedBy: "x", restricted: ["x"], allowed: ["x"] }),
    ).toBe("restriction");
  });

  it("stops somebody who is not on the list", () => {
    expect(releaseBlock({ ...base, collectedBy: "x", allowed: ["y"] })).toBe("pickup");
  });

  it("passes what a supervisor decided to pass, and nothing else", () => {
    expect(
      releaseBlock({ ...base, typed: "WRONG", override: { kind: "code" } }),
    ).toBeNull();
    expect(
      releaseBlock({ ...base, typed: "WRONG", override: { kind: "pickup" } }),
    ).toBe("code");
  });
});
