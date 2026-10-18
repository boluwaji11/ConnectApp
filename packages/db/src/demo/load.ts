import { eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../client";
import { demoRecords, serviceTimes } from "../schema/tenancy";
import { serviceOccurrences } from "../schema/gatherings";
import { checkinRooms, checkinStations } from "../schema/checkin";
import { groups } from "../schema/groups";
import { members, households, tags } from "../schema/members";
import { createPerson, type WriteActor } from "../repo/members";
import { createTag, setPersonTag } from "../repo/tags";
import { addMilestone, type MilestoneKind } from "../repo/milestones";
import { addRelationship, type RelationshipKind } from "../repo/relationships";
import { canManageChurch, addServiceTime } from "../repo/church";
import { generateOccurrences, listOccurrences, setHeadcount, addSpecialService } from "../repo/services";
import { setPresentMany } from "../repo/attendance";
import { addRoom, ageInMonths } from "../repo/rooms";
import { addStation } from "../repo/stations";
import { checkInFamily } from "../repo/checkin";
import { seedGroupTypes, createGroup, addToGroup } from "../repo/groups";
import { seedPipelines } from "../repo/followups";
import { seedTeams, listTeams, getTeam, addToTeam } from "../repo/serving";
import { PermissionError } from "../roles";
import { InvalidInputError } from "../errors";
import { writeFund } from "../repo/funds";
import { openBatch, recordGift, closeBatch } from "../repo/giving";
import { writeAnnouncement } from "../repo/announcements";
import { createForm, addFormField, setFormStatus } from "../repo/forms";
import { createEvent, setEventStatus } from "../repo/events";
import { DEMO_PEOPLE, DEMO_TAGS } from "./members";

/**
 * R19.7. A demo church, loadable and removable.
 *
 * Time to value is the metric this serves. A church that signs up sees an empty
 * list and has no way to tell whether the product suits them without first
 * doing the work of importing. This fills it in one press and empties it in
 * another.
 *
 * Every id written is recorded, so removing is exact rather than a guess from
 * names or dates. Removal is a real delete, which is the one place the
 * archive rule does not apply: these are not the church's records, and a demo
 * you cannot get rid of is worse than no demo.
 */

export interface DemoState {
  loaded: boolean;
  members: number;
}

export async function demoState(db: Tx): Promise<DemoState> {
  const [row] = await db
    .select({ n: sql<string>`count(*) filter (where ${demoRecords.entity} = 'person')` })
    .from(demoRecords);
  const count = Number(row?.n ?? 0);
  return { loaded: count > 0, members: count };
}

export async function loadDemoData(db: Tx, actor: WriteActor): Promise<DemoState> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "manageDemoData");

  if ((await demoState(db)).loaded) throw new InvalidInputError("demo.error.alreadyLoaded");

  const remember = async (entity: string, recordId: string) => {
    await db.insert(demoRecords).values({ tenantId: actor.tenantId, entity, recordId });
  };

  // Before any person, because recording a baptism enters that person into the
  // baptism pipeline and the pipeline has to be there to enter.
  await seedPipelines(db, actor);

  const tagIds = new Map<string, string>();
  for (const tag of DEMO_TAGS) {
    const created = await createTag(db, actor, { name: tag.name, hue: tag.hue as never });
    tagIds.set(tag.name, created.id);
    await remember("tag", created.id);
  }

  // Households are created by name on the first person who lives in one, so the
  // second person in a household has to be given the id rather than the name.
  const householdIds = new Map<string, string>();
  const personIds = new Map<string, string>();

  for (const person of DEMO_PEOPLE) {
    const existing = person.household ? householdIds.get(person.household) : undefined;

    const created = await createPerson(db, actor, {
      firstName: person.firstName,
      lastName: person.lastName,
      preferredName: person.preferredName ?? null,
      dateOfBirth: person.dateOfBirth ?? null,
      lifecycleStatus: person.status,
      membershipDate: person.membershipDate ?? null,
      firstVisitOn: person.firstVisitOn ?? null,
      email: person.email ?? null,
      phone: person.phone ?? null,
      householdId: existing ?? null,
      householdName: existing ? null : (person.household ?? null),
      householdRole: person.householdRole ?? "other",
    });

    personIds.set(`${person.firstName} ${person.lastName}`, created.id);
    await remember("person", created.id);

    if (person.household && !existing) {
      const [row] = await db
        .select({ id: households.id })
        .from(households)
        .where(eq(households.name, person.household))
        .limit(1);
      if (row) {
        householdIds.set(person.household, row.id);
        await remember("household", row.id);
      }
    }

    for (const name of person.tags ?? []) {
      const tagId = tagIds.get(name);
      if (tagId) await setPersonTag(db, actor, created.id, tagId, true);
    }

    for (const milestone of person.milestones ?? []) {
      await addMilestone(db, actor, {
        memberId: created.id,
        kind: milestone.kind as MilestoneKind,
        occurredOn: milestone.on,
      });
    }
  }

  // Relationships last, because both members have to exist first.
  for (const person of DEMO_PEOPLE) {
    const id = personIds.get(`${person.firstName} ${person.lastName}`);
    if (!id) continue;
    for (const relation of person.relationships ?? []) {
      const other = personIds.get(relation.to);
      if (!other) continue;
      try {
        await addRelationship(db, actor, {
          memberId: id,
          relatedMemberId: other,
          kind: relation.kind as RelationshipKind,
        });
      } catch (error) {
        // The inverse of a relationship already written is a duplicate, which
        // is the right answer rather than a failure.
        if (!(error instanceof InvalidInputError)) throw error;
      }
    }
  }

  await loadServices(db, actor, remember, [...personIds.values()]);

  return demoState(db);
}

