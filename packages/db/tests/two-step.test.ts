/**
 * HRT-437, R1.8. Two-step verification, on the half this repository holds.
 *
 * Supabase decides whether a six-digit code is right. What is tested here is
 * the recovery path, which is ours, and which is the part that decides whether
 * a volunteer treasurer who drops their phone in a font is locked out of the
 * church's giving records.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { owner, closeConnections } from "../src/client";
import { hasAuthSchema } from "./helpers/auth-schema";
import {
  twoStepFor, markTwoStepOn, markTwoStepOff,
  issueRecoveryCodes, spendRecoveryCode, RECOVERY_CODE_COUNT,
} from "../src/repo/two-step";

const PERSON = "dddddddd-1111-4111-8111-111111111111";
const OTHER = "dddddddd-2222-4222-8222-222222222222";

/**
 * Both halves of a person: the authentication row Supabase owns and the mirror
 * this product keeps. Both, because `markTwoStepOff` deletes the factor and a
 * factor points at `auth.users`.
 */
/* Asked once, at collection, so the cases that need it can skip themselves. */
const auth = await hasAuthSchema();

async function makeUser(id: string, email: string) {
  await owner()`delete from app_users where id = ${id}`;
  if (auth) {
    await owner()`delete from auth.users where id = ${id}`;
    await owner()`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${email})`;
  }
  await owner()`insert into app_users (id, email) values (${id}, ${email})`;
}

beforeAll(async () => {
  await makeUser(PERSON, "two-step@example.test");
  await makeUser(OTHER, "two-step-other@example.test");
});

afterAll(async () => {
  await owner()`delete from app_users where id in (${PERSON}, ${OTHER})`;
  if (auth) await owner()`delete from auth.users where id in (${PERSON}, ${OTHER})`;
  await closeConnections();
});

describe("the mirror of what Supabase holds", () => {
  it("starts off, with nothing to recover with", async () => {
    expect(await twoStepFor(PERSON)).toEqual({ enrolledAt: null, codesLeft: 0 });
  });

  it("answers a user it has never seen rather than throwing", async () => {
    const nobody = "dddddddd-9999-4999-8999-999999999999";
    expect(await twoStepFor(nobody)).toEqual({ enrolledAt: null, codesLeft: 0 });
  });

  it("goes on, and comes back off", async () => {
    await markTwoStepOn(PERSON);
    expect((await twoStepFor(PERSON)).enrolledAt).toBeInstanceOf(Date);

    await markTwoStepOff(PERSON);
    expect((await twoStepFor(PERSON)).enrolledAt).toBeNull();
  });

  it("keeps the moment it was first finished, not the moment it was last asked", async () => {
    await markTwoStepOff(PERSON);
    await markTwoStepOn(PERSON);
    const first = (await twoStepFor(PERSON)).enrolledAt;
    await new Promise((r) => setTimeout(r, 20));
    await markTwoStepOn(PERSON);
    expect((await twoStepFor(PERSON)).enrolledAt).toEqual(first);
  });
});

