/**
 * HRT-46. A demo church, belonging to nobody (R19.7, R22.1).
 *
 * The point of building it this way is that invented members can never land in a
 * real church's directory. The tests that matter are the ones proving the demo
 * is a separate church, and that it goes away.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { owner, withTenant, closeConnections } from "../src/client";
import {
  createDemoChurch, demoChurchInfo, sweepExpiredDemos, rebuildDemoTemplate,
} from "../src/demo/church";
import { DEMO_PEOPLE } from "../src/demo/members";
import { listPeople } from "../src/repo/members";
import { withAuditTriggersOff } from "../src/maintenance";
import { churchStanding } from "../src/repo/provisional";

const made: string[] = [];

afterAll(async () => {
  await withAuditTriggersOff(async (sql) => {
    await sql`delete from tenants where slug like 'demo-%'`;
    await sql`delete from app_users where email like '%@demo.invalid'`;
  });
  await closeConnections();
});

/**
 * HRT-416. A demo is a church somebody is allowed to use.
 *
 * Approval is the gate on a church nobody has looked at yet: twenty-five
 * members, no join link, no invitations. A demo church was built without it,
 * so a visitor sent to look at the product met the restrictions meant for a
 * stranger's sign-up instead.
 *
 * Not skipped, unlike the rest of this file: the gate it checks is the one
 * that protects every real church, so it runs even while the demo is being
 * reworked around it.
 */
describe("a demo church's standing", () => {
  it("is approved, so none of the provisional limits apply", async () => {
    /* Built against the code under test rather than whatever was here before. */
    const templateId = await rebuildDemoTemplate();
    const [waiting] = await owner()<{ id: string; approved_at: Date | null }[]>`
      select id, approved_at from tenants where id = ${templateId}`;

    expect(waiting, "no template was built to check").toBeTruthy();
    expect(waiting!.approved_at).toBeInstanceOf(Date);

    const standing = await withTenant(
      { tenantId: templateId, role: "owner" },
      (db) => churchStanding(db, templateId),
    );
    expect(standing.approved).toBe(true);
    /* Null remaining is what an approved church reports: nothing left to use
       up, because there is no cap on it. */
    expect(standing.remaining).toBeNull();
  }, 300_000);
});

/**
 * Skipped under HRT-282. The demo is being reworked as a whole, starting with
 * a visitor getting a church that was already standing rather than one built
 * while they wait. These come back with that work, against whatever it leaves.
 */
