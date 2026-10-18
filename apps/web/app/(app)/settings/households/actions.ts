"use server";

import { revalidatePath } from "next/cache";

import {
  withTenant, createHousehold, renameHousehold, setHouseholdArchived, mergeHouseholds,
  peopleWithoutHousehold, addToHousehold, removeFromHousehold, setHouseholdRole,
  setHouseholdAddress, canManageHouseholds, PermissionError,
} from "@connectapp/db";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";

export interface HouseholdResult {
  error?: string;
  /** The household just made, so the caller can carry on filling it. */
  id?: string;
}

async function actor() {
  const session = await requireSession();
  return {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
}

/** R2.1. A new family, named before anybody is put in it. */
export async function add(name: string): Promise<HouseholdResult> {
  const who = await actor();
  try {
    const made = await withTenant(who, (tx) => createHousehold(tx, who, name));
    return { id: made.id };
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R2.1. What a church calls this family. */
export async function setName(
  id: string,
  name: string,
  ): Promise<HouseholdResult> {
  const who = await actor();
  try {
    await withTenant(who, (tx) => renameHousehold(tx, who, id, name));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R2.4. Where the church writes to for this family.
 *
 * The panel that names a household had no field for it, so the address every
 * member of a family shares could be read on their own screens and set
 * nowhere. An empty street clears it.
 */
export async function setAddress(
  id: string,
  input: {
    line1: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    /** R2.4. Where the letter is going, which names the two fields above it. */
    country?: string;
  },
  ): Promise<HouseholdResult> {
  const who = await actor();
  try {
    await withTenant(who, (tx) => setHouseholdAddress(tx, who, id, input));
    revalidatePath("/settings/households");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R2.1. Putting a household away, or bringing it back. */
export async function putAway(
  id: string,
  archived: boolean,
  ): Promise<HouseholdResult> {
  const who = await actor();
  try {
    await withTenant(who, (tx) => setHouseholdArchived(tx, who, id, archived));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R2.1. People a church could put into a household: those in none. */
export async function freePeople(
  search: string,
  ): Promise<{ id: string; slug: string; name: string }[]> {
  const who = await actor();
  /*
   * SEC-022. A picker is a read of the directory, so it asks what the writes
   * beside it ask. This returned everybody in the church who is not yet in a
   * household, to any signed-in account.
   */
  if (!canManageHouseholds(who)) throw new PermissionError(who.role, "manageHouseholds");
  return withTenant(who, (tx) => peopleWithoutHousehold(tx, search));
}

/** R2.1. Putting somebody into a household from the household's own screen. */
export async function putIn(
  householdId: string,
  memberId: string,
  ): Promise<HouseholdResult> {
  const who = await actor();
  try {
    await withTenant(who, (tx) => addToHousehold(tx, who, householdId, memberId));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R2.1. What somebody is in their household. */
export async function setRole(
  householdId: string,
  memberId: string,
  role: string,
  ): Promise<HouseholdResult> {
  const who = await actor();
  try {
    await withTenant(who, (tx) => setHouseholdRole(tx, who, householdId, memberId, role));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R2.1. Taking somebody out. Their own record is untouched. */
export async function takeOut(
  householdId: string,
  memberId: string,
  ): Promise<HouseholdResult> {
  const who = await actor();
  try {
    await withTenant(who, (tx) => removeFromHousehold(tx, who, householdId, memberId));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R2.1. Two halves of one family, put back together. */
export async function fold(
  fromId: string,
  intoId: string,
  ): Promise<HouseholdResult> {
  const who = await actor();
  try {
    await withTenant(who, (tx) => mergeHouseholds(tx, who, fromId, intoId));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}