describe("recovery codes", () => {
  it("issues a full set, and counts them", async () => {
    const codes = await issueRecoveryCodes(PERSON);
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    expect((await twoStepFor(PERSON)).codesLeft).toBe(RECOVERY_CODE_COUNT);
  });

  it("never writes the code itself", async () => {
    const codes = await issueRecoveryCodes(PERSON);
    const rows = await owner()<{ code_hash: string }[]>`
      select code_hash from account_recovery_codes where user_id = ${PERSON}`;
    const stored = rows.map((r) => r.code_hash).join(" ");
    for (const code of codes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace("-", ""));
    }
  });

  it("spends a code once, and refuses it the second time", async () => {
    const codes = await issueRecoveryCodes(PERSON);
    const one = codes[0]!;

    expect(await spendRecoveryCode(PERSON, one)).toBe(true);
    expect((await twoStepFor(PERSON)).codesLeft).toBe(RECOVERY_CODE_COUNT - 1);

    expect(await spendRecoveryCode(PERSON, one)).toBe(false);
    expect((await twoStepFor(PERSON)).codesLeft).toBe(RECOVERY_CODE_COUNT - 1);
  });

  it("reads a code back however it was typed", async () => {
    const codes = await issueRecoveryCodes(PERSON);
    const one = codes[0]!;
    expect(await spendRecoveryCode(PERSON, one.toUpperCase().replace("-", " "))).toBe(true);
  });

  it("refuses a code that was never issued", async () => {
    await issueRecoveryCodes(PERSON);
    expect(await spendRecoveryCode(PERSON, "zzzzz-zzzzz")).toBe(false);
    expect(await spendRecoveryCode(PERSON, "")).toBe(false);
    expect((await twoStepFor(PERSON)).codesLeft).toBe(RECOVERY_CODE_COUNT);
  });

  it("refuses another person's code, which is the whole of the boundary", async () => {
    const mine = await issueRecoveryCodes(PERSON);
    await issueRecoveryCodes(OTHER);

    expect(await spendRecoveryCode(OTHER, mine[0]!)).toBe(false);
    expect((await twoStepFor(PERSON)).codesLeft).toBe(RECOVERY_CODE_COUNT);
    expect((await twoStepFor(OTHER)).codesLeft).toBe(RECOVERY_CODE_COUNT);
  });

  it("replaces the old set rather than adding to it", async () => {
    const first = await issueRecoveryCodes(PERSON);
    const second = await issueRecoveryCodes(PERSON);

    expect((await twoStepFor(PERSON)).codesLeft).toBe(RECOVERY_CODE_COUNT);
    expect(await spendRecoveryCode(PERSON, first[0]!)).toBe(false);
    expect(await spendRecoveryCode(PERSON, second[0]!)).toBe(true);
  });

  it("takes the codes away with the factor", async () => {
    await issueRecoveryCodes(PERSON);
    await markTwoStepOn(PERSON);

    await markTwoStepOff(PERSON);
    expect(await twoStepFor(PERSON)).toEqual({ enrolledAt: null, codesLeft: 0 });
  });
});

describe.runIf(auth)("the factor itself", () => {
  /*
   * Supabase will not unenroll a verified factor from a session that has not
   * presented one: "AAL2 required to unenroll verified factor". The path that
   * most needs to remove a factor is the recovery code, used by somebody
   * whose phone is gone, so the API can never serve it and the row is deleted
   * here instead.
   *
   * The web app ignored what unenroll answered and cleared the mirror anyway,
   * which left accounts holding a verified factor nobody could see. This is
   * the case that would have caught it.
   */
  const factorFor = async (userId: string) => {
    const rows = await owner()<{ id: string }[]>`
      select id from auth.mfa_factors where user_id = ${userId}`;
    return rows.length;
  };

  it("goes when two-step is turned off", async () => {
    await owner()`
      insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
      values (gen_random_uuid(), ${PERSON}, 'test', 'totp', 'verified', now(), now(), 'SECRET')`;
    expect(await factorFor(PERSON)).toBe(1);

    await markTwoStepOff(PERSON);
    expect(await factorFor(PERSON)).toBe(0);
  });

  it("leaves another person's alone", async () => {
    for (const who of [PERSON, OTHER]) {
      await owner()`
        insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
        values (gen_random_uuid(), ${who}, 'test', 'totp', 'verified', now(), now(), 'SECRET')`;
    }

    await markTwoStepOff(PERSON);
    expect(await factorFor(PERSON)).toBe(0);
    expect(await factorFor(OTHER)).toBe(1);

    await markTwoStepOff(OTHER);
  });
});

describe("the application role", () => {
  it("cannot reach the codes at all", async () => {
    const [row] = await owner()<{ ok: boolean }[]>`
      select has_table_privilege('hearth_app', 'public.account_recovery_codes', 'select')
             as ok`;
    expect(row!.ok).toBe(false);
  });

  it("is kept out by row-level security as well as by the grant", async () => {
    const [row] = await owner()<{ on: boolean }[]>`
      select relrowsecurity as "on" from pg_class
       where oid = 'public.account_recovery_codes'::regclass`;
    expect(row!.on).toBe(true);
  });

  it("has no policy that could let it back in", async () => {
    const rows = await owner()<{ policyname: string }[]>`
      select policyname from pg_policies
       where schemaname = 'public' and tablename = 'account_recovery_codes'`;
    expect(rows).toEqual([]);
  });
});