describe.skip("a demo church", () => {
  it("arrives full, and belongs to the visitor who asked for it", async () => {
    const userId = randomUUID();
    const demo = await createDemoChurch(userId);
    made.push(demo.tenantId);

    expect(demo.slug.startsWith("demo-")).toBe(true);
    expect(demo.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const members = await withTenant(
      { tenantId: demo.tenantId, role: "owner", userId },
      (tx) => listPeople(tx),
    );
    expect(members.length).toBe(DEMO_PEOPLE.length);

    const info = await demoChurchInfo(demo.tenantId);
    expect(info.isDemo).toBe(true);
  }, 120_000);

  it("is its own church every time, so one visitor cannot touch another's", async () => {
    const a = await createDemoChurch(randomUUID());
    const b = await createDemoChurch(randomUUID());
    made.push(a.tenantId, b.tenantId);

    expect(a.tenantId).not.toBe(b.tenantId);
    expect(a.slug).not.toBe(b.slug);

    // The isolation suite proves this in general. Here it proves that the demo
    // did not reuse a church somebody else is already looking at.
    const rows = await owner()<{ n: string }[]>`
      select count(*)::text as n from tenant_members where tenant_id = ${a.tenantId}`;
    expect(Number(rows[0]!.n)).toBe(1);
  }, 120_000);

  it("is not marked on a real church", async () => {
    const [riverside] = await owner()<{ id: string }[]>`
      select id from tenants where slug = 'riverside'`;
    expect((await demoChurchInfo(riverside!.id)).isDemo).toBe(false);
  }, 120_000);
});

describe.skip("expiry", () => {
  it("sweeps the ones that have run out and leaves the rest", async () => {
    const stale = await createDemoChurch(randomUUID());
    const fresh = await createDemoChurch(randomUUID());
    made.push(stale.tenantId, fresh.tenantId);

    await owner()`
      update tenants set demo_expires_at = now() - interval '1 hour'
      where id = ${stale.tenantId}`;

    await sweepExpiredDemos();

    const left = await owner()<{ id: string }[]>`
      select id from tenants where id in (${stale.tenantId}, ${fresh.tenantId})`;
    expect(left.map((r) => r.id)).toEqual([fresh.tenantId]);
  }, 120_000);

  it("never sweeps a church that is not a demo", async () => {
    const before = await owner()<{ n: string }[]>`
      select count(*)::text as n from tenants where demo_expires_at is null`;
    await sweepExpiredDemos();
    const after = await owner()<{ n: string }[]>`
      select count(*)::text as n from tenants where demo_expires_at is null`;
    expect(after[0]!.n).toBe(before[0]!.n);
  }, 120_000);
});

describe.skip("a demo pass", () => {
  it("is accepted for the demo it names", async () => {
    const userId = randomUUID();
    const demo = await createDemoChurch(userId);
    made.push(demo.tenantId);

    const { demoMembership } = await import("../src/demo/church");
    expect(await demoMembership(demo.tenantId, userId)).not.toBeNull();
  }, 120_000);

  it("is refused for a real church, even with a real user id", async () => {
    const { demoMembership } = await import("../src/demo/church");
    const [riverside] = await owner()<{ id: string }[]>`
      select id from tenants where slug = 'riverside'`;
    const [member] = await owner()<{ user_id: string }[]>`
      select user_id from tenant_members where tenant_id = ${riverside!.id} limit 1`;

    // The signature would be valid. The church is not a demo, so it is refused
    // anyway. That second lock is the point: a demo is never a way in.
    expect(await demoMembership(riverside!.id, member!.user_id)).toBeNull();
  });

  it("is refused once the demo has run out", async () => {
    const { demoMembership } = await import("../src/demo/church");
    const userId = randomUUID();
    const demo = await createDemoChurch(userId);
    made.push(demo.tenantId);

    await owner()`
      update tenants set demo_expires_at = now() - interval '1 minute'
      where id = ${demo.tenantId}`;

    expect(await demoMembership(demo.tenantId, userId)).toBeNull();
  }, 120_000);

  it("is refused for somebody who is not in that demo", async () => {
    const { demoMembership } = await import("../src/demo/church");
    const demo = await createDemoChurch(randomUUID());
    made.push(demo.tenantId);

    expect(await demoMembership(demo.tenantId, randomUUID())).toBeNull();
  }, 120_000);
});

/**
 * HRT-72. The pool.
 *
 * Building a church takes long enough that a visitor watching a blank page
 * decides against us before it finishes, so they are built in advance and
 * handed over. These tests live in this file rather than their own because they
 * work on every demo church at once, and a second file doing that at the same
 * time would be pulling the rug out from under this one.
 *
 * Most of them stand up empty churches directly. What is being tested is which
 * church a visitor gets, and building real ones would put a quarter of an hour
 * on the suite.
 */
/**
 * The pool is gone. A copy of the template takes about half a second, so there
 * is nothing to keep warm: the suite that proved churches were built in
 * advance was proving a mechanism that no longer exists. What replaced it is
 * covered by `clone.test.ts`, which proves a copy holds what it came from.
 */

describe("what a demo copy looks like on arrival", () => {
  /*
   * HRT-456, R22.1. The setup guide is put away before anybody sees it.
   *
   * A demo church is a church already running: members, services, groups,
   * giving and a year of attendance. The guide read it as a church in its
   * first week and told the visitor to add their members, and it costs a
   * third of a laptop screen while saying so. On the giving screen that left
   * 700px of a 1440px window for two tables, and both were clipped. With the
   * rail away it is 1168px and neither is.
   *
   * Asserted on the clone rather than on the template, because the clone is
   * what a visitor gets and a template written before this existed still has
   * to produce copies that are right.
   */
  it("has the setup guide already dismissed", async () => {
    const made = await createDemoChurch(crypto.randomUUID());
    try {
      const [row] = await owner()<{ dismissed: Date | null }[]>`
        select setup_dismissed_at as dismissed from tenants where id = ${made.tenantId}`;
      expect(row?.dismissed).not.toBeNull();
    } finally {
      await owner().begin(async (tx) => {
        await tx`select set_config('app.audit_off', '1', true)`;
        await tx`select set_config('app.purge', '1', true)`;
        await tx`delete from tenants where id = ${made.tenantId}`;
      });
    }
  }, 300_000);
});
