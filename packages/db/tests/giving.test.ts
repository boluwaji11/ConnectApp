/**
 * HRT-237, HRT-238. Funds, and the counting session (R13.9 to R13.15).
 *
 * The control that matters is the batch: two counters, a declared total, and no
 * close while the entered total differs unless somebody writes down why.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant, closeConnections, type Tx } from "../src/client";
import { listFunds, writeFund, setFundArchived, fundTotals } from "../src/repo/funds";
import {
  openBatch, updateBatch, closeBatch, reopenBatch, listBatches, recordGift, removeGift,
  listGifts, givingTotals,
} from "../src/repo/giving";
import { createPerson } from "../src/repo/members";
import {
  saveStripeAccount, getStripeAccount, markNonprofitRate, recordOnlineGift, recordRefund,
} from "../src/repo/stripe-accounts";
import { InvalidInputError } from "../src/errors";
import { PermissionError } from "../src/roles";
import type { TenantRole } from "../src/roles";
import { testTenant, dropTenants } from "./helpers/tenant";

let tenant: string;
let general: string;
let building: string;
/** R13.11. Two people count the bag. */
let countOne: string;
let countTwo: string;
const SLUG = "givingtest";

const as = (role: TenantRole = "owner") => ({ tenantId: tenant, role });
const run = <T>(work: (tx: Tx) => Promise<T>, role: TenantRole = "owner") =>
  withTenant({ tenantId: tenant, role }, work);

beforeAll(async () => {
  tenant = await testTenant(SLUG, "Giving Test Church");
  general = (await run((tx) => writeFund(tx, as(), { name: "General", code: "gen" }))).id;
  building = (await run((tx) =>
    writeFund(tx, as(), { name: "Building", code: "bld", restricted: true }),
  )).id;

  countOne = (await run((tx) =>
    createPerson(tx, as(), { firstName: "Grace", lastName: "Givingtest" } as never),
  )).id;
  countTwo = (await run((tx) =>
    createPerson(tx, as(), { firstName: "Harold", lastName: "Givingtest" } as never),
  )).id;
});

afterAll(async () => {
  await dropTenants(SLUG);
  await closeConnections();
});

describe("funds", () => {
  it("keeps the church's funds, with restricted ones marked", async () => {
    const list = await run((tx) => listFunds(tx));
    expect(list.map((one) => one.name)).toEqual(["General", "Building"]);
    expect(list.find((one) => one.name === "Building")!.restricted).toBe(true);
    expect(list.find((one) => one.name === "General")!.code).toBe("GEN");
  });

  it("refuses a blank name and a name already used", async () => {
    await expect(run((tx) => writeFund(tx, as(), { name: " " })))
      .rejects.toBeInstanceOf(InvalidInputError);
    await expect(run((tx) => writeFund(tx, as(), { name: "General" })))
      .rejects.toBeInstanceOf(InvalidInputError);
  });

  it("is refused to somebody who does not run the giving", async () => {
    await expect(run((tx) => writeFund(tx, as("staff"), { name: "Nope" }), "staff"))
      .rejects.toBeInstanceOf(PermissionError);
  });
});

