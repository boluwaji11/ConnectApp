"use server";

import { revalidatePath } from "next/cache";
import {
  withTenant, personForUser, answerMyAssignment, addBlockout, removeBlockout,
  checkInMyChildren, InvalidInputError,
} from "@connectapp/db";
import { requireSession } from "@/lib/session";
import { explain } from "@/lib/explain";

export interface Done {
  error?: string;
}

/** The signed-in member themselves, and the actor every write here runs as. */
async function asMember() {
  const session = await requireSession();
  const scope = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
  return { session, scope };
}

/**
 * R17.7. Answering a serving request from inside the portal.
 *
 * The emailed link answers by token. This one answers as whoever is signed in,
 * and the repository matches the assignment against their own member record,
 * so the id in the request cannot reach anybody else's row.
 */
export async function answerMine(
  id: string,
  accept: boolean,
  reason: string | null,
  ): Promise<Done> {
  try {
    const { session, scope } = await asMember();
    await withTenant(scope, async (tx) => {
      const self = await personForUser(tx, session.userId);
      if (!self) throw new InvalidInputError("member.error.noRecord");
      await answerMyAssignment(
        tx,
        { tenantId: session.tenantId, role: session.role, userId: session.userId, memberId: self },
        { id, accept, reason },
      );
    });
    revalidatePath("/home");
    revalidatePath("/home/schedule");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R17.7. A stretch of days this member cannot serve. */
export async function addAway(
  startsOn: string,
  endsOn: string,
  reason: string | null,
  ): Promise<Done> {
  try {
    const { session, scope } = await asMember();
    await withTenant(scope, async (tx) => {
      const self = await personForUser(tx, session.userId);
      if (!self) throw new InvalidInputError("member.error.noRecord");
      await addBlockout(
        tx,
        { tenantId: session.tenantId, role: session.role, userId: session.userId },
        { memberId: self, startsOn, endsOn, reason },
      );
    });
    revalidatePath("/home/schedule");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function removeAway(id: string): Promise<Done> {
  try {
    const { session, scope } = await asMember();
    await withTenant(scope, async (tx) => {
      /* SEC-018. Their own record, resolved from the session, the way
         `addAway` already does it. The id alone used to be enough. */
      const self = await personForUser(tx, session.userId);
      if (!self) throw new InvalidInputError("member.error.noRecord");
      await removeBlockout(
        tx,
        { tenantId: session.tenantId, role: session.role, userId: session.userId },
        id,
        self,
      );
    });
    revalidatePath("/home/schedule");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R17.8. Checking your own children in, before you arrive.
 *
 * The ids go to the repository, which checks every one of them against this
 * person's own household before it writes anything, so a request naming
 * somebody else's child checks nobody in.
 */
export async function checkInMine(
  occurrenceId: string,
  memberIds: string[],
  ): Promise<Done> {
  try {
    const { session, scope } = await asMember();
    await withTenant(scope, (tx) =>
      checkInMyChildren(
        tx,
        { tenantId: session.tenantId, role: session.role, userId: session.userId },
        { occurrenceId, memberIds },
      ));
    revalidatePath("/home");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

