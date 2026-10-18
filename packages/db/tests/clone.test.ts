/**
 * HRT-416. Copying a church, and proving nothing was left behind (R19.7).
 *
 * The copy is what makes a demo open instantly: the seed is built once by the
 * loader, slowly and through the real repo functions, and a visitor gets a
 * copy of it. The danger is a copy that quietly misses a table, because a
 * visitor would be shown a church with no groups in it and nothing anywhere
 * would say so.
 *
 * So the test is not "does it copy groups". It is "does every table that holds
 * anything hold the same count afterwards", worked out from the catalogue, so
 * a table added next year is checked without this file being edited.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { owner, closeConnections } from "../src/client";
import { cloneTenant, cloneCoverage } from "../src/demo/clone";
import { withAuditTriggersOff } from "../src/maintenance";
import { testTenant, dropTenants } from "./helpers/tenant";
import { createPerson } from "../src/repo/members";
import { withTenant } from "../src/client";
import { writeFund } from "../src/repo/funds";
import { recordGift, openBatch } from "../src/repo/giving";

let source: string;
const copies: string[] = [];
const SLUG = "clonesrc";

/** What one church holds, table by table, counting only what is not empty. */
async function held(tenantId: string): Promise<Map<string, number>> {
  const { tables } = await cloneCoverage();
  const counts = new Map<string, number>();
  for (const table of tables) {
    const [row] = await owner().unsafe<{ n: number }[]>(
      `select count(*)::int as n from "${table}" where tenant_id = $1`,
      [tenantId],
    );
    if ((row?.n ?? 0) > 0) counts.set(table, row!.n);
  }
  return counts;
}

beforeAll(async () => {
  source = await testTenant(SLUG, "Clone Source");

  /* Enough shape to be worth copying: people in households, a fund, a counted
     batch and gifts against it. Four tables deep, with keys between them,
     which is what a copy gets wrong when it gets anything wrong. */
  const as = { tenantId: source, role: "owner" as const };
  await withTenant(as, async (tx) => {
    for (const [first, last] of [["Ada", "Hale"], ["Ben", "Hale"], ["Cara", "Ngo"]]) {
      await createPerson(tx, as, { firstName: first!, lastName: last!, lifecycleStatus: "member" });
    }
    const fund = await writeFund(tx, as, { name: "Clone Fund" });
    const batch = await openBatch(tx, as, { name: "Clone count", receivedOn: "2030-01-05" });
    await recordGift(tx, as, {
      fundId: fund.id, batchId: batch.id, amountCents: 2_500,
      method: "cash", receivedOn: "2030-01-05",
    });
  });
});

afterAll(async () => {
  await withAuditTriggersOff(async (sql) => {
    for (const id of copies) await sql`delete from tenants where id = ${id}`;
  });
  await dropTenants(SLUG);
  await closeConnections();
});

describe("copying a church", () => {
  it("covers every table that carries a tenant_id, bar the ones it names", async () => {
    const { tables, skipped } = await cloneCoverage();
    const all = await owner()<{ table_name: string }[]>`
      select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'tenant_id'`;

    const names = new Set(all.map((r) => r.table_name));
    for (const table of tables) expect(names.has(table)).toBe(true);
    /* Every scoped table is either copied or named as left behind. Nothing
       falls between the two, which is the failure this is here to catch. */
    for (const name of names) {
      expect(
        tables.includes(name) || skipped.includes(name),
        `${name} carries a tenant_id and the copy neither takes it nor names it`,
      ).toBe(true);
    }
  });

  it("gives the copy the same rows as the church it came from", async () => {
    const before = await held(source);
    expect(before.size).toBeGreaterThan(3);

    const copy = await cloneTenant(source, { slug: `${SLUG}-copy`, name: "Clone Copy" });
    copies.push(copy);
    const after = await held(copy);

    for (const [table, count] of before) {
      expect(after.get(table) ?? 0, `${table} came across short`).toBe(count);
    }
    for (const [table, count] of after) {
      expect(before.get(table) ?? 0, `${table} gained rows that were not there`).toBe(count);
    }
  });

  it("rewrites the keys, so the copy points at itself and never at the original", async () => {
    const copy = await cloneTenant(source, { slug: `${SLUG}-keys`, name: "Clone Keys" });
    copies.push(copy);

    /* A gift in the copy names a fund and a batch. Both have to be the copy's
       own, because a gift pointing at the template's fund is a gift in one
       church counted against another's total. */
    const [gift] = await owner()<{ fund_id: string; batch_id: string }[]>`
      select fund_id, batch_id from gifts where tenant_id = ${copy}`;
    expect(gift).toBeTruthy();

    const [fund] = await owner()<{ tenant_id: string }[]>`
      select tenant_id from funds where id = ${gift!.fund_id}`;
    const [batch] = await owner()<{ tenant_id: string }[]>`
      select tenant_id from gift_batches where id = ${gift!.batch_id}`;

    expect(fund!.tenant_id).toBe(copy);
    expect(batch!.tenant_id).toBe(copy);
  });

  it("leaves the church it copied exactly as it was", async () => {
    const before = await held(source);
    const copy = await cloneTenant(source, { slug: `${SLUG}-again`, name: "Clone Again" });
    copies.push(copy);
    const after = await held(source);

    for (const [table, count] of before) {
      expect(after.get(table) ?? 0, `${table} changed in the original`).toBe(count);
    }
  });

  it("refuses a church that does not exist rather than making an empty one", async () => {
    await expect(
      cloneTenant("00000000-0000-0000-0000-000000000000", { slug: "nope", name: "Nope" }),
    ).rejects.toThrow();
  });
});
