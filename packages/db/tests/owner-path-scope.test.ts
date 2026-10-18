/**
 * SEC-005, SEC-006. The owner connection's own tenant filters.
 *
 * Most of this package reaches a church through `withTenant`, where the
 * isolation policies decide what a query may touch and a forgotten filter
 * returns nothing. A handful of functions run on the owner connection instead,
 * because they answer a question that has no tenant yet or because they are a
 * queue rather than a request. The policies do not constrain those, so each one
 * has to name the rows it may touch itself, and nothing mechanical was
 * checking that it did.
 *
 * Two had stopped doing it. `revokeInvitation` took an id and no church, so an
 * administrator of one church could withdraw any open invitation on the
 * platform. The send worker's consent join carried no tenant predicate, so one
 * church's message could leave carrying another church's unsubscribe token.
 *
 * These are the adversarial cases for those two, written against the boundary
 * rather than against the implementation: two churches, and a reach from one
 * into the other that has to come back empty.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { owner, closeConnections, withTenant } from "../src/client";
import { createInvitation, revokeInvitation } from "../src/repo/membership";
import { claimBatch } from "../src/repo/email-queue";
import { startSend } from "../src/repo/email-sends";
import { testTenant, dropTenants } from "./helpers/tenant";

const ONE = "ownerscopeone";
const TWO = "ownerscopetwo";

let one: string;
let two: string;

beforeAll(async () => {
  one = await testTenant(ONE, "Owner Scope One");
  two = await testTenant(TWO, "Owner Scope Two");
});

afterAll(async () => {
  await dropTenants(ONE, TWO);
  await closeConnections();
});

describe("withdrawing an invitation", () => {
  it("will not reach another church's invitation", async () => {
    const theirs = await createInvitation({
      tenantId: two,
      email: "invited@example.org",
      role: "staff",
    });

    /* Church one asking, with church two's id. The id is all the caller used
       to need, and the only thing that made it safe was that no screen sent
       the wrong one. */
    await revokeInvitation(one, theirs.id);

    const [still] = await owner()<{ revoked_at: Date | null }[]>`
      select revoked_at from invitations where id = ${theirs.id}`;
    expect(still?.revoked_at, "another church withdrew this invitation").toBeNull();
  });

  it("withdraws its own", async () => {
    const mine = await createInvitation({
      tenantId: one,
      email: "mine@example.org",
      role: "staff",
    });
    await revokeInvitation(one, mine.id);

    const [gone] = await owner()<{ revoked_at: Date | null }[]>`
      select revoked_at from invitations where id = ${mine.id}`;
    expect(gone?.revoked_at).not.toBeNull();
  });
});

describe("the send worker's batch", () => {
  it("never hands a recipient another church's way out", async () => {
    /*
     * The same address in both churches, with no member record on either
     * side, which is the shape the join matched on the address alone: a
     * visiting speaker, or anybody typed straight into the composer.
     */
    const address = "shared@example.org";
    const tokens: Record<string, string> = {};

    for (const [tenantId, label] of [[one, "one"], [two, "two"]] as const) {
      const [row] = await owner()<{ token: string }[]>`
        insert into contact_consent (tenant_id, channel, address, token)
        values (${tenantId}, 'email', ${address}, ${`tok-${label}-${Date.now()}`})
        returning token`;
      tokens[tenantId] = row!.token;
    }

    const as = { tenantId: one, role: "owner" as const };
    const sendId = await withTenant(as, (tx) =>
      startSend(tx, as, {
        subject: "Scope",
        body: "Body",
        audience: "people",
        audienceId: null,
        audienceName: null,
        sendAt: null,
        origin: "https://example.org",
        recipients: [{ memberId: null, address }],
      }),
    );

    const batch = await claimBatch(sendId);
    const mine = batch.filter((row) => row.address === address);

    /* One row, not two, and the token is this church's. */
    expect(mine.length, "the same address matched twice").toBe(1);
    expect(mine[0]!.token === tokens[two], "carried the other church's way out").toBe(false);
    expect(mine[0]!.token).toBe(tokens[one]);
  });
});