/**
 * The demo church's own clock. It is in Chicago, which is what `buildDemoChurch`
 * gives it, and every screen in the product reads a date in the church's
 * timezone rather than in UTC.
 */
const DEMO_ZONE = "America/Chicago";

/** Today where the church is, which after 19:00 there is not today in UTC. */
function demoToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEMO_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return new Date(`${parts}T00:00:00Z`);
}

/**
 * A date, counting back from today, as the church would read it.
 *
 * It counted back from UTC, so a template built after seven in the evening in
 * Chicago gave the demo a service "today" that the check-in screen read as
 * tomorrow, and a visitor met "Nothing on today" on a church whose whole point
 * was showing a service running.
 */
const daysAgo = (n: number): string => {
  const d = demoToday();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * The rest of what an owner sees: a calendar, attendance against it, the rooms
 * children are checked into, and a station.
 *
 * A demo that is a directory beside four empty screens shows a church nothing
 * about whether the product suits them. Everything here is written through the
 * same functions the product uses, so a demo cannot drift into showing
 * something the church would not get.
 */
async function loadServices(
  db: Tx,
  actor: WriteActor,
  remember: (entity: string, recordId: string) => Promise<void>,
  members: string[],
): Promise<void> {
  const pattern = [
    { name: "First service", dayOfWeek: 0, startsAt: "09:00" },
    { name: "Second service", dayOfWeek: 0, startsAt: "11:00" },
    { name: "Midweek", dayOfWeek: 3, startsAt: "19:00" },
  ];
  for (const time of pattern) {
    const created = await addServiceTime(db, actor, time);
    await remember("serviceTime", created.id);
  }

  // Ten weeks back and four forward, so the page opens on a month with both a
  // history to read and something still to come.
  await generateOccurrences(db, actor, { from: daysAgo(70), to: daysAgo(-28) });

  const held = (await listOccurrences(db, { from: daysAgo(70), to: daysAgo(1) }))
    .sort((a, b) => a.occursOn.localeCompare(b.occursOn));

  for (const [index, occurrence] of held.entries()) {
    const midweek = occurrence.startsAt >= "18:00";
    // A visitor is waiting while this runs, and every service written is
    // another round trip. Four weeks of records is enough to read.
    if (occurrence.occursOn < daysAgo(28)) continue;

    // Names at the main service, a headcount midweek, which is how a church this size
    // actually records the two.
    if (!midweek) {
      // A different two thirds each week, rather than the same list every
      // time.
      const present = members.filter((_, i) => (i + index) % 3 !== 0);
      if (present.length) await setPresentMany(db, actor, occurrence.id, present, true);
    }

    if (midweek) {
      await setHeadcount(db, actor, occurrence.id, {
        adults: 40 + (index % 7) * 3,
        children: 12 + (index % 4),
        visitors: index % 3,
        note: null,
      });
    }
  }

  const rooms = [
    { name: "Nursery", hue: "amber", minAgeMonths: 0, maxAgeMonths: 24, capacity: 12, ratio: 4 },
    { name: "Toddlers", hue: "fern", minAgeMonths: 24, maxAgeMonths: 48, capacity: 16, ratio: 5 },
    { name: "Kids", hue: "sky", minAgeMonths: 48, maxAgeMonths: 144, capacity: 30, ratio: 8 },
    { name: "Youth", hue: "violet", minAgeMonths: 144, maxAgeMonths: 216, capacity: 25, ratio: 10 },
  ];
  const roomIds: string[] = [];
  for (const room of rooms) {
    const created = await addRoom(db, actor, room);
    roomIds.push(created.id);
    await remember("room", created.id);
  }

  const station = await addStation(db, actor, {
    name: "Foyer desk", mode: "desk", printer: "paper", roomIds: [], serviceTimeIds: [],
  });
  await remember("station", station.id);

  await loadTodaysService(db, actor, remember, station.id, roomIds, members);
  await loadGroups(db, actor, remember, members);
  await loadServing(db, actor, members);
}

/**
 * R10.1. People on the teams the church already has.
 *
 * The teams themselves come with the church, so nothing here is remembered as
 * a demo record: emptying the demo takes the roster off and leaves the teams,
 * which is what a church wants, since they will use them.
 */
async function loadServing(db: Tx, actor: WriteActor, everyone: string[]): Promise<void> {
  await seedTeams(db, actor);

  const wanted = ["Worship", "Production", "Welcome"];
  const teams = (await listTeams(db)).filter((t) => wanted.includes(t.name));

  let at = 0;
  for (const summary of teams) {
    const team = await getTeam(db, summary.id);
    if (!team) continue;

    // Three a team, the first of them leading it, each playing one position.
    for (let i = 0; i < 3 && at < everyone.length; i += 1, at += 1) {
      await addToTeam(db, actor, {
        teamId: team.id,
        memberId: everyone[at]!,
        role: i === 0 ? "leader" : "member",
        positionIds: team.positions[i] ? [team.positions[i]!.id] : [],
      });
    }
  }
}

/**
 * R9.1 to R9.4. Two groups, with the members who are in them.
 *
 * Two rather than ten, because a demo full of groups nobody can read teaches a
 * church less than two they can open and understand.
 */
async function loadGroups(
  db: Tx,
  actor: WriteActor,
  remember: (entity: string, recordId: string) => Promise<void>,
  everyone: string[],
): Promise<void> {
  const types = await seedGroupTypes(db, actor);
  const small = types.find((t) => t.name === "Small group") ?? types[0];
  const team = types.find((t) => t.name === "Ministry team") ?? types[0];

  const tuesday = await createGroup(db, actor, {
    name: "Tuesday night",
    description: "A small group that meets in the Hall.",
    typeId: small?.id ?? null,
    dayOfWeek: 2,
    startsAt: "19:30",
    frequency: "weekly",
    location: "The Hall",
    capacity: 14,
  });
  await remember("group", tuesday.id);

  const welcome = await createGroup(db, actor, {
    name: "Welcome team",
    description: "On the door before each service.",
    typeId: team?.id ?? null,
    dayOfWeek: 0,
    startsAt: "08:30",
    frequency: "weekly",
    location: "The foyer",
  });
  await remember("group", welcome.id);

  for (const [index, memberId] of everyone.slice(0, 9).entries()) {
    await addToGroup(db, actor, {
      groupId: index % 2 === 0 ? tuesday.id : welcome.id,
      memberId,
      role: index < 2 ? "leader" : "member",
    });
  }
}

/**
 * A service happening today, with children in rooms.
 *
 * Without it a visitor arriving on a Tuesday opens check-in and the supervisor
 * board and sees two empty screens with nothing wrong, which reads as the
 * product not working. The service is written through the same functions a
 * church uses, so what the demo shows is what a church would get.
 */
async function loadTodaysService(
  db: Tx,
  actor: WriteActor,
  remember: (entity: string, recordId: string) => Promise<void>,
  stationId: string,
  roomIds: string[],
  everyone: string[],
): Promise<void> {
  const today = daysAgo(0);
  const occurrence = await addSpecialService(db, actor, {
    name: "Morning gathering",
    occursOn: today,
    startsAt: "09:00",
    note: null,
  });
  await remember("occurrence", occurrence.id);

  const rows = await db
    .select({ id: members.id, dateOfBirth: sql<string | null>`${members.dateOfBirth}::text` })
    .from(members)
    .where(inArray(members.id, everyone));

  const months = (dob: string | null) => (dob ? ageInMonths(dob, today) : null);
  const children = rows.filter((r) => {
    const age = months(r.dateOfBirth);
    return age !== null && age < 18 * 12;
  });
  const adults = rows.filter((r) => {
    const age = months(r.dateOfBirth);
    return age === null || age >= 18 * 12;
  });

  const roomFor = (index: number) => roomIds[index % roomIds.length] ?? null;

  const entries = [
    ...children.slice(0, 8).map((child, i) => ({
      memberId: child.id,
      roomId: roomFor(i),
      child: true,
    })),
    // Adults on the attendance, wearing a name badge, in no class.
    ...adults.slice(0, 3).map((adult) => ({
      memberId: adult.id,
      roomId: null,
      child: false,
    })),
  ];

  if (entries.length > 0) {
    await checkInFamily(db, actor, { occurrenceId: occurrence.id, stationId, entries });
  }
}

export interface DemoRemoval {
  members: number;
  households: number;
  tags: number;
}

/**
 * Takes the demo church away.
 *
 * Records added since are left alone, because only the ids this wrote are
 * removed. A person the church added to a demo household keeps their record;
 * the household goes and they are left without one, which is visible and
 * fixable, rather than the person disappearing with it.
 */
export async function removeDemoData(db: Tx, actor: WriteActor): Promise<DemoRemoval> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "manageDemoData");

  const rows = await db
    .select({ entity: demoRecords.entity, recordId: demoRecords.recordId })
    .from(demoRecords);

  const ids = (entity: string) =>
    rows.filter((r) => r.entity === entity).map((r) => r.recordId);

  const personIds = ids("person");
  const householdIds = ids("household");
  const tagIds = ids("tag");
  const serviceTimeIds = ids("serviceTime");
  const occurrenceIds = ids("occurrence");
  const groupIds = ids("group");
  const roomIds = ids("room");
  const stationIds = ids("station");

  // People first. Their contacts, tags, milestones, relationships and notes go
  // with them through the foreign keys.
  const gonePeople = personIds.length
    ? await db.delete(members).where(inArray(members.id, personIds)).returning({ id: members.id })
    : [];
  const goneTags = tagIds.length
    ? await db.delete(tags).where(inArray(tags.id, tagIds)).returning({ id: tags.id })
    : [];
  const goneHouseholds = householdIds.length
    ? await db.delete(households).where(inArray(households.id, householdIds)).returning({ id: households.id })
    : [];

  // The calendar and the rooms. Occurrences and attendance go with the service
  // time through the foreign keys, and so do a station's rooms and services.
  // A one-off service has no service time behind it, so it is named here, and
  // the check-in visits against it go with it.
  if (occurrenceIds.length) {
    await db.delete(serviceOccurrences).where(inArray(serviceOccurrences.id, occurrenceIds));
  }
  if (groupIds.length) {
    await db.delete(groups).where(inArray(groups.id, groupIds));
  }
  if (stationIds.length) {
    await db.delete(checkinStations).where(inArray(checkinStations.id, stationIds));
  }
  if (roomIds.length) {
    await db.delete(checkinRooms).where(inArray(checkinRooms.id, roomIds));
  }
  if (serviceTimeIds.length) {
    await db.delete(serviceOccurrences).where(inArray(serviceOccurrences.serviceTimeId, serviceTimeIds));
    await db.delete(serviceTimes).where(inArray(serviceTimes.id, serviceTimeIds));
  }

  await db.delete(demoRecords);

  return {
    members: gonePeople.length,
    households: goneHouseholds.length,
    tags: goneTags.length,
  };
}

