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
const unenroll = vi.fn<(p: { factorId: string }) => Promise<{ error: { message: string } | null }>>();

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({ auth: { mfa: { listFactors, unenroll } } }),
}));

const markTwoStepOff = vi.fn();
const spendRecoveryCode = vi.fn();

vi.mock("@connectapp/db", () => ({
  twoStepFor: vi.fn(),
  markTwoStepOn: vi.fn(),
  markTwoStepOff,
  issueRecoveryCodes: vi.fn(async () => []),
  spendRecoveryCode,
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
  unenroll.mockReset();
  unenroll.mockResolvedValue({ error: null });
  markTwoStepOff.mockReset();
  spendRecoveryCode.mockReset();
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
  /*
   * `data.all` is the whole list. The per-kind arrays hold only the verified
   * factors, so reading `data.totp` made an abandoned enrolment invisible:
   * nothing could clear it, they accumulated on real accounts, and Supabase
   * refuses enrolment once a user reaches its limit. These cases read the
   * shape the API actually returns.
   */
  it("names the verified factor, which is the one a challenge is made against", async () => {
    listFactors.mockResolvedValue({
      data: {
        all: [{ id: "f1", status: "verified", factor_type: "totp" }],
        totp: [{ id: "f1", status: "verified" }],
      },
      error: null,
    });
    const { presentableFactor } = await load();
    expect(await presentableFactor()).toBe("f1");
  });

  it("never names an unverified one, so an abandoned enrolment cannot be presented", async () => {
    listFactors.mockResolvedValue({
      data: { all: [{ id: "f1", status: "unverified", factor_type: "totp" }], totp: [] },
      error: null,
    });
    const { presentableFactor } = await load();
    expect(await presentableFactor()).toBeNull();
  });

  it("still sees an abandoned enrolment, which is what lets it be cleared", async () => {
    listFactors.mockResolvedValue({
      data: { all: [{ id: "f1", status: "unverified", factor_type: "totp" }], totp: [] },
      error: null,
    });
    const { factors } = await load();
    expect((await factors()).held).toEqual([{ id: "f1", kind: "totp", verified: false }]);
  });

  it("does not read an empty per-kind array as an empty account", async () => {
    listFactors.mockResolvedValue({
      data: {
        all: [
          { id: "a", status: "unverified", factor_type: "totp" },
          { id: "b", status: "unverified", factor_type: "totp" },
        ],
        totp: [],
      },
      error: null,
    });
    const { factors } = await load();
    expect((await factors()).held).toHaveLength(2);
  });

  it("names a passkey as well as an app", async () => {
    listFactors.mockResolvedValue({
      data: { all: [{ id: "p1", status: "verified", factor_type: "webauthn" }], totp: [] },
      error: null,
    });
    const { presentable } = await load();
    expect(await presentable()).toEqual({ known: true, totp: null, passkey: "p1" });
  });

  it("says there is nothing when the list really is empty", async () => {
    listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
    const { presentableFactor } = await load();
    expect(await presentableFactor()).toBeNull();
  });
});

describe("turning two-step off is all or nothing", () => {
  /*
   * This cleared the mirror whatever happened. `held ?? []` is an empty loop
   * when the list could not be read, so a failed call turned two-step off in
   * our column and left a verified factor in Supabase: the screen said Off and
   * the account was still protected by something nobody could see. It is the
   * same mistake as reading an unreadable list as an empty one, on the writing
   * side, and it put a real development account into that state.
   */
  it("does not clear the mirror when the factors could not be read", async () => {
    listFactors.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { turnOffEverything } = await load();

    expect(await turnOffEverything("u1")).toEqual({ error: "twoStep.error.again" });
    expect(markTwoStepOff).not.toHaveBeenCalled();
  });

  it("does not clear the mirror when a factor refuses to come off", async () => {
    listFactors.mockResolvedValue({
      data: { all: [{ id: "f1", status: "verified", factor_type: "totp" }], totp: [] },
      error: null,
    });
    unenroll.mockResolvedValue({ error: { message: "nope" } });
    const { turnOffEverything } = await load();

    expect(await turnOffEverything("u1")).toEqual({ error: "twoStep.error.again" });
    expect(markTwoStepOff).not.toHaveBeenCalled();
  });

  it("clears the mirror once every factor is off", async () => {
    listFactors.mockResolvedValue({
      data: {
        all: [
          { id: "f1", status: "verified", factor_type: "totp" },
          { id: "f2", status: "verified", factor_type: "webauthn" },
        ],
        totp: [],
      },
      error: null,
    });
    const { turnOffEverything } = await load();

    expect(await turnOffEverything("u1")).toEqual({});
    expect(unenroll).toHaveBeenCalledTimes(2);
    expect(markTwoStepOff).toHaveBeenCalledWith("u1");
  });

  it("spends a recovery code and reports a turn-off that failed", async () => {
    spendRecoveryCode.mockResolvedValue(true);
    listFactors.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const { redeemRecoveryCode } = await load();

    expect(await redeemRecoveryCode("u1", "abcde-fghij"))
      .toEqual({ error: "twoStep.error.again" });
    expect(markTwoStepOff).not.toHaveBeenCalled();
  });

  it("refuses a recovery code that is not theirs without touching the factor", async () => {
    spendRecoveryCode.mockResolvedValue(false);
    const { redeemRecoveryCode } = await load();

    expect(await redeemRecoveryCode("u1", "nope"))
      .toEqual({ error: "twoStep.error.recovery" });
    expect(unenroll).not.toHaveBeenCalled();
    expect(markTwoStepOff).not.toHaveBeenCalled();
  });
});