describe("a counting session", () => {
  let batch: string;

  it("opens with a name in its address", async () => {
    batch = (await run((tx) =>
      openBatch(tx, as(), { name: "Morning count", receivedOn: "2030-10-06" }),
    )).id;

    const [row] = await run((tx) => listBatches(tx));
    expect(row!.slug).toBe("morning-count-2030-10-06");
    expect(row!.enteredCents).toBe(0);
    expect(row!.closed).toBe(false);
  });

  it("takes the lines, and counts what has been entered", async () => {
    await run((tx) =>
      recordGift(tx, as(), {
        fundId: general, batchId: batch, amountCents: 10_000,
        method: "cash", receivedOn: "2030-10-06",
      }),
    );
    await run((tx) =>
      recordGift(tx, as(), {
        fundId: building, batchId: batch, amountCents: 4_000,
        method: "cheque", reference: "1041", receivedOn: "2030-10-06",
      }),
    );

    const [row] = await run((tx) => listBatches(tx));
    expect(row!.enteredCents).toBe(14_000);
    expect(row!.lines).toBe(2);
  });

  it("names two counters, which is the control an auditor asks about", async () => {
    await run((tx) =>
      updateBatch(tx, as(), batch, { counterOneId: countOne, counterTwoId: countTwo }),
    );

    const [row] = await run((tx) => listBatches(tx));
    expect(row!.counterOneId).toBe(countOne);
    expect(row!.counterTwoId).toBe(countTwo);
  });

  it("closes when the church says it has finished, and stops taking lines", async () => {
    await run((tx) =>
      recordGift(tx, as(), {
        fundId: general, batchId: batch, amountCents: 1_000,
        method: "cash", receivedOn: "2030-10-06",
      }),
    );
    await run((tx) => closeBatch(tx, as(), batch));

    const [row] = await run((tx) => listBatches(tx));
    expect(row!.closed).toBe(true);
    expect(row!.enteredCents).toBe(15_000);

    // A closed session is the record of a deposit, so it takes no more.
    await expect(
      run((tx) =>
        recordGift(tx, as(), {
          fundId: general, batchId: batch, amountCents: 500,
          method: "cash", receivedOn: "2030-10-06",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("counts the totals, and keeps a closed count from taking more", async () => {
    const totals = await run((tx) => givingTotals(tx, { from: "2030-01-01", to: "2030-12-31" }));
    expect(totals.cents).toBe(15_000);
    expect(totals.gifts).toBe(3);

    const byFund = await run((tx) => fundTotals(tx, { from: "2030-01-01", to: "2030-12-31" }));
    expect(byFund[general]!.cents).toBe(11_000);
    expect(byFund[building]!.cents).toBe(4_000);
  });

  it("reads the lines back with the fund and the giver", async () => {
    const lines = await run((tx) => listGifts(tx, as(), { batchId: batch }));
    expect(lines).toHaveLength(3);
    expect(lines.map((one) => one.fundName)).toContain("Building");
    expect(lines.every((one) => one.memberName === null)).toBe(true);
  });

  it("hides the amounts from somebody without the permission", async () => {
    const lines = await run((tx) => listGifts(tx, as("staff"), { batchId: batch }), "staff");
    expect(lines.every((one) => one.amountCents === 0)).toBe(true);
  });

  it("takes a line back off while the count is open", async () => {
    await run((tx) => reopenBatch(tx, as(), batch));
    const lines = await run((tx) => listGifts(tx, as(), { batchId: batch }));
    await run((tx) => removeGift(tx, as(), lines[0]!.id));
    expect(await run((tx) => listGifts(tx, as(), { batchId: batch }))).toHaveLength(2);
  });

  it("gives a second session of the same name a number of its own", async () => {
    const again = await run((tx) =>
      openBatch(tx, as(), { name: "Morning count", receivedOn: "2030-10-06" }),
    );
    expect(again.slug).toBe("morning-count-2030-10-06-2");
  });

  it("refuses a gift to an archived fund", async () => {
    const spare = (await run((tx) => writeFund(tx, as(), { name: "Mission" }))).id;
    await run((tx) => setFundArchived(tx, as(), spare, true));
    await expect(
      run((tx) =>
        recordGift(tx, as(), {
          fundId: spare, amountCents: 500, method: "cash", receivedOn: "2030-10-06",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("takes a gift in kind with no amount and a description", async () => {
    await expect(
      run((tx) =>
        recordGift(tx, as(), {
          fundId: general, amountCents: 0, method: "in_kind", receivedOn: "2030-10-06",
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidInputError);

    const { id } = await run((tx) =>
      recordGift(tx, as(), {
        fundId: general, amountCents: 0, method: "in_kind",
        inKindDescription: "A piano", receivedOn: "2030-10-06",
      }),
    );
    expect(id).toBeTruthy();

    // R13.13. It stays out of the cash totals: 10,000 and 4,000 are still
    // there, and the piano adds nothing.
    const totals = await run((tx) => givingTotals(tx, { from: "2030-01-01", to: "2030-12-31" }));
    expect(totals.cents).toBe(14_000);
  });
});

/**
 * HRT-386, R13.5. Which rate Stripe charges this church.
 *
 * Stripe grants the nonprofit rate by email and reports it through no API, so
 * the church is the only one who can say. It decides what a giver offering to
 * cover the processing fee is charged, which is why it is a record rather than
 * a guess.
 */
describe("the nonprofit rate", () => {
  const account = {
    accountId: `acct_rate_${SLUG}`,
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    livemode: true,
  };

  it("starts unset, because every account pays the full rate until it asks", async () => {
    await run((tx) => saveStripeAccount(tx, as(), account));
    const held = await run((tx) => getStripeAccount(tx));
    expect(held?.nonprofitRateAt).toBeNull();
  });

  it("is written down with the day it was granted, and taken back off", async () => {
    await run((tx) => markNonprofitRate(tx, as(), true));
    const granted = await run((tx) => getStripeAccount(tx));
    expect(granted?.nonprofitRateAt).toBeInstanceOf(Date);

    await run((tx) => markNonprofitRate(tx, as(), false));
    expect((await run((tx) => getStripeAccount(tx)))?.nonprofitRateAt).toBeNull();
  });

  it("survives Stripe telling us something new about the account", async () => {
    await run((tx) => markNonprofitRate(tx, as(), true));
    /* What the webhook and the refresh press write: everything Stripe knows,
       which is everything except the rate, because Stripe does not know it. */
    await run((tx) => saveStripeAccount(tx, as(), { ...account, payoutsEnabled: false }));

    const held = await run((tx) => getStripeAccount(tx));
    expect(held?.payoutsEnabled).toBe(false);
    expect(held?.nonprofitRateAt).toBeInstanceOf(Date);
  });

  it("is refused to a role that cannot manage giving", async () => {
    await expect(
      withTenant({ tenantId: tenant, role: "member" }, (tx) =>
        markNonprofitRate(tx, { tenantId: tenant, role: "member" }, true),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

/**
 * HRT-414, R13.15. A refund reaches the gift wherever it was made.
 *
 * A treasurer with a Stripe login refunds in Stripe's dashboard, and the
 * product never heard about it: the gift read as given in full and the
 * year-end statement, which is built from these rows, overstated it.
 */
describe("a refund against an online gift", () => {
  const ACCOUNT = `acct_refund_${SLUG}`;
  const INTENT = "pi_refundtest";
  const CHARGE = "ch_refundtest";
  let giftId: string;

  /** What the gift says now, read back the way a screen reads it. */
  const giftNow = async () => {
    const rows = await run((tx) => listGifts(tx, as(), { limit: 100, offset: 0 }));
    return rows.find((one) => one.id === giftId)!;
  };

  beforeAll(async () => {
    await run((tx) =>
      saveStripeAccount(tx, as(), {
        accountId: ACCOUNT,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        livemode: false,
      }),
    );
    await recordOnlineGift({
      accountId: ACCOUNT,
      paymentIntentId: INTENT,
      chargeId: CHARGE,
      amountCents: 20_000,
      feeCents: 600,
      currency: "usd",
      receivedOn: "2030-10-06",
      method: "card",
      fundId: general,
      split: [],
      coveredFee: false,
      giverName: "Refund Test",
      giverEmail: "refund@example.org",
      recurring: false,
      subscriptionId: null,
    });
    const rows = await run((tx) => listGifts(tx, as(), { limit: 100, offset: 0 }));
    giftId = rows.find((one) => one.amountCents === 20_000 && one.feeCents === 600)!.id;
  });

  it("records a refund the product never issued", async () => {
    expect((await giftNow()).refundedCents).toBe(0);

    /* What Stripe reports after somebody refunds part of it in the dashboard:
       the charge's own total, not a delta. */
    await recordRefund({
      accountId: ACCOUNT, refundId: "re_one", chargeId: CHARGE,
      paymentIntentId: INTENT, refundedCents: 2_000, status: "settled",
    });

    const after = await giftNow();
    expect(after.refundedCents).toBe(2_000);
    expect(after.refundStatus).toBe("settled");
  });

  it("does not subtract twice when Stripe says the same thing again", async () => {
    /* Stripe announces one refund as four event types and redelivers each
       whenever it is unsure one landed. Adding a delta per delivery would
       refund this gift eight times over. */
    for (let again = 0; again < 4; again += 1) {
      await recordRefund({
        accountId: ACCOUNT, refundId: "re_one", chargeId: CHARGE,
        paymentIntentId: INTENT, refundedCents: 2_000, status: "settled",
      });
    }
    expect((await giftNow()).refundedCents).toBe(2_000);
  });

  it("follows a second refund, and one the bank later refused", async () => {
    await recordRefund({
      accountId: ACCOUNT, refundId: "re_two", chargeId: CHARGE,
      paymentIntentId: INTENT, refundedCents: 5_000, status: "settled",
    });
    expect((await giftNow()).refundedCents).toBe(5_000);

    /* A refund the bank refused takes the total back down, which is the same
       path because the figure is Stripe's rather than one added up here. */
    await recordRefund({
      accountId: ACCOUNT, refundId: "re_two", chargeId: CHARGE,
      paymentIntentId: INTENT, refundedCents: 2_000, status: "settled",
    });
    expect((await giftNow()).refundedCents).toBe(2_000);
  });

  it("never refunds a gift for more than it was", async () => {
    await recordRefund({
      accountId: ACCOUNT, refundId: "re_three", chargeId: CHARGE,
      paymentIntentId: INTENT, refundedCents: 999_999, status: "settled",
    });
    expect((await giftNow()).refundedCents).toBe(20_000);
  });

  it("leaves a gift on another church's account alone", async () => {
    await recordRefund({
      accountId: "acct_belongs_to_nobody",
      refundId: "re_four", chargeId: CHARGE, paymentIntentId: INTENT,
      refundedCents: 0, status: "settled",
    });
    expect((await giftNow()).refundedCents).toBe(20_000);
  });
});
