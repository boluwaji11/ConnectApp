/**
 * HRT-400, R21.x. The portal grants and takes away its own operators.
 *
 * Written because none of this was covered and the gap was expensive: every
 * table carrying a tenant_id gets an audit trigger, found by looking rather
 * than by a list, and `platform_events.tenant_id` looks exactly like one of
 * those while being null for anything not done to a single church. So the
 * audit row had no tenant, the insert was refused, and the one action that
 * lets a second person into the portal failed against a database that had
 * passed every other test.
 *
 * The cases below go through the same functions the Operators screen calls, so
 * a trigger that should not be there fails here rather than in production.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { owner, closeConnections } from "../src/client";
import { withAuditTriggersOff } from "../src/maintenance";
import {
  platformAdmin, admins, grant, revoke, events, PlatformError,
  inviteTeamMember, teamInvites, revokeInvite, claimInvite, approve,
} from "../src/repo/platform";

/* Three accounts: the one that already operates the platform, the one being
   let in, and one that has an account and no business here. */
const FIRST = "11111111-2222-4333-8444-aaaa00000001";
const SECOND = "11111111-2222-4333-8444-aaaa00000002";
const OUTSIDER = "11111111-2222-4333-8444-aaaa00000003";

const ADDRESS = {
  first: "platform-test-first@connectapp.example.org",
  second: "platform-test-second@connectapp.example.org",
  outsider: "platform-test-outsider@connectapp.example.org",
};

const CHURCH = "11111111-2222-4333-8444-bbbb00000001";

async function clear(): Promise<void> {
  const ids = [FIRST, SECOND, OUTSIDER, "11111111-2222-4333-8444-aaaa00000004"];
  /*
   * HRT-435. `platform_events` is append only, enforced by a trigger that
   * fires for the owner connection too. Clearing up after a test is the
   * maintenance path rather than somebody tampering with the log, which is
   * what the escape is for.
   */
  await withAuditTriggersOff(async (sql) => {
    await sql`delete from platform_events where tenant_id = ${CHURCH}`;
    await sql`delete from platform_events where actor_id in ${sql(ids)}`;
  });
  await owner()`delete from tenants where id = ${CHURCH}`;
  await owner()`delete from platform_invites where email like 'platform-test-%'`;
  await owner()`delete from platform_admins where user_id in ${owner()(ids)}`;
  await owner()`delete from app_users where id in ${owner()(ids)}`;
}

beforeAll(async () => {
  await clear();
  await owner()`
    insert into app_users (id, email, full_name) values
      (${FIRST}, ${ADDRESS.first}, 'First Operator'),
      (${SECOND}, ${ADDRESS.second}, 'Second Operator'),
      (${OUTSIDER}, ${ADDRESS.outsider}, 'Not An Operator')`;
  await owner()`
    insert into platform_admins (user_id, name) values (${FIRST}, 'First Operator')`;
});

afterAll(async () => {
  await clear();
  await closeConnections();
});

describe("who operates the platform", () => {
  it("knows the one account that does", async () => {
    expect(await platformAdmin(FIRST)).toMatchObject({ name: "First Operator" });
    expect(await platformAdmin(OUTSIDER)).toBeNull();
    expect(await platformAdmin("")).toBeNull();
  });

  it("refuses every read to an account that does not", async () => {
    await expect(admins(OUTSIDER)).rejects.toThrow(PlatformError);
    await expect(events(OUTSIDER)).rejects.toThrow(PlatformError);
    await expect(grant(OUTSIDER, ADDRESS.second, "Second Operator")).rejects.toThrow(
      PlatformError,
    );
  });
});

