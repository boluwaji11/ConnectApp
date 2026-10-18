import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { owner, closeConnections } from "../src/client";
import * as platform from "../src/repo/platform";
import { testTenant, dropTenants } from "./helpers/tenant";

/**
 * HRT-434, R1.11, R21.3. What an operator read, not only what they changed.
 *
 * Every privileged write in the portal was recorded and no read was, which is
 * the wrong way round for a portal whose entire purpose is reach across
 * churches. An operator who changes nothing and reads everything left no trace
 * at all, so "who looked at that church's records" had no answer.
 *
 * What is deliberately not recorded is as much of the design as what is: the
 * home screen's counts and the unfiltered list are what the portal draws on
 * arrival, and a line for each of those buries the ones that mean something.
 */

const SLUG = "platform-reads";
let tenantId: string;
let operatorId: string;

const lines = async (action?: string) =>
  owner()<{ action: string; tenant_id: string | null; note: string | null }[]>`
    select action, tenant_id, note from platform_events
     where actor_id = ${operatorId}
       and (${action ?? null}::text is null or action = ${action ?? null})
     order by at desc`;

beforeAll(async () => {
  tenantId = await testTenant(SLUG, "Platform Reads Church");

  const [user] = await owner()<{ id: string }[]>`
    insert into app_users (id, email, full_name)
    values (gen_random_uuid(), 'reads-probe@connectapp.example.org', 'Reads Probe')
    on conflict (email) do update set full_name = excluded.full_name
    returning id`;
  operatorId = user!.id;

  await owner()`
    insert into platform_admins (user_id, name)
    values (${operatorId}, 'Reads Probe')
    on conflict (user_id) do update set revoked_at = null`;

  await owner()`delete from platform_events where actor_id = ${operatorId}`;
});

afterAll(async () => {
  await owner().begin(async (tx) => {
    await tx`select set_config('app.purge', '1', true)`;
    await tx`delete from platform_events where actor_id = ${operatorId}`;
  });
  await owner()`delete from platform_admins where user_id = ${operatorId}`;
  await owner()`delete from app_users where id = ${operatorId}`;
  await dropTenants(SLUG);
  await closeConnections();
});

describe("opening one church", () => {
  it("writes down which church, and who", async () => {
    await platform.church(operatorId, tenantId);

    const [row] = await lines("opened");
    expect(row?.tenant_id).toBe(tenantId);
  });

  it("counts a second look inside the window as the same look", async () => {
    /*
     * Going back and opening it again is one piece of work. Without this the
     * log fills with the same line and the question it exists to answer gets
     * harder to read rather than easier.
     */
    await platform.church(operatorId, tenantId);
    await platform.church(operatorId, tenantId);
    expect((await lines("opened")).length).toBe(1);
  });
});

describe("searching for a church", () => {
  it("writes down what was typed", async () => {
    await platform.listChurches(operatorId, { query: "platform-reads" });
    const [row] = await lines("searched");
    expect(row?.note).toBe("platform-reads");
  });

  it("says nothing about the list the portal opens on", async () => {
    const before = (await lines()).length;
    await platform.listChurches(operatorId);
    await platform.signals(operatorId);
    expect((await lines()).length).toBe(before);
  });
});

describe("looking an account up by address", () => {
  it("writes down the address that was looked for", async () => {
    await platform.twoStepFor(operatorId, "reads-probe@connectapp.example.org");
    const [row] = await lines("looked up");
    expect(row?.note).toBe("reads-probe@connectapp.example.org");
  });

  it("writes it down for an address with no account too", async () => {
    /*
     * Recording only the hits would make the log say which addresses hold an
     * account here, and what is worth reviewing is that somebody went looking.
     */
    await platform.twoStepFor(operatorId, "nobody-at-all@connectapp.example.org");
    const notes = (await lines("looked up")).map((r) => r.note);
    expect(notes).toContain("nobody-at-all@connectapp.example.org");
  });
});

describe("the log it writes into", () => {
  it("is the one no application role can edit", async () => {
    /* HRT-435. Recording a read is worth nothing if the record can be tidied
       up by whoever did the reading. */
    const [row] = await lines("opened");
    expect(row).toBeTruthy();

    let said = "";
    try {
      await owner()`
        update platform_events set note = 'tidied' where actor_id = ${operatorId}`;
    } catch (error) {
      said = error instanceof Error ? error.message : String(error);
    }
    expect(said).toMatch(/append only/);
  });
});
