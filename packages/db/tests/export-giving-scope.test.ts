/**
 * SEC-007. A role kept out of the amounts is kept out of them in the file too.
 *
 * The complete export is the trust mechanism: a church can take everything and
 * leave. It is gated on `members.archive`, which an Admin holds. `giving.amounts`
 * is a separate permission that an Admin does not hold, and the product refuses
 * an Admin every amount on the giving screen, in the reports, on a statement
 * and in the giving CSV. The archive never asked. So the one role the product
 * deliberately keeps out of the ledger could download all of it as `gifts.csv`.
 *
 * Written against a church of its own rather than the seeded fixtures, because
 * the assertion that matters is the positive one: a test where both roles get
 * an empty table passes while proving nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant, closeConnections, type Tx } from "../src/client";
import { buildArchive } from "../src/export/archive";
import { writeFund } from "../src/repo/funds";
import { recordGift, openBatch } from "../src/repo/giving";
import { testTenant, dropTenants } from "./helpers/tenant";
import type { TenantRole } from "../src/roles";

const SLUG = "exportgiving";
const NAME = "Export Giving Church";
let tenantId: string;

const archiveFor = (role: TenantRole) =>
  withTenant({ tenantId, role }, (tx: Tx) =>
    buildArchive(tx, { tenantId, role }, { name: NAME, slug: SLUG }),
  );

const GIVING = ["gifts", "gift_batches", "recurring_gifts", "pledges", "campaigns"] as const;

beforeAll(async () => {
  tenantId = await testTenant(SLUG, NAME);

  const as = { tenantId, role: "owner" as const };
  await withTenant(as, async (tx) => {
    const fund = await writeFund(tx, as, { name: "General" });
    const batch = await openBatch(tx, as, { name: "Count", receivedOn: "2030-02-02" });
    await recordGift(tx, as, {
      fundId: fund.id,
      batchId: batch.id,
      amountCents: 12_345,
      method: "cash",
      receivedOn: "2030-02-02",
    });
  });
});

afterAll(async () => {
  await dropTenants(SLUG);
  await closeConnections();
});

describe("the giving ledger in a complete export", () => {
  it("reaches a role that may read amounts", async () => {
    const archive = await archiveFor("owner");
    const gifts = archive.data["gifts"] ?? [];
    expect(gifts.length, "the fixture wrote no gift, so this proves nothing").toBe(1);
    expect(gifts[0]!["amount_cents"]).toBe(12_345);
    expect(archive.meta.withheld).not.toContain("gifts.*");
  });

  it("does not reach a role that may not, and the file says so", async () => {
    const archive = await archiveFor("admin");

    for (const table of GIVING) {
      expect(archive.data[table], `${table} was handed over`).toEqual([]);
      expect(archive.meta.withheld, `${table} went unmentioned`).toContain(`${table}.*`);
    }

    /* The header survives, so the file reads as empty rather than as corrupt,
       and no amount is anywhere in it. */
    expect(archive.csv["gifts"]).toContain("amount_cents");
    expect(archive.csv["gifts"]).not.toContain("12345");
  });

  it("keeps the rest of the export intact for that role", async () => {
    const archive = await archiveFor("admin");
    expect(archive.data["members"]).toBeDefined();
    expect(archive.data["tenants"]?.length ?? 0).toBeGreaterThan(0);
  });
});
