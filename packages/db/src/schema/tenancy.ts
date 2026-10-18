import {
  pgTable, uuid, text, boolean, integer, bigint, date, timestamp, uniqueIndex, index, jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { hue, tenantRole } from "./enums";
import type { SiteDoc } from "../repo/site-doc";

export type WebsiteSectionType =
  | "hero" | "story" | "banner" | "image" | "video" | "services" | "contact";

export interface WebsiteSection {
  id: string;
  type: WebsiteSectionType;
  title: string;
  body: string;
  imageUrl: string | null;
  imageKey?: string | null;
  videoUrl: string | null;
  videoKey?: string | null;
  alt: string;
  linkLabel?: string | null;
  linkUrl?: string | null;
}

const pk = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

/** The tenant. Every other table carries tenant_id and an RLS policy. */
export const tenants = pgTable(
  "tenants",
  {
    id: pk(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    /**
     * R1.1, R13.1. The number the church is registered under: an EIN in the
     * United States, a charity number in the United Kingdom, an ABN in
     * Australia.
     *
     * Asked for once and read from here by everything that needs it. Opening a
     * giving account asks for it, and so does registering to send texts, and a
     * volunteer who would have hunted for the paperwork twice hunts once.
     *
     * Read only by a role carrying `church.manage`. The query layer leaves the
     * field off the record for everybody else (R1.5).
     */
    taxId: text("tax_id"),
    timezone: text("timezone").notNull().default("America/Chicago"),
    /** R1.1. One address. A church with two buildings has two campuses (R1.2). */
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("US"),
    phone: text("phone"),
    /** R1.1. Where somebody reading a public page writes to. */
    email: text("email"),
    website: text("website"),
    /**
     * R22.1, R22.2. Whether they told us they have one.
     *
     * Null is "never asked", which every church from before the question
     * holds. False is a church that said no and is owed a page of ours.
     */
    hasWebsite: boolean("has_website"),
    /**
     * R9.5. Where that website is built, which is not always who sold them
     * the name. Free text: a church on something obscure still has a site.
     */
    siteBuilder: text("site_builder"),
    /**
     * R7.6. How many held services somebody misses in a row before the church
     * wants to know. Three by default, which is roughly a month of services.
     */
    absenceThreshold: integer("absence_threshold").notNull().default(3),
    /** R1.1. One of the twelve hues, used wherever the church brands a page. */
    brandHue: hue("brand_hue").notNull().default("indigo"),
    /** R1.1. The key of the logo in the church bucket. */
    logoKey: text("logo_key"),
    /**
     * R19.7. Set only on a demo church, to the moment it stops existing.
     *
     * A demo is a whole church of its own rather than a mode inside a real one,
     * because the only safe place for invented members is somewhere nobody could
     * mistake for their own records.
     */
    demoExpiresAt: timestamp("demo_expires_at", { withTimezone: true }),
    /** When a visitor took this demo church. Null while it waits in the pool. */
    demoClaimedAt: timestamp("demo_claimed_at", { withTimezone: true }),
    /**
     * R1.16. Hard, enforced, visible. Two gibibytes, which is a logo, a few
     * hundred photos and the documents a church of this size actually keeps.
     * Sermon video is a non-goal: link to YouTube.
     */
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" })
      .notNull().default(2147483648),
    /**
     * R22.1. The setup wizard is answered by looking at the church's records,
     * so there is no progress to store. These two are the things no query can
     * find out: that a church has no kids' classes and does not want to be
     * asked again, and that somebody put the whole thing away.
     */
    setupDismissedAt: timestamp("setup_dismissed_at", { withTimezone: true }),
    setupSkipped: text("setup_skipped").array(),
    /**
     * R1.7, R22.1. Whether somebody can make an account from the church's own
     * address.
     *
     * This replaced a join code. A code was a shared password: it never
     * expired, it was used any number of times, and anybody who had ever seen
     * it had a way in forever. The church is named by the URL now, so there is
     * nothing to leak and nothing to rotate. Off means the door is shut and
     * invitations are the only way in.
     */
    selfSignup: boolean("self_signup").notNull().default(true),
    /**
     * R13.18. Whether a year-end statement is written a person or a household.
     *
     * Both are right for somebody: a couple who give on one card want one
     * statement, and a church whose givers file separately wants two.
     */
    statementsBy: text("statements_by").notNull().default("person"),
    /**
     * R1.1, R17.1. The church's own address for its members' screens.
     *
     * A member reading their serving dates on the church's own host is on the
     * church's site rather than on ours, and the session cookie is first-party,
     * which is the only way the signed-in screens can live inside a church's
     * domain at all. Compared against the Host header, so it is stored the way
     * that header arrives: lower case, no scheme, no path.
     */
    customDomain: text("custom_domain"),
    /**
     * R1.1, R17.1. The name a church chose for its members' address.
     *
     * Members sign in at `<portal_name>.connectapp.church`. Null until the
     * church picks one, and the slug answers in the meantime, so every church
     * has an address from the day it signs up.
     */
    portalName: text("portal_name"),
    /**
     * R1.1, R17.1. Whether that address answers.
     *
     * Off while a church is still getting ready, and nobody reaches it. Staff
     * work at the main address either way, so turning it off takes nothing
     * away from running the week.
     */
    portalOpen: boolean("portal_open").notNull().default(true),
    /**
     * R8.11. What goes on a child's label.
     *
     * The church's own layout rather than the station's, because a parent who
     * collects from two different doors should be handed the same label, and a
     * tablet swapped out at 9:55 should print what the one before it printed.
     */
    labelShowRoom: boolean("label_show_room").notNull().default(true),
    labelShowAllergies: boolean("label_show_allergies").notNull().default(true),
    labelShowCode: boolean("label_show_code").notNull().default(true),
    labelShowService: boolean("label_show_service").notNull().default(true),
    labelParentTag: boolean("label_parent_tag").notNull().default(true),
    /** One of LABEL_SIZES. The stock the church loads into its printer. */
    labelSize: text("label_size").notNull().default("brother_24x11"),
    /**
     * R1.1, R21.x. When a human looked at this church and said it is a church.
     *
     * Null means provisional, which is where every new church starts. A
     * provisional church works for the person who made it and is capped: a
     * small number of members, no join link, no invitations. A real church is
     * unblocked in an hour, which is what the sixty-minute time-to-value
     * number needs. An abuser gets nothing worth having.
     *
     * Not a queue with a task on somebody. That was built and taken out on the
     * same day, because it put work on a volunteer every time a regular signed
     * up for a door the church had already chosen to open.
     */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("tenants_slug_key").on(t.slug)],
);

/**
 * HRT-377, R22.2. The church's website, as a draft and a live copy.
 *
 * `draft` is what the editor works on and `live` is what the public page is
 * rendered from, both whole documents whose shape is in repo/site-doc.ts.
 * `draftVersion` is the number a save has to carry, so two administrators
 * editing at once are told rather than one of them losing the afternoon.
 */
export const churchSites = pgTable("church_sites", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  draft: jsonb("draft").$type<SiteDoc>().notNull(),
  draftVersion: integer("draft_version").notNull().default(1),
  live: jsonb("live").$type<SiteDoc | null>(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedBy: uuid("published_by"),
  createdAt: created(),
  updatedAt: updated(),
  updatedBy: uuid("updated_by"),
});

/** R22.2. Every publish, kept, so a church can go back to one. */
export const churchSiteRevisions = pgTable(
  "church_site_revisions",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    doc: jsonb("doc").$type<SiteDoc>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    publishedBy: uuid("published_by"),
    note: text("note"),
  },
  (table) => [index("church_site_revision_tenant_idx").on(table.tenantId, table.publishedAt)],
);

/**
 * HRT-285. Structured configuration for the church's public homepage.
 */
export const churchWebsites = pgTable("church_websites", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  published: boolean("published").notNull().default(false),
  layout: text("layout").notNull().default("gathering"),
  sections: jsonb("sections").$type<WebsiteSection[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: updated(),
});

/**
 * R1.1. When the church gathers.
 *
 * A table rather than a text field, because attendance (R7.3), check-in (R8.x)
 * and the service plans in R11 all hang off a specific service on a specific
 * day. A church with an 09:00 and an 11:00 counts them separately, always has,
 * and a free-text "Sundays 9 & 11" cannot be counted.
 */
export const serviceTimes = pgTable(
  "service_times",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    campusId: uuid("campus_id").references(() => campuses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 0 is Sunday, matching JavaScript and Postgres `dow`. */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Local to the church's timezone, as HH:MM. */
    startsAt: text("starts_at").notNull(),
    /**
     * R7.1. "weekly", "fortnightly" or "monthly". Monthly means the same
     * weekday of the month, so a second Tuesday stays a second Tuesday rather
     * than drifting to a date that lands on a Saturday.
     */
    frequency: text("frequency").notNull().default("weekly"),
    /**
     * The first date, which fixes the pattern. Fortnightly counts from it, and
     * monthly takes its place in the month from it.
     */
    anchorOn: date("anchor_on"),
    /** R7.1. When it stops. Null means it carries on. */
    untilOn: date("until_on"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("service_times_tenant_idx").on(t.tenantId)],
);

/**
 * R1.2. Campus and location exist from the first migration even though v1 exposes
 * a single campus. Adding a tenancy dimension later touches every query.
 */
export const campuses = pgTable(
  "campuses",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("campuses_tenant_idx").on(t.tenantId)],
);

export const locations = pgTable(
  "locations",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    campusId: uuid("campus_id").notNull().references(() => campuses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: created(),
  },
  (t) => [index("locations_tenant_idx").on(t.tenantId)],
);

/**
 * Rooms own a hue. It prints on the child's check-in label and tints the room
 * card, so a volunteer directs a parent by colour rather than by reading a
 * name. (R8.14, R24.5)
 */
export const rooms = pgTable(
  "rooms",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hue: hue("hue").notNull(),
    minAgeMonths: integer("min_age_months"),
    maxAgeMonths: integer("max_age_months"),
    capacity: integer("capacity"),
    /** R8.16. Configurable per age band. */
    volunteerRatio: integer("volunteer_ratio"),
    createdAt: created(),
  },
  (t) => [index("rooms_tenant_idx").on(t.tenantId)],
);

