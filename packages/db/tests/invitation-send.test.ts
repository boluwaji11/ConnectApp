/**
 * HRT-370, R1.7, R16.4. What an invitation has to hand the message that goes
 * out.
 *
 * Writing the row was never the hard part. Sending it is, and sending it needs
 * four facts the row and the tables beside it hold: the address, the role by
 * the name this church reads it under, who sent it, and the day it runs out.
 *
 * Sending again from the Invited list has nothing but an id, so the read is
 * bounded by the church as well, and it answers with nothing for an invitation
 * that has been withdrawn: a message that goes after a church took somebody's
 * way in away is worse than no message at all.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { owner, closeConnections } from "../src/client";
import { createInvitation, invitationToSend, revokeInvitation } from "../src/repo/membership";
import { testTenant, dropTenants } from "./helpers/tenant";

const SLUG = "hrt370-invitation";
const OTHER = "hrt370-elsewhere";
const INVITER = "11111111-1111-4111-8111-111111111370";

let tenant: string;
let elsewhere: string;

beforeAll(async () => {
  tenant = await testTenant(SLUG, "Invitation Test Church");
  elsewhere = await testTenant(OTHER, "Elsewhere Test Church");

  await owner()`
    insert into app_users (id, email, full_name)
    values (${INVITER}, 'hrt370-inviter@example.org', 'Sarah Bennett')
    on conflict (id) do update set full_name = excluded.full_name`;
});

afterAll(async () => {
  await dropTenants(SLUG, OTHER);
  await owner()`delete from app_users where id = ${INVITER}`;
  await closeConnections();
});

/** How far apart two instants are, in days. */
const days = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 86_400_000;

describe("writing an invitation", () => {
  it("comes back with the day it runs out, fourteen days on", async () => {
    const made = await createInvitation({
      tenantId: tenant,
      email: "Fourteen@Example.org",
      role: "staff",
    });

    expect(made.expiresAt).toBeInstanceOf(Date);
    expect(days(new Date(), made.expiresAt)).toBeGreaterThan(13.9);
    expect(days(new Date(), made.expiresAt)).toBeLessThan(14.1);
  });

  it("runs out when the caller says, where it says", async () => {
    const made = await createInvitation({
      tenantId: tenant,
      email: "three-days@example.org",
      role: "staff",
      days: 3,
    });

    expect(days(new Date(), made.expiresAt)).toBeGreaterThan(2.9);
    expect(days(new Date(), made.expiresAt)).toBeLessThan(3.1);
  });

  /* Inviting the same address twice is one row, so the second press puts the
     fourteen days back rather than leaving somebody with yesterday's. */
  it("gives an address invited again its full fourteen days back", async () => {
    const first = await createInvitation({
      tenantId: tenant,
      email: "again@example.org",
      role: "staff",
      days: 1,
    });
    const second = await createInvitation({
      tenantId: tenant,
      email: "again@example.org",
      role: "staff",
    });

    expect(second.id).toBe(first.id);
    expect(days(new Date(), second.expiresAt)).toBeGreaterThan(13.9);
  });
});

describe("what the message is built from", () => {
  it("gives the address, the role, who sent it and the day", async () => {
    const made = await createInvitation({
      tenantId: tenant,
      email: "Pastor@Example.org",
      role: "pastoral",
      invitedByUserId: INVITER,
    });

    const open = await invitationToSend(tenant, made.id);

    // Lower-cased on the way in, because that is the address it is matched on.
    expect(open?.email).toBe("pastor@example.org");
    expect(open?.role).toBe("pastoral");
    // A built-in is named by the product, so the row carries no name of its own.
    expect(open?.roleName).toBeNull();
    expect(open?.invitedBy).toBe("Sarah Bennett");
    expect(days(new Date(), open!.expiresAt)).toBeGreaterThan(13.9);
  });

  it("names a role the church wrote by the name the church wrote", async () => {
    const [role] = await owner()<{ id: string }[]>`
      insert into tenant_roles (tenant_id, key, name, permissions, builtin)
      values (${tenant}, 'custom_welcome_lead', 'Welcome lead', '{}'::text[], false)
      returning id`;

    const made = await createInvitation({
      tenantId: tenant,
      email: "welcome@example.org",
      role: "member",
      roleId: role!.id,
    });

    const open = await invitationToSend(tenant, made.id);
    expect(open?.roleName).toBe("Welcome lead");
    // R1.6. A church's own role carries "member" in the enum beneath it.
    expect(open?.role).toBe("member");
  });

  it("answers with nothing for an invitation belonging to another church", async () => {
    const made = await createInvitation({
      tenantId: tenant,
      email: "not-yours@example.org",
      role: "staff",
    });

    expect(await invitationToSend(elsewhere, made.id)).toBeNull();
  });

  it("answers with nothing once the invitation is withdrawn", async () => {
    const made = await createInvitation({
      tenantId: tenant,
      email: "withdrawn@example.org",
      role: "staff",
    });

    await revokeInvitation(tenant, made.id);
    expect(await invitationToSend(tenant, made.id)).toBeNull();
  });

  it("answers with nothing once it has run out", async () => {
    const made = await createInvitation({
      tenantId: tenant,
      email: "expired@example.org",
      role: "staff",
      days: 1,
    });

    await owner()`update invitations set expires_at = now() - interval '1 day' where id = ${made.id}`;
    expect(await invitationToSend(tenant, made.id)).toBeNull();
  });
});