describe("letting somebody else in", () => {
  it("grants by the address they already sign in with, and says who did it", async () => {
    await grant(FIRST, ADDRESS.second, "Second Operator");

    expect(await platformAdmin(SECOND)).toMatchObject({ name: "Second Operator" });

    const rows = await admins(FIRST);
    const added = rows.find((one) => one.email === ADDRESS.second);
    expect(added).toMatchObject({
      name: "Second Operator",
      grantedByName: "First Operator",
      revokedAt: null,
    });
  });

  it("writes the grant to the log with no church attached", async () => {
    /* The case the audit trigger broke. A grant is not done to one church, so
       its event carries no tenant, and that has to be allowed to happen. */
    const log = await events(FIRST, { limit: 10 });
    const entry = log.find((one) => one.action === "granted");
    expect(entry).toBeDefined();
    expect(entry!.tenantId).toBeNull();
    expect(entry!.note).toContain(ADDRESS.second);
  });

  it("takes an address that does not sign in anywhere as a mistake", async () => {
    await expect(grant(FIRST, "nobody@connectapp.example.org", "Nobody")).rejects.toThrow(
      "No account signs in with that address yet",
    );
  });

  it("wants both an address and a name", async () => {
    await expect(grant(FIRST, ADDRESS.second, "  ")).rejects.toThrow(PlatformError);
    await expect(grant(FIRST, "  ", "Second Operator")).rejects.toThrow(PlatformError);
  });
});

describe("taking it away", () => {
  it("leaves the row, so the log still reads", async () => {
    await revoke(FIRST, SECOND);

    expect(await platformAdmin(SECOND)).toBeNull();
    const rows = await admins(FIRST);
    const gone = rows.find((one) => one.email === ADDRESS.second);
    expect(gone?.revokedAt).toBeInstanceOf(Date);
    expect(gone?.name).toBe("Second Operator");
  });

  it("will not lock the last person out of their own portal", async () => {
    await expect(revoke(FIRST, FIRST)).rejects.toThrow("lock you out");
    expect(await platformAdmin(FIRST)).not.toBeNull();
  });

  it("refuses an account that was not on the team in the first place", async () => {
    await expect(revoke(FIRST, OUTSIDER)).rejects.toThrow("is not on the platform team");
  });

  it("lets a revoked operator back in, carrying a fresh grant", async () => {
    await grant(FIRST, ADDRESS.second, "Second Operator");
    expect(await platformAdmin(SECOND)).not.toBeNull();
  });
});