/**
 * HRT-416. The rest of the product, so a demo shows what a church is buying.
 *
 * The demo filled people, services, attendance, check-in, groups and serving,
 * and left giving, announcements, forms and events empty. Giving and messaging
 * are what a church asks about first, and an empty Giving screen in a demo
 * reads as a product that cannot do it.
 *
 * Nothing here can reach a person or a card. The church has no messaging
 * credentials, so an announcement is read in the product and sent nowhere, and
 * it has no Stripe account, so the gifts are the ones a treasurer types in
 * after counting a bag.
 */
export async function loadDemoExtras(db: Tx, actor: WriteActor): Promise<void> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "manageDemoData");

  const people = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.tenantId, actor.tenantId));
  const everyone = people.map((row) => row.id);

  await loadGiving(db, actor, everyone);
  await loadNotices(db, actor);
  await loadForms(db, actor);
  await loadEvents(db, actor);
}

/**
 * R13.9 to R13.15. Funds, two counted services, and the gifts in them.
 *
 * Counted rather than online: a demo church has no Stripe account, and a
 * counting session is the half of giving every church does whether or not it
 * takes a card.
 */
async function loadGiving(db: Tx, actor: WriteActor, everyone: string[]): Promise<void> {
  const general = await writeFund(db, actor, {
    name: "General fund",
    description: "Where a gift goes when the giver does not say.",
  });
  const building = await writeFund(db, actor, {
    name: "Building fund",
    restricted: true,
    description: "Kept for the roof.",
  });
  const missions = await writeFund(db, actor, { name: "Missions", restricted: true });

  /* Two weeks of counting, so the screen has a figure for this month and the
     one before it, and the year total is not the same number twice. */
  const weeks = [
    { on: daysAgo(6), name: "Sunday count" },
    { on: daysAgo(13), name: "Sunday count" },
  ];

  for (const [week, when] of weeks.entries()) {
    const batch = await openBatch(db, actor, { name: when.name, receivedOn: when.on });
    /* A spread of amounts and methods, because a column of identical gifts
       teaches a reader nothing about what the screen does. */
    const giving = [
      { fund: general.id, cents: 25_000, method: "cheque", reference: "2041" },
      { fund: general.id, cents: 10_000, method: "cash" },
      { fund: general.id, cents: 5_000, method: "cash" },
      { fund: building.id, cents: 50_000, method: "cheque", reference: "2042" },
      { fund: missions.id, cents: 7_500, method: "cash" },
      { fund: general.id, cents: 12_000, method: "cheque", reference: "2043" },
    ];

    for (const [at, gift] of giving.entries()) {
      await recordGift(db, actor, {
        fundId: gift.fund,
        batchId: batch.id,
        amountCents: gift.cents,
        method: gift.method as never,
        reference: gift.reference ?? null,
        receivedOn: when.on,
        /* Named where the church knows who gave, anonymous where it does not,
           which is what a bag actually holds. */
        memberId: at < 4 ? (everyone[(week * 4 + at) % everyone.length] ?? null) : null,
      });
    }

    await closeBatch(db, actor, batch.id);
  }
}

