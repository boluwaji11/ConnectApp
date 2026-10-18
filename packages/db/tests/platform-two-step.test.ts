/**
 * HRT-441, R1.8, R21.4. The last resort for somebody locked out of two-step.
 *
 * A church's first owner has nobody above them, so without this an owner who
 * loses the phone and the recovery codes is outside their own church for
 * good. It exists before a second factor is required of anybody, and what is
 * tested here is that it is blunt, scoped to one account, and written down.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { owner, closeConnections } from "../src/client";
import * as platform from "../src/repo/platform";
import { markTwoStepOn, issueRecoveryCodes, twoStepFor } from "../src/repo/two-step";

const OPERATOR = "eeeeeeee-1111-4111-8111-111111111111";
const LOCKED = "eeeeeeee-2222-4222-8222-222222222222";
const OTHER = "eeeeeeee-3333-4333-8333-333333333333";
const OUTSIDER = "eeeeeeee-4444-4444-8444-444444444444";

async function makeUser(id: string, email: string, name: string) {
  await owner()`delete from app_users where id = ${id}`;
  await owner()`delete from auth.users where id = ${id}`;
  await owner()`
    insert into auth.users (id, instance_id, aud, role, email)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email})`;
  await owner()`insert into app_users (id, email, full_name) values (${id}, ${email}, ${name})`;
}

async function giveFactor(id: string) {
  await owner()`
    insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    values (gen_random_uuid(), ${id}, 'test', 'totp', 'verified', now(), now(), 'SECRET')`;
  await markTwoStepOn(id);
  await issueRecoveryCodes(id);
}

const factorsFor = async (id: string) =>
  (await owner()<{ id: string }[]>`select id from auth.mfa_factors where user_id = ${id}`).length;

beforeAll(async () => {
  await makeUser(OPERATOR, "operator-441@example.test", "Operator");
  await makeUser(LOCKED, "locked-441@example.test", "Locked Out");
  await makeUser(OTHER, "other-441@example.test", "Somebody Else");
  await makeUser(OUTSIDER, "outsider-441@example.test", "Not On The Team");

  await owner()`delete from platform_admins where user_id = ${OPERATOR}`;
  await owner()`
    insert into platform_admins (user_id, name) values (${OPERATOR}, 'Operator')`;
});

afterAll(async () => {
  const ids = [OPERATOR, LOCKED, OTHER, OUTSIDER];
  await owner()`delete from platform_admins where user_id = ${OPERATOR}`;
  await owner()`delete from platform_events where actor_id = ${OPERATOR}`;
  await owner()`delete from app_users where id in ${owner()(ids)}`;
  await owner()`delete from auth.users where id in ${owner()(ids)}`;
  await closeConnections();
});

describe("finding the account", () => {
  it("answers nothing for an address with no account", async () => {
    expect(await platform.twoStepFor(OPERATOR, "nobody-441@example.test")).toBeNull();
  });

  it("says whether two-step is on, and how many codes are left", async () => {
    await giveFactor(LOCKED);
    const found = await platform.twoStepFor(OPERATOR, "locked-441@example.test");

    expect(found?.email).toBe("locked-441@example.test");
    expect(found?.enrolledAt).toBeInstanceOf(Date);
    expect(found?.codesLeft).toBe(10);
  });

  it("matches however the address was typed", async () => {
    const found = await platform.twoStepFor(OPERATOR, "  Locked-441@Example.Test  ");
    expect(found?.userId).toBe(LOCKED);
  });

  it("refuses somebody who does not operate the platform", async () => {
    await expect(platform.twoStepFor(OUTSIDER, "locked-441@example.test")).rejects.toThrow();
  });
});

describe("turning it off", () => {
  it("refuses without a reason", async () => {
    await expect(platform.clearTwoStep(OPERATOR, LOCKED, "   ")).rejects.toThrow();
    expect((await twoStepFor(LOCKED)).enrolledAt).not.toBeNull();
  });

  it("refuses an account that has no two-step on", async () => {
    await expect(platform.clearTwoStep(OPERATOR, OTHER, "a good reason")).rejects.toThrow();
  });

  it("refuses somebody who does not operate the platform", async () => {
    await expect(platform.clearTwoStep(OUTSIDER, LOCKED, "a good reason")).rejects.toThrow();
    expect((await twoStepFor(LOCKED)).enrolledAt).not.toBeNull();
  });

  it("takes the factor, the mirror and the codes off together", async () => {
    await giveFactor(OTHER);
    const before = await factorsFor(OTHER);
    expect(before).toBeGreaterThan(0);

    await platform.clearTwoStep(OPERATOR, LOCKED, "called about a lost phone");

    expect(await twoStepFor(LOCKED)).toEqual({ enrolledAt: null, codesLeft: 0 });
    expect(await factorsFor(LOCKED)).toBe(0);
  });

  it("leaves every other account alone", async () => {
    expect(await factorsFor(OTHER)).toBe(1);
    expect((await twoStepFor(OTHER)).enrolledAt).not.toBeNull();
  });

  it("writes the address and the reason into the log", async () => {
    const rows = await owner()<{ action: string; note: string }[]>`
      select action, note from platform_events
       where actor_id = ${OPERATOR} and action = 'two-step cleared'
       order by at desc limit 1`;

    expect(rows[0]?.note).toContain("locked-441@example.test");
    expect(rows[0]?.note).toContain("lost phone");
  });
});