describe("asking somebody on who has no account yet", () => {
  const NEWCOMER = "platform-test-newcomer@connectapp.example.org";
  const NEWCOMER_ID = "11111111-2222-4333-8444-aaaa00000004";

  it("refuses an address that is not an address", async () => {
    await expect(inviteTeamMember(FIRST, "not-an-address", "Someone")).rejects.toThrow(
      "does not look like an email address",
    );
  });

  it("refuses somebody who is already on the team", async () => {
    await expect(inviteTeamMember(FIRST, ADDRESS.second, "Second Operator")).rejects.toThrow(
      "already on the team",
    );
  });

  it("asks an address nobody has used, and lists the ask", async () => {
    const asked = await inviteTeamMember(FIRST, NEWCOMER, "A Newcomer");
    expect(asked.token).toHaveLength(43);
    expect(asked.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const waiting = await teamInvites(FIRST);
    expect(waiting.find((one) => one.email === NEWCOMER)).toMatchObject({
      name: "A Newcomer",
      invitedByName: "First Operator",
    });
  });

  it("keeps the token out of the table, so reading it is not a way in", async () => {
    const asked = await inviteTeamMember(FIRST, NEWCOMER, "A Newcomer");
    const rows = await owner()<{ token_hash: string }[]>`
      select token_hash from platform_invites where lower(email) = ${NEWCOMER}
         and accepted_at is null and revoked_at is null`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toContain(asked.token);
  });

  it("leaves one live ask an address, so an older link stops working", async () => {
    const first = await inviteTeamMember(FIRST, NEWCOMER, "A Newcomer");
    const second = await inviteTeamMember(FIRST, NEWCOMER, "A Newcomer");

    await owner()`
      insert into app_users (id, email, full_name)
      values (${NEWCOMER_ID}, ${NEWCOMER}, 'A Newcomer')
      on conflict (id) do nothing`;

    await expect(
      claimInvite(first.token, { id: NEWCOMER_ID, email: NEWCOMER }),
    ).rejects.toThrow("expired or has already been used");

    await expect(
      claimInvite(second.token, { id: NEWCOMER_ID, email: NEWCOMER }),
    ).resolves.toMatchObject({ name: "A Newcomer" });

    expect(await platformAdmin(NEWCOMER_ID)).toMatchObject({ name: "A Newcomer" });
  });

  /* The test above let them in, and somebody on the team cannot be asked
     again. Taking the row away puts them back where these two start. */
  const offTeam = () =>
    owner()`delete from platform_admins where user_id = ${NEWCOMER_ID}::uuid`;

  it("will not let a forwarded link grant somebody else", async () => {
    await offTeam();
    const asked = await inviteTeamMember(FIRST, NEWCOMER, "A Newcomer");
    await expect(
      claimInvite(asked.token, { id: OUTSIDER, email: ADDRESS.outsider }),
    ).rejects.toThrow(`was sent to ${NEWCOMER}`);
    /* And the ask is still standing, so the real person can still use it. */
    expect((await teamInvites(FIRST)).some((one) => one.email === NEWCOMER)).toBe(true);
  });

  it("refuses a token that was never issued", async () => {
    await expect(
      claimInvite("not-a-real-token", { id: OUTSIDER, email: ADDRESS.outsider }),
    ).rejects.toThrow("expired or has already been used");
  });

  it("withdraws an ask, and the link stops working", async () => {
    await offTeam();
    const asked = await inviteTeamMember(FIRST, NEWCOMER, "A Newcomer");
    const waiting = await teamInvites(FIRST);
    const mine = waiting.find((one) => one.email === NEWCOMER)!;

    await revokeInvite(FIRST, mine.id);
    await expect(revokeInvite(FIRST, mine.id)).rejects.toThrow("already been used or withdrawn");
    await expect(
      claimInvite(asked.token, { id: NEWCOMER_ID, email: NEWCOMER }),
    ).rejects.toThrow("expired or has already been used");
  });

  it("refuses the whole thing to an account that is not on the team", async () => {
    await expect(inviteTeamMember(OUTSIDER, NEWCOMER, "A Newcomer")).rejects.toThrow(PlatformError);
    await expect(teamInvites(OUTSIDER)).rejects.toThrow(PlatformError);
  });
});

/*
 * HRT-403. Approving twice used to send the owner a second email.
 *
 * `approve` set approved_at = now() with no guard, so a second press reset the
 * original approval time, wrote a second entry to the log, and told the caller
 * nothing, which is what the caller used to decide whether to send the email.
 */
describe("approving a church", () => {
  it("approves once, and says so", async () => {
    await owner()`
      insert into tenants (id, slug, name, timezone)
      values (${CHURCH}, 'platform-test-church', 'Platform Test Church', 'America/Chicago')
      on conflict (id) do update set approved_at = null, approved_by = null`;

    expect(await approve(FIRST, CHURCH, "looks like a church")).toBe(true);

    const [row] = await owner()<{ approvedAt: Date }[]>`
      select approved_at as "approvedAt" from tenants where id = ${CHURCH}`;
    expect(row?.approvedAt).toBeTruthy();
  });

  it("does nothing on a second press, so no second email goes out", async () => {
    const [before] = await owner()<{ approvedAt: Date }[]>`
      select approved_at as "approvedAt" from tenants where id = ${CHURCH}`;

    expect(await approve(FIRST, CHURCH, "pressed again")).toBe(false);

    const [after] = await owner()<{ approvedAt: Date }[]>`
      select approved_at as "approvedAt" from tenants where id = ${CHURCH}`;
    /* The first approval's own time survives, rather than moving to now. */
    expect(after?.approvedAt?.toISOString()).toBe(before?.approvedAt?.toISOString());

    const logged = await owner()<{ n: number }[]>`
      select count(*)::int as n from platform_events
       where tenant_id = ${CHURCH} and action = 'approved'`;
    expect(logged[0]?.n).toBe(1);
  });
});
