"use server";

import {
  withTenant, createTeam, updateTeam, setTeamArchived,
  addPosition, updatePosition, setPositionArchived,
  addToTeam, removeFromTeam, setTeamMemberRole, setTeamMemberPositions,
  lookupPeople, listPeople, getChurch,
  assign, unassign, candidatesFor,
  userForPerson,
  type TeamRole, type TagHue, type PlanCandidate, canManageTeams, PermissionError,
} from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { churchNow } from "@/lib/church-now";
import { pushTo } from "@/lib/push";

async function context() {
  const session = await requireSession();
  return {
    session,
    // R10.1. The account goes to the repository, because a team leader may
    // change the schedule of the team they lead and nothing else, and only the id
    // answers which team that is.
    actor: { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
    ctx: { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
  };
}

const field = (data: FormData, name: string): string => String(data.get(name) ?? "").trim();
const optional = (data: FormData, name: string): string | null => field(data, name) || null;

export interface TeamResult {
  id?: string;
  error?: string;
}

export async function saveTeam(data: FormData): Promise<TeamResult> {
  const { actor, ctx } = await context();
  const id = field(data, "id");
  const input = {
    name: field(data, "name"),
    description: optional(data, "description"),
    hue: (optional(data, "hue") ?? undefined) as TagHue | undefined,
  };

  try {
    const team = await withTenant(ctx, (tx) =>
      id ? updateTeam(tx, actor, id, input) : createTeam(tx, actor, input),
    );
    return { id: team.id };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function archiveTeam(data: FormData): Promise<TeamResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) =>
      setTeamArchived(tx, actor, field(data, "id"), field(data, "archived") === "true"),
    );
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface PositionResult {
  error?: string;
}

export interface PositionFields {
  teamId: string;
  name: string;
  needed: number;
  withChildren: boolean;
  requiresCheck: boolean;
}

export async function savePosition(
  id: string | null,
  input: PositionFields,
  ): Promise<PositionResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, async (tx) => {
      if (id) await updatePosition(tx, actor, id, input);
      else await addPosition(tx, actor, input);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function archivePosition(id: string): Promise<PositionResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setPositionArchived(tx, actor, id, true));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface RosterResult {
  error?: string;
}

export async function addMember(
  teamId: string,
  memberId: string,
  role: TeamRole,
  ): Promise<RosterResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => addToTeam(tx, actor, { teamId, memberId, role }));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function removeMember(
  teamId: string,
  memberId: string,
  ): Promise<RosterResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => removeFromTeam(tx, actor, { teamId, memberId }));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function changeRole(
  teamId: string,
  memberId: string,
  role: TeamRole,
  ): Promise<RosterResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setTeamMemberRole(tx, actor, { teamId, memberId, role }));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function changePositions(
  teamId: string,
  memberId: string,
  positionIds: string[],
  ): Promise<RosterResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) =>
      setTeamMemberPositions(tx, actor, { teamId, memberId, positionIds }),
    );
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface PersonHit {
  id: string;
  name: string;
  household: string | null;
}

/** R10.1. Finding somebody to put on the team, by the name a leader knows. */
export async function findPerson(query: string): Promise<PersonHit[]> {
  const { session, ctx, actor } = await context();
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
    if (!canManageTeams(actor)) throw new PermissionError(actor.role, "manageTeams");

  try {
    return await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const asOf = churchNow(profile?.timezone ?? "America/Chicago").date;

      // Nothing typed yet, so the box opens on the first names in the
      // directory rather than on nothing at all.
      if (query.trim().length < 2) {
        const first = await listPeople(tx, { sort: "name" });
        return first.slice(0, 10).map((one) => ({
          id: one.id,
          name: one.displayName,
          household: one.householdName,
        }));
      }

      const matches = await lookupPeople(tx, query, { asOf, limit: 10 });
      return matches.map((m) => ({
        id: m.person.id,
        name: `${m.person.name} ${m.person.lastName}`,
        household: m.householdName,
      }));
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// R10.3 to R10.5. The schedule
// ---------------------------------------------------------------------------

export interface ScheduleResult {
  error?: string;
}

export async function schedule(
  input: {
    occurrenceId: string; teamId: string; positionId: string; memberId: string; anyway: boolean;
  },
  ): Promise<ScheduleResult> {
  const { session, actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => assign(tx, actor, input));

    /*
     * R16.10, R17.7. The one notification a member actually waits on. Sent
     * after the write, so a push that is slow or refused cannot hold up the
     * schedule, and addressed to the account behind the person rather than to the
     * person, because a push goes to a browser.
     */
    const account = await withTenant(ctx, (tx) => userForPerson(tx, input.memberId));

    if (account) {
      await pushTo(ctx, [account], {
        title: session.tenantName,
        body: t("push.serving"),
        href: "/home/schedule",
        tag: `serving-${input.occurrenceId}`,
      });
    }

    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function unschedule(id: string): Promise<ScheduleResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => unassign(tx, actor, id));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R10.3. Who could fill this slot, with what the scheduler should know. */
export async function whoCouldFill(
  input: { teamId: string; positionId: string; occurrenceId: string },
  ): Promise<PlanCandidate[]> {
  const { ctx, actor } = await context();
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
    if (!canManageTeams(actor)) throw new PermissionError(actor.role, "manageTeams");

  try {
    return await withTenant(ctx, (tx) => candidatesFor(tx, input));
  } catch {
    return [];
  }
}


