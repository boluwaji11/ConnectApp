import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { owner } from "../client";

/**
 * R1.8, R21.4. Two-step verification, on the side Supabase does not hold.
 *
 * The factor itself lives in Supabase: enrolment, the QR code and the check of
 * a six-digit code are all theirs (PRD 13.9). Two things are ours.
 *
 * The first is a mirror. Every request that resolves a session has to know
 * whether this person is finished, and asking Supabase costs a round trip on
 * every navigation. `app_users.mfa_enrolled_at` is read in the same breath as
 * the memberships instead. It can drift from what Supabase holds, so nothing
 * refuses anybody on it alone.
 *
 * The second is recovery. Supabase has no recovery codes on the version this
 * runs against, and shipping enrolment without recovery means every lost phone
 * becomes a support request to the one person maintaining this.
 *
 * Both are read on the owner connection, before a tenant context exists, the
 * same way a membership is. The application role reaches neither.
 */

/** How many codes a person is given, and gets back on reissue. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * The alphabet a code is drawn from.
 *
 * No `0`, `1`, `l`, `o` or `i`: a recovery code is read off a screen and typed
 * back, sometimes off a photograph or a piece of paper weeks later, and those
 * five are the characters people get wrong.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Two groups of five, which reads back more reliably than ten in a row. */
function newCode(): string {
  const pick = () =>
    Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/**
 * A code as it is compared.
 *
 * Whatever separator somebody types, and whatever case, is the same code. The
 * hyphen is there to be read, not to be part of the secret.
 */
function normalise(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const hashOf = (code: string): string =>
  createHash("sha256").update(normalise(code)).digest("hex");

export interface TwoStepState {
  /** When they finished setting it up, or null for somebody who has not. */
  enrolledAt: Date | null;
  /** Recovery codes still unspent. Zero is worth saying on screen. */
  codesLeft: number;
}

/**
 * What a session needs to know about this person's second factor.
 *
 * One statement, and the count comes back as a count rather than as rows to
 * be counted here.
 */
export async function twoStepFor(userId: string): Promise<TwoStepState> {
  const rows = await owner()<{ enrolled_at: Date | null; codes_left: string }[]>`
    select
      u.mfa_enrolled_at as enrolled_at,
      (select count(*) from account_recovery_codes c
        where c.user_id = u.id and c.used_at is null)::text as codes_left
    from app_users u
   where u.id = ${userId}
   limit 1`;

  const found = rows[0];
  if (!found) return { enrolledAt: null, codesLeft: 0 };
  return { enrolledAt: found.enrolled_at, codesLeft: Number(found.codes_left) };
}

/** Called once Supabase has accepted the first code from their app. */
export async function markTwoStepOn(userId: string): Promise<void> {
  await owner()`
    update app_users set mfa_enrolled_at = now()
     where id = ${userId} and mfa_enrolled_at is null`;
}

/**
 * Called when the factor is removed, and whenever Supabase says there is no
 * factor to present.
 *
 * The codes go with it. A code that unlocks nothing is worse than no code: it
 * reads as a way in that is still good.
 */
export async function markTwoStepOff(userId: string): Promise<void> {
  await owner()`update app_users set mfa_enrolled_at = null where id = ${userId}`;
  await owner()`delete from account_recovery_codes where user_id = ${userId}`;
}

/**
 * A fresh set, replacing whatever was there.
 *
 * The plaintext is returned once, to be shown once. Only the hash is written,
 * so this table being read hands nobody a way in. Reissuing replaces rather
 * than accumulates, because a code from a set the person has thrown away
 * should stop working the moment they print the new one.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newCode);

  await owner().begin(async (tx) => {
    await tx`delete from account_recovery_codes where user_id = ${userId}`;
    for (const code of codes) {
      await tx`
        insert into account_recovery_codes (user_id, code_hash)
        values (${userId}, ${hashOf(code)})`;
    }
  });

  return codes;
}

/**
 * Spends a recovery code, or refuses.
 *
 * The hash is compared in constant time against every unspent code this person
 * holds, rather than looked up by equality, so the time taken says nothing
 * about how close a guess was. Ten rows is nothing to walk.
 *
 * The update names the row id and requires it to still be unspent, so two
 * requests racing on the same code cannot both be let in.
 */
export async function spendRecoveryCode(userId: string, code: string): Promise<boolean> {
  const given = normalise(code);
  if (given.length === 0) return false;

  const wanted = Buffer.from(hashOf(given), "utf8");

  const rows = await owner()<{ id: string; code_hash: string }[]>`
    select id, code_hash from account_recovery_codes
     where user_id = ${userId} and used_at is null`;

  let matched: string | null = null;
  for (const row of rows) {
    const held = Buffer.from(row.code_hash, "utf8");
    if (held.length === wanted.length && timingSafeEqual(held, wanted)) matched = row.id;
  }
  if (!matched) return false;

  const spent = await owner()<{ id: string }[]>`
    update account_recovery_codes set used_at = now()
     where id = ${matched} and used_at is null
     returning id`;

  return spent.length === 1;
}
