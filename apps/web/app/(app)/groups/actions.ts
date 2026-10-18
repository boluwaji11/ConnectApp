"use server";

import {
  withTenant, createGroup, updateGroup, setGroupArchived,
  addToGroup, removeFromGroup, leaveGroup, lookupPeople, getChurch,
  requestToJoin, withdrawRequest, decideRequest, setGroupPhoto, setGroupOpen, setGroupStatus,
  type GroupRole, canManageGroups, PermissionError,
} from "@connectapp/db";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { churchNow } from "@/lib/church-now";
import { supabaseServer } from "@/lib/supabase/server";

async function context() {
  const session = await requireSession();
  return {
    session,
    actor: { tenantId: session.tenantId, role: session.role },
    ctx: { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
  };
}

export interface GroupResult {
  id?: string;
  /** R24.6. Its readable address, for where to go once it is saved. */
  slug?: string;
  error?: string;
}

const field = (data: FormData, name: string): string => String(data.get(name) ?? "").trim();
const optional = (data: FormData, name: string): string | null => field(data, name) || null;
const number = (data: FormData, name: string): number | null => {
  const raw = field(data, name);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

function read(data: FormData) {
  return {
    name: field(data, "name"),
    description: optional(data, "description"),
    typeId: optional(data, "typeId"),
    dayOfWeek: field(data, "dayOfWeek") === "" ? null : Number(field(data, "dayOfWeek")),
    startsAt: optional(data, "startsAt"),
    endsAt: optional(data, "endsAt"),
    frequency: optional(data, "frequency"),
    endsOn: optional(data, "endsOn"),
    location: optional(data, "location"),
    addressLine1: optional(data, "addressLine1"),
    addressLine2: optional(data, "addressLine2"),
    city: optional(data, "addressCity"),
    region: optional(data, "addressRegion"),
    postalCode: optional(data, "addressPostalCode"),
    country: optional(data, "addressCountry"),
    capacity: number(data, "capacity"),
    forWhom: optional(data, "forWhom"),
    online: data.get("online") === "on",
    childrenWelcome: data.get("childrenWelcome") === "on",
    openToJoin: data.get("openToJoin") === "on",
    listed: data.get("listed") === "on",
  };
}

export async function create(data: FormData): Promise<GroupResult> {
  const { actor, ctx } = await context();
  try {
    const group = await withTenant(ctx, (tx) => createGroup(tx, actor, read(data)));
    return { id: group.id, slug: group.slug };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function save(data: FormData): Promise<GroupResult> {
  const { actor, ctx } = await context();
  try {
    const group = await withTenant(ctx, (tx) =>
      updateGroup(tx, actor, field(data, "id"), read(data)),
    );
    return { id: group.id, slug: group.slug };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function archive(data: FormData): Promise<GroupResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) =>
      setGroupArchived(tx, actor, field(data, "id"), field(data, "archived") === "true"),
    );
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface RosterResult {
  error?: string;
}

export async function join(
  groupId: string,
  memberId: string,
  role: GroupRole,
  ): Promise<RosterResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => addToGroup(tx, actor, { groupId, memberId, role }));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function leave(
  groupId: string,
  memberId: string,
  ): Promise<RosterResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => removeFromGroup(tx, actor, { groupId, memberId }));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R9.4, R17.5. Taking yourself out of a group.
 *
 * No member id crosses the wire: the person leaving is whoever is signed in,
 * so this cannot reach anybody else's membership however it is called.
 */
export async function leaveMine(
  groupId: string,
  ): Promise<RosterResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => leaveGroup(tx, actor, { groupId }));
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

/** R9.4. Finding somebody to put in the group, by the name a leader knows. */
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
    if (!canManageGroups(actor)) throw new PermissionError(actor.role, "manageGroups");

  try {
    return await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const asOf = churchNow(profile?.timezone ?? "America/Chicago").date;
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

export interface AskResult {
  error?: string;
}

/** R9.5. Asking to join a group. */
export async function ask(
  groupId: string,
  message: string | null,
  ): Promise<AskResult> {
  const { ctx } = await context();
  try {
    await withTenant(ctx, (tx) => requestToJoin(tx, ctx, { groupId, message }));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R9.5. Taking a request back.
 *
 * Pressing Join on the wrong group left the asker with nothing to do but
 * wait for a leader to answer a question they no longer wanted asked.
 */
export async function unask(groupId: string): Promise<AskResult> {
  const { ctx } = await context();
  try {
    await withTenant(ctx, (tx) => withdrawRequest(tx, ctx, groupId));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R9.6. The leader's answer, which puts them on the roster when it is yes. */
export async function decide(
  requestId: string,
  approve: boolean,
  ): Promise<AskResult> {
  const { ctx } = await context();
  try {
    await withTenant(ctx, (tx) => decideRequest(tx, ctx, { requestId, approve }));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R9.2. Takes the picture off a group, and out of the bucket. */
export async function clearGroupPhoto(
  groupId: string,
): Promise<GroupResult> {
  const session = await requireSession();
  const actor = { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions };
  try {
    const removed = await withTenant(actor, (tx) => setGroupPhoto(tx, actor, groupId, null));
    if (removed.removed) {
      const supabase = await supabaseServer();
      await supabase.storage.from("church").remove([removed.removed]);
    }
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R9.5. The one press that opens a group to new members, or shuts it. */
export async function setOpenToJoin(
  id: string,
  open: boolean,
  ): Promise<GroupResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setGroupOpen(tx, actor, id, open));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R9.5. Publishes a group, or takes it back to a draft. */
export async function publishGroup(
  id: string,
  status: "draft" | "published",
  ): Promise<GroupResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setGroupStatus(tx, actor, id, status));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}
