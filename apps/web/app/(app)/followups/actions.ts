"use server";

import {
  withTenant, getChurch, peopleNotIn, enterPipeline, setEntryStage, canFollowUp, PermissionError,
} from "@connectapp/db";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { churchNow } from "@/lib/church-now";

async function context() {
  const session = await requireSession();
  return {
    session,
    ctx: {
      tenantId: session.tenantId,
      role: session.role,
      userId: session.userId,
      permissions: session.permissions,
    },
  };
}

/** R5.4. People a church could put on this board, narrowed by what was typed. */
export async function findPeople(
  pipelineId: string,
  search: string,
  ): Promise<{ id: string; name: string }[]> {
  const { ctx } = await context();
    /*
     * SEC-022. A picker is a read of the whole directory, so it asks the same
     * permission the writes beside it ask.
     *
     * These returned name, address and household for anybody in the church to
     * any signed-in account. The product has a separate member-facing
     * directory whose default is name-only and whose visibility switches a
     * member can turn off; this handed out the staff view instead, so a member
     * who had turned every switch off was disclosed anyway.
     */
    if (!canFollowUp(ctx)) throw new PermissionError(ctx.role, "manageFollowUps");

  return withTenant(ctx, (tx) => peopleNotIn(tx, pipelineId, search));
}

/**
 * R5.4, R5.5. Putting somebody straight into a column.
 *
 * They enter the pipeline the normal way, with every step written out and
 * dated, and are then moved to the column they were dropped into, which marks
 * the steps before it as answered. A church adding somebody to the third column
 * is saying the first two already happened.
 */
export async function addToStage(
  pipelineId: string,
  memberId: string,
  position: number,
  ): Promise<{ error?: string }> {
  const { session, ctx } = await context();
  try {
    await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const today = churchNow(profile?.timezone ?? "America/Chicago").date;
      const entry = await enterPipeline(tx, ctx, {
        pipelineId,
        memberId,
        on: today,
        assigneeUserId: session.userId,
      });
      if (entry && position > 0) await setEntryStage(tx, ctx, entry.id, position);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}