/**
 * Mirrors the Supabase Auth user. Global, so no tenant_id: a person can belong
 * to more than one church over time. Authorization lives in tenant_members.
 */
export const appUsers = pgTable(
  "app_users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    /**
     * R24.x. Which palette they read in: system, light or dark.
     *
     * Null until they choose. It belongs to the person rather than to a
     * browser, so a choice made on the church laptop is waiting on their
     * phone.
     */
    theme: text("theme"),
    /**
     * R1.8. When they finished setting up two-step verification, or null.
     *
     * Supabase holds the factor itself. This is a mirror of the one fact every
     * request needs: whether a session that has only presented a password is
     * finished. Asking Supabase costs a round trip on every navigation, and
     * this is read in the same breath as the memberships.
     *
     * A mirror can drift, so the screen that acts on it checks the factors
     * themselves before it refuses anybody, and clears this where Supabase
     * says there is nothing to present.
     */
    mfaEnrolledAt: timestamp("mfa_enrolled_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("app_users_email_key").on(t.email)],
);

/**
 * R1.8. The way back in when the phone is gone.
 *
 * Ten codes, shown once at enrolment and never again. Only the hash is kept,
 * so this table being read gives nobody a way in, and a code is spent the
 * first time it works.
 *
 * It belongs to a person rather than to a church, so it carries no tenant_id
 * and gets no tenant policy. It is read before a tenant context exists, on the
 * owner connection, the same way a membership is. RLS is on with no policy and
 * the application role is revoked outright: nothing in a request path reaches
 * it.
 */
export const accountRecoveryCodes = pgTable(
  "account_recovery_codes",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
    /** SHA-256 of the code, lowercased and stripped of its separator. */
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index("account_recovery_codes_user_idx").on(t.userId)],
);

