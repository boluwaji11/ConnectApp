import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { owner, closeConnections } from "../src/client";
import { testTenant, dropTenants } from "./helpers/tenant";

/**
 * HRT-435, R1.11, R8.13. Append only, asked of the database rather than of us.
 *
 * Three records are promised to be kept: the audit log, the operator log, and
 * a child's incident report. Two of those promises used to be a revoke, which
 * stops `hearth_app` and stops nothing on the owner connection, and the third
 * was nobody having written the update yet.
 *
 * These run as the owner, deliberately. A test that proves `hearth_app` cannot
 * do it proves the revoke, which was never the gap. The gap was everything
 * else that connects, and the only thing that covers it is a trigger.
 */

let tenantId: string;
let memberId: string;

beforeAll(async () => {
  tenantId = await testTenant("append-only", "Append Only Church");

  const [person] = await owner()<{ id: string }[]>`
    insert into members (tenant_id, first_name, last_name, slug)
    values (${tenantId}, 'Append', 'Only',
            public.hearth_free_member_slug(${tenantId}, 'Append Only'))
    returning id`;
  memberId = person!.id;
});

afterAll(async () => {
  await dropTenants("append-only", "append-only-purge");
  await closeConnections();
});

/** Runs the statement and reports what the database said, without keeping it. */
async function refused(statement: () => Promise<unknown>): Promise<string | null> {
  try {
    await statement();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("the audit log", () => {
  let entryId: string;

  beforeAll(async () => {
    /* A write anywhere audited produces one. Written through the trigger
       rather than inserted, so this is the real shape of a row. */
    await owner()`
      update members set last_name = 'Changed' where id = ${memberId}`;
    const [row] = await owner()<{ id: string }[]>`
      select id from audit_entries where tenant_id = ${tenantId} order by at desc limit 1`;
    entryId = row!.id;
  });

  it("has something to try this on", () => {
    expect(entryId).toBeTruthy();
  });

  it("refuses an update, on the owner connection", async () => {
    expect(await refused(() => owner()`
      update audit_entries set entity = entity where id = ${entryId}`))
      .toMatch(/append only/);
  });

  it("refuses a delete, on the owner connection", async () => {
    expect(await refused(() => owner()`
      delete from audit_entries where id = ${entryId}`))
      .toMatch(/append only/);
  });
});

describe("an incident report", () => {
  let incidentId: string;

  beforeAll(async () => {
    const [row] = await owner()<{ id: string }[]>`
      insert into incident_reports (tenant_id, member_id, occurred_on, description, action)
      values (${tenantId}, ${memberId}, current_date, 'A bump on the head', 'Ice pack')
      returning id`;
    incidentId = row!.id;
  });

  it("refuses a rewrite of what happened", async () => {
    expect(await refused(() => owner()`
      update incident_reports set description = 'nothing happened' where id = ${incidentId}`))
      .toMatch(/not edited/);
  });

  it("refuses a change to the day it happened", async () => {
    expect(await refused(() => owner()`
      update incident_reports set occurred_on = current_date - 5 where id = ${incidentId}`))
      .toMatch(/not edited/);
  });

  it("refuses a delete", async () => {
    expect(await refused(() => owner()`
      delete from incident_reports where id = ${incidentId}`))
      .toMatch(/is kept/);
  });

  it("allows the guardian being recorded as told, which is the one field that moves", async () => {
    await owner()`
      update incident_reports
         set guardian_notified = true, notified_at = now()
       where id = ${incidentId}`;
    const [row] = await owner()<{ told: boolean }[]>`
      select guardian_notified as told from incident_reports where id = ${incidentId}`;
    expect(row?.told).toBe(true);
  });

  it("refuses a guardian being untold once they have been told", async () => {
    expect(await refused(() => owner()`
      update incident_reports set guardian_notified = false where id = ${incidentId}`))
      .toMatch(/not untold/);
  });
});

describe("the maintenance escape", () => {
  /*
   * Removing a church cascades into all three of these, and a reset is not
   * somebody tampering with a record. `app.purge` is the same escape the audit
   * trigger uses, honoured off the request path only.
   */
  it("lets a church be removed with its records", async () => {
    const other = await testTenant("append-only-purge", "Purge Church");
    const [person] = await owner()<{ id: string }[]>`
      insert into members (tenant_id, first_name, last_name, slug)
      values (${other}, 'Gone', 'Away',
              public.hearth_free_member_slug(${other}, 'Gone Away'))
      returning id`;
    await owner()`
      insert into incident_reports (tenant_id, member_id, occurred_on, description, action)
      values (${other}, ${person!.id}, current_date, 'A bump', 'Ice pack')`;

    await owner().begin(async (tx) => {
      await tx`select set_config('app.audit_off', '1', true)`;
      await tx`select set_config('app.purge', '1', true)`;
      await tx`delete from tenants where id = ${other}`;
    });

    const left = await owner()<{ n: string }[]>`
      select count(*)::text as n from incident_reports where tenant_id = ${other}`;
    expect(left[0]?.n).toBe("0");
  });

  it("is not honoured for the role every request runs as", async () => {
    /*
     * The whole point. A query layer that could set this is a query layer that
     * could erase what it did, so the trigger reads `current_user` as well as
     * the setting.
     */
    const sql = owner();
    const [fn] = await sql<{ body: string }[]>`
      select prosrc as body from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'append_only'`;
    expect(fn?.body).toContain("current_user <> 'hearth_app'");
  });
});
