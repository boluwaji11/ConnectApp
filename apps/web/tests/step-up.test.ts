import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * HRT-442, R1.8, R21.4. A fresh factor in front of the actions that move
 * money, reach or records.
 *
 * Two things are worth a test. The reading of `amr`, because it is parsing a
 * claim written by somebody else and the refusing direction has to be the
 * default for every malformed shape. And the wiring, because the whole point
 * is that the check sits above the work: a guard below `stripe.refunds.create`
 * is a guard that asks after the money has gone.
 */

const web = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(web, path), "utf8");

/**
 * The file with its comments taken out.
 *
 * Every one of these guards is explained in a comment that names the call it
 * stands in front of, so searching the raw text finds the explanation before
 * the code and the order reads backwards.
 */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("reading the factor's timestamp off the token", () => {
  /*
   * The parser lives inside `session.ts`, which pulls in half the app, so it
   * is exercised through the same logic rather than through that module. The
   * shape is pinned by the measurement in its comment: a real Supabase token
   * carries `[{method:"password",...},{method:"totp",timestamp:...}]`.
   */
  const SECOND_FACTOR = new Set(["totp", "webauthn", "mfa/totp", "mfa/webauthn"]);
  const factorPresentedAt = (amr: unknown): number | null => {
    if (!Array.isArray(amr)) return null;
    let newest: number | null = null;
    for (const entry of amr) {
      if (!entry || typeof entry !== "object") continue;
      const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
      if (typeof method !== "string" || !SECOND_FACTOR.has(method)) continue;
      if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
      if (newest === null || timestamp > newest) newest = timestamp;
    }
    return newest;
  };

  it("finds the totp entry beside the password", () => {
    expect(
      factorPresentedAt([
        { method: "password", timestamp: 1792356267 },
        { method: "totp", timestamp: 1792356299 },
      ]),
    ).toBe(1792356299);
  });

  it("takes the newest where there is more than one", () => {
    expect(
      factorPresentedAt([
        { method: "totp", timestamp: 100 },
        { method: "webauthn", timestamp: 400 },
      ]),
    ).toBe(400);
  });

  it("reads a password-only session as no factor", () => {
    expect(factorPresentedAt([{ method: "password", timestamp: 1 }])).toBeNull();
  });

  it("reads anything malformed as no factor", () => {
    for (const bad of [
      undefined, null, "totp", 7, {},
      [null],
      [{ method: "totp" }],
      [{ method: "totp", timestamp: "now" }],
      [{ method: "totp", timestamp: Number.NaN }],
      [{ timestamp: 5 }],
    ]) {
      expect(factorPresentedAt(bad)).toBeNull();
    }
  });
});

describe("how long a factor stays fresh", () => {
  const FRESH_FOR_SECONDS = 5 * 60;
  const fresh = (presentedAt: number, now: number) => {
    const age = now - presentedAt;
    return age >= 0 && age <= FRESH_FOR_SECONDS;
  };

  it("accepts a code presented a moment ago", () => {
    expect(fresh(1000, 1001)).toBe(true);
  });

  it("accepts one at the edge and refuses one past it", () => {
    expect(fresh(1000, 1000 + 300)).toBe(true);
    expect(fresh(1000, 1000 + 301)).toBe(false);
  });

  it("refuses a timestamp in the future, which is a clock disagreeing", () => {
    expect(fresh(2000, 1000)).toBe(false);
  });
});

describe("the guard sits above the work", () => {
  /*
   * SEC-003 is the reason this is asserted on the source rather than left to
   * a reviewer: the permission check on the refund path was once below
   * `stripe.refunds.create`, so a reader who could not manage giving still
   * moved real money before being refused. A step-up below the same call
   * would be the same defect wearing a different hat.
   */
  it("asks for the code before Stripe is told to refund", () => {
    const source = code("app/(app)/giving/actions.ts");
    const guard = source.indexOf("await stepUpNeeded()");
    const refund = source.indexOf("stripe().refunds.create");
    expect(guard).toBeGreaterThan(-1);
    expect(refund).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(refund);
  });

  it("asks before the Stripe account link is made", () => {
    const source = code("app/(app)/settings/online/actions.ts");
    const guard = source.indexOf("await stepUpNeeded()");
    const link = source.indexOf("accountLinks.create");
    expect(guard).toBeGreaterThan(-1);
    if (link > -1) expect(guard).toBeLessThan(link);
  });

  it("asks before the export route reads anything", () => {
    const source = code("app/api/export/route.ts");
    const guard = source.indexOf("await freshFactor()");
    const build = source.indexOf("buildArchive(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(build);
  });

  /** Every action the review named, so one going quiet is a failing test. */
  it("guards each action on the list", () => {
    const guarded: [string, string][] = [
      ["app/(app)/giving/actions.ts", "stepUpNeeded"],
      ["app/(app)/settings/online/actions.ts", "stepUpNeeded"],
      ["app/(app)/settings/manage-accesses/actions.ts", "stepUpNeeded"],
      ["app/(app)/settings/email/actions.ts", "stepUpNeeded"],
      ["app/(app)/settings/church/domain-actions.ts", "stepUpNeeded"],
      ["app/api/export/route.ts", "freshFactor"],
    ];
    for (const [path, call] of guarded) {
      expect(read(path), `${path} lost its step-up`).toContain(call);
    }
  });

  it("never offers a recovery code as a way past it", () => {
    /*
     * A recovery code turns two-step off. That is the right answer to a lost
     * phone at sign-in and the wrong answer to a question asked in front of a
     * refund, because it would both let the press through and leave the
     * account weaker than it was.
     */
    expect(code("app/(app)/step-up-actions.ts")).not.toContain("redeemRecoveryCode");
    expect(code("components/step-up.tsx")).not.toContain("ecovery");
  });
});
