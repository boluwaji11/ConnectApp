/**
 * HRT-438, R1.8, R21.4. Who has to have a second factor.
 *
 * "Anyone who can see member information, no exception." The line is drawn on
 * permissions rather than on the nine built-in names, because a church writes
 * its own roles and one of them holding `members.edit` is as much reach as
 * Admin. A plain member holds nothing and is never asked.
 */
import { describe, it, expect } from "vitest";
import { needsTwoStep, TWO_STEP_PERMISSIONS } from "../src/roles";
import { ROLE_PERMISSIONS, type TenantRole, type Permission } from "../src/permissions";

const BUILT_IN = Object.keys(ROLE_PERMISSIONS) as TenantRole[];

describe("the built-in roles", () => {
  it("asks the owner", () => {
    expect(needsTwoStep("owner")).toBe(true);
  });

  it("never asks a plain member, who can see none of it", () => {
    expect(needsTwoStep("member")).toBe(false);
    expect(ROLE_PERMISSIONS.member).toEqual([]);
  });

  it("asks every role that holds one of the named permissions", () => {
    for (const role of BUILT_IN) {
      const holds = TWO_STEP_PERMISSIONS.some((one) =>
        (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(one),
      );
      expect(needsTwoStep(role), role).toBe(holds);
    }
  });

  it("asks nobody who holds nothing", () => {
    for (const role of BUILT_IN) {
      if (ROLE_PERMISSIONS[role].length === 0) expect(needsTwoStep(role), role).toBe(false);
    }
  });
});

describe("a role a church wrote itself", () => {
  const custom = (permissions: Permission[]) =>
    ({ role: "member" as TenantRole, permissions });

  it("is asked when it can edit member records", () => {
    expect(needsTwoStep(custom(["members.edit"]))).toBe(true);
  });

  it("is asked when it can read the giving amounts", () => {
    expect(needsTwoStep(custom(["giving.amounts"]))).toBe(true);
  });

  it("is asked when it can run the children's check-in", () => {
    expect(needsTwoStep(custom(["checkin.run"]))).toBe(true);
  });

  it("is asked when it can change the church, which can grant the rest", () => {
    expect(needsTwoStep(custom(["church.manage"]))).toBe(true);
  });

  it("is not asked for a role that only touches the website", () => {
    expect(needsTwoStep(custom(["website.manage"]))).toBe(false);
  });

  it("is asked when it leads a group, which is a roster of people", () => {
    expect(needsTwoStep(custom(["groups.lead"]))).toBe(true);
  });

  it("is not asked for an empty role", () => {
    expect(needsTwoStep(custom([]))).toBe(false);
  });
});

describe("the list itself", () => {
  it("covers people, children, money and the church's own settings", () => {
    for (const one of [
      "members.edit", "members.notes.confidential",
      "checkin.run", "checkin.incidents",
      "giving.amounts", "giving.manage",
      "church.manage",
    ] as Permission[]) {
      expect(TWO_STEP_PERMISSIONS).toContain(one);
    }
  });

  it("names no permission that does not exist", () => {
    const every = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const one of TWO_STEP_PERMISSIONS) expect(every.has(one), one).toBe(true);
  });
});