/** R16.x. Something on the noticeboard, which is what the portal opens on. */
async function loadNotices(db: Tx, actor: WriteActor): Promise<void> {
  await writeAnnouncement(db, actor, {
    title: "Church lunch after the late service",
    body: "Everyone is welcome. Bring a dish if you can, and come anyway if you cannot.",
    hue: "amber",
    pinned: true,
  });
  await writeAnnouncement(db, actor, {
    title: "Volunteers needed in the car park",
    body: "Half an hour before the service, once a month. Speak to the welcome team.",
    hue: "fern",
  });
}

/** R4.x. A form a church actually uses, with its questions. */
async function loadForms(db: Tx, actor: WriteActor): Promise<void> {
  const form = await createForm(db, actor, {
    name: "Connection card",
    intro: "Welcome. Tell us who you are and we will be in touch this week.",
    thanks: "Thank you. Somebody will be in touch.",
    hue: "sky",
  });

  const asked: { kind: string; label: string; required?: boolean; options?: string[] }[] = [
    { kind: "text", label: "First name", required: true },
    { kind: "text", label: "Last name", required: true },
    { kind: "email", label: "Email address" },
    { kind: "phone", label: "Phone" },
    { kind: "select", label: "Is this your first visit?", options: ["Yes", "No"] },
    { kind: "long_text", label: "Anything we can pray for?" },
  ];
  for (const question of asked) {
    await addFormField(db, actor, form.id, {
      kind: question.kind as never,
      label: question.label,
      required: question.required ?? false,
      options: question.options ?? null,
    });
  }
  await setFormStatus(db, actor, form.id, "open");
}

/** R15.x. Something in the diary, open for people to put their name down. */
async function loadEvents(db: Tx, actor: WriteActor): Promise<void> {
  /** Forward from the church's own today, for the same reason as daysAgo. */
  const inDays = (n: number): string => daysAgo(-n);

  const weekend = await createEvent(db, actor, {
    name: "Church weekend away",
    description: "Two nights, all ages, and somebody else does the cooking.",
    hue: "violet",
    startsOn: inDays(38),
    endsOn: inDays(40),
    location: "Oakwood Retreat Centre",
    listed: true,
    takesRegistrations: true,
    capacity: 60,
  });

  const quiz = await createEvent(db, actor, {
    name: "Quiz night",
    description: "Teams of six. Bring your own snacks.",
    hue: "citron",
    startsOn: inDays(12),
    startsAt: "19:00",
    location: "Church hall",
    listed: true,
    takesRegistrations: true,
    capacity: 80,
  });

  /* R15.x. Published, because a diary of drafts shows a church the screen
     rather than the thing the screen is for. */
  for (const event of [weekend, quiz]) {
    await setEventStatus(db, actor, event.id, "published");
  }
}