/**
 * The membership join. RLS isolates by tenant. Whether a user may set a given
 * tenant as their context is checked in the application layer before the
 * session variable is set. (docs/architecture.md)
 */
/**
 * R1.6. The roles this church has, built-in and its own.
 *
 * A role is a name and a set of permissions. The nine built-ins are written in
 * here for every church so the matrix is one list rather than two, and so a
 * church can see the built-in beside the one it wrote.
 *
 * `builtin` marks the nine. Their permissions are the product's answer and
 * cannot be edited, because a church that quietly removes "run check-in" from
 * Check-in volunteer has broken a service rather than configured one.
 */
export const tenantRoles = pgTable(
  "tenant_roles",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    /** The built-in's own name, such as "staff", or a slug for a custom role. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** Permission keys from packages/db/src/permissions.ts. */
    permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
    builtin: boolean("builtin").notNull().default(false),
    /**
     * R1.6. Whether this church has changed a built-in from what ConnectApp ships.
     *
     * An untouched built-in keeps following the product, so a permission we add
     * later reaches a church that has been running for a year. One a church has
     * edited is theirs, and we stop writing to it.
     */
    customised: boolean("customised").notNull().default(false),
    position: integer("position").notNull().default(0),
    /** R1.6. Archived, never deleted: somebody held this role, and the log says so. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    index("tenant_roles_tenant_idx").on(t.tenantId),
    uniqueIndex("tenant_roles_key_unique").on(t.tenantId, t.key),
  ],
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
    /**
     * R1.4. The built-in role. Kept alongside role_id because it is what the
     * audit log records and what a path that has not been handed the permission
     * set falls back to. A member on a custom role holds "member" here, so
     * anything reading this column alone fails closed.
     */
    role: tenantRole("role").notNull().default("staff"),
    /** R1.6. The role this member actually holds, built-in or custom. */
    roleId: uuid("role_id").references(() => tenantRoles.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("tenant_members_unique").on(t.tenantId, t.userId)],
);

