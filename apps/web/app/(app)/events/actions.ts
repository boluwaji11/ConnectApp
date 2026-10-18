"use server";

import {
  withTenant, createEvent, updateEvent, setEventStatus, setEventArchived,
  setEventRegistrationOpen, setEventHue, setEventCover, setEventForm,
  getChurch, lookupPeople,
  type EventInput, type EventStatus, canManageEvents, PermissionError,
} from "@connectapp/db";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { churchNow } from "@/lib/church-now";

async function context() {
  const session = await requireSession();
  const actor = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
  return { actor, ctx: actor };
}

export interface EventResult {
  /** R24.6. Its readable address, for where to go once it is saved. */
  slug?: string;
  error?: string;
  id?: string;
}

/** What the form posts, as the editor writes it. */
function read(data: FormData): EventInput {
  const text = (key: string) => {
    const value = data.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const flag = (key: string) => data.get(key) === "on" || data.get(key) === "true";
  const number = (key: string) => {
    const value = text(key);
    return value === null ? null : Number(value);
  };

  return {
    name: text("name") ?? "",
    description: text("description"),
    hue: text("hue"),
    startsOn: text("startsOn") ?? "",
    startsAt: text("startsAt"),
    endsOn: text("endsOn"),
    endsAt: text("endsAt"),
    location: text("location"),
    addressLine1: text("addressLine1"),
    addressLine2: text("addressLine2"),
    city: text("addressCity"),
    region: text("addressRegion"),
    postalCode: text("addressPostalCode"),
    country: text("addressCountry"),
    takesRegistrations: flag("takesRegistrations"),
    registrationOpen: flag("registrationOpen"),
    registrationClosesOn: text("registrationClosesOn"),
    registrationClosesAt: text("registrationClosesAt"),
    capacity: number("capacity"),
    showCapacity: flag("showCapacity"),
    campusId: text("campusId"),
    formId: text("formId"),
  };
}

export async function createEventFrom(data: FormData): Promise<EventResult> {
  const { actor, ctx } = await context();
  try {
    const made = await withTenant(ctx, (tx) => createEvent(tx, actor, read(data)));
    return { id: made.id, slug: made.slug };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function saveEvent(data: FormData): Promise<EventResult> {
  const id = String(data.get("id") ?? "");
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => updateEvent(tx, actor, id, read(data)));
    return { id };
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function publishEvent(
  id: string,
  status: EventStatus,
  ): Promise<EventResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setEventStatus(tx, actor, id, status));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function openEventRegistration(
  id: string,
  open: boolean,
  ): Promise<EventResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setEventRegistrationOpen(tx, actor, id, open));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function recolourEvent(
  id: string,
  hue: string,
  ): Promise<EventResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setEventHue(tx, actor, id, hue));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function clearEventCover(id: string): Promise<EventResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setEventCover(tx, actor, id, null));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export async function archiveEvent(
  id: string,
  archived: boolean,
  ): Promise<EventResult> {
  const { actor, ctx } = await context();
  try {
    await withTenant(ctx, (tx) => setEventArchived(tx, actor, id, archived));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}


export interface PersonHit {
  id: string;
  name: string;
}

/** R14.1. Who to ask about an event, looked up the way every person field is. */
export async function findEventContact(
  query: string,
  ): Promise<PersonHit[]> {
  const session = await requireSession();
  const ctx = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };
  try {
    return await withTenant(ctx, async (tx) => {
      const profile = await getChurch(tx, session.tenantId);
      const asOf = churchNow(profile?.timezone ?? "America/Chicago").date;
      const matches = await lookupPeople(tx, query, { asOf, limit: 10 });
      return matches.map((one) => ({
        id: one.person.id,
        name: `${one.person.name} ${one.person.lastName}`,
      }));
    });
  } catch {
    return [];
  }
}


/**
 * R14.5. Writes the chosen form onto the event there and then.
 *
 * Pressing Save in the panel means the form is linked, so it is written rather
 * than held until the whole designer is saved. Everything else on the screen is
 * left alone, because somebody halfway through writing a description did not
 * ask for it to be saved.
 */
export async function attachEventForm(
  eventId: string,
  formId: string | null,
  ): Promise<EventResult> {
  const { actor, ctx } = await context();
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
    if (!canManageEvents(actor)) throw new PermissionError(actor.role, "manageEvents");

  try {
    await withTenant(ctx, (tx) => setEventForm(tx, actor, eventId, formId));
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}
