/**
 * HRT-437, R1.8. The one decision in two-step verification that is not
 * Supabase's: what to do when Supabase cannot be asked.
 *
 * This went in with `listFactors` collapsed to an empty array on error, and a
 * screen that read an empty array as "the factor is gone", cleared the mirror
 * and let the person through. A browser run caught it turning two-step off on
 * a real account because one request had failed. These cases are that bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const listFactors = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { mfa: { listFactors } } }),
}));

vi.mock("@connectapp/db", () => ({
  twoStepFor: vi.fn(),
  markTwoStepOn: vi.fn(),
  markTwoStepOff: vi.fn(),
  issueRecoveryCodes: vi.fn(),
  spendRecoveryCode: vi.fn(),
}));

/* `cache()` holds the answer for the life of a request, and each case here is
   a request of its own. */
vi.mock("react", async () => {
  const react = await vi.importActual<typeof import("react")>("react");
  return { ...react, cache: <T,>(fn: T) => fn };
});

const load = async () => import("@/lib/two-step");

beforeEach(() => {
  listFactors.mockReset();
  vi.resetModules();
});

describe("a factor list that could not be read", () => {
  it("is not an empty list", async () => {
    listFactors.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { factors } = await load();
    expect((await factors()).held).toBeNull();
  });

  it("answers 'unknown' rather than 'nothing to present'", async () => {
    listFactors.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { presentableFactor } = await load();
    expect(await presentableFactor()).toBe("unknown");
  });

  it("refuses a code with 'try again' rather than letting it through", async () => {
    listFactors.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { presentCode } = await load();
    expect(await presentCode("123456")).toEqual({ error: "twoStep.error.again" });
  });
});

describe("a factor list that was read", () => {
  it("names the verified factor, which is the one a challenge is made against", async () => {
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "f1", status: "verified" }] },
      error: null,
    });
    const { presentableFactor } = await load();
    expect(await presentableFactor()).toBe("f1");
  });

  it("never names an unverified one, so an abandoned enrolment cannot be presented", async () => {
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "f1", status: "unverified" }] },
      error: null,
    });
    const { presentableFactor } = await load();
    expect(await presentableFactor()).toBeNull();
  });

  it("says there is nothing when the list really is empty", async () => {
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    const { presentableFactor } = await load();
    expect(await presentableFactor()).toBeNull();
  });
});