/**
 * R1.16. Every object this church has stored, and how big it is.
 *
 * A ledger of our own rather than asking the storage service, because the quota
 * has to be checked before an upload rather than found out afterwards, and
 * because a row here is what makes an orphaned object visible. The object store
 * holds the bytes; this table is the record that they exist.
 */
export const storedFiles = pgTable(
  "stored_files",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull().default("church"),
    /** The path inside the bucket, which begins with the church's slug. */
    key: text("key").notNull(),
    /** What it is for: "logo", "person_photo". Drives where it may be shown. */
    purpose: text("purpose").notNull(),
    contentType: text("content_type").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [
    index("stored_files_tenant_idx").on(t.tenantId),
    uniqueIndex("stored_files_key").on(t.bucket, t.key),
  ],
);

/**
 * R19.7. What the demo data set put here, so removing it is exact.
 *
 * A church exploring the product should be able to fill it, look around and
 * empty it again without wondering what was theirs. Recording the ids is the
 * only way to answer that without guessing from names or dates.
 */
export const demoRecords = pgTable(
  "demo_records",
  {
    id: pk(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    /** "person", "household" or "tag". */
    entity: text("entity").notNull(),
    recordId: uuid("record_id").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("demo_records_tenant_idx").on(t.tenantId),
    uniqueIndex("demo_records_unique").on(t.tenantId, t.entity, t.recordId),
  ],
);
