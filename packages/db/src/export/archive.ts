import { sql } from "drizzle-orm";
import type { Tx } from "../client";
import {
  canReadConfidentialNotes, canReadGivingAmounts, canArchivePeople, PermissionError,
  type TenantRole, type Permission, type Who,
} from "../roles";
import { decryptNote } from "../crypto";
import { toCsv } from "./csv";

/**
 * R19.8. A complete export of everything, one click, always available.
 *
 * This is not a feature, it is the trust mechanism. The whole free-forever
 * argument rests on a church being able to leave whenever they want, and a
 * promise they cannot test is not worth anything. So: no plan gate, no support
 * ticket, no delay, and open formats a spreadsheet can open.
 *
 * Written so that what comes out could be read back in. Every table carries its
 * own ids, so the relationships survive the round trip rather than being flattened
 * into something only a human can interpret.
 */

/** Every table that holds this church's data. Order is the order it is written. */
const TABLES = [
  "tenants",
  "campuses",
  "locations",
  "rooms",
  "service_times",
  "service_occurrences",
  "attendance_records",
  "checkin_rooms",
  "checkin_stations",
  "checkin_station_rooms",
  "checkin_station_services",
  "checkin_visits",
  "checkin_overrides",
  "checkin_codes",
  "checkin_offline_events",
  "incident_reports",
  "group_types",
  "groups",
  "group_memberships",
  "group_meetings",
  "group_attendance",
  "group_join_requests",
  "pipelines",
  "pipeline_steps",
  "pipeline_entries",
  "follow_ups",
  "directory_preferences",
  "saved_lists",
  "saved_list_members",
  "teams",
  "team_positions",
  "team_members",
  "team_member_positions",
  "serving_assignments",
  "blockout_dates",
  "serving_preferences",
  "service_plans",
  "plan_items",
  "plan_item_notes",
  "plan_item_files",
  "plan_templates",
  "plan_template_items",
  "forms",
  "form_fields",
  "form_submissions",
  "church_websites",
  /* R19.1. The church's website, which is its own words and its own design. A
     church taking its records elsewhere takes its website with them. */
  "church_sites",
  "church_site_revisions",
  "stored_files",
  "demo_records",
  "tenant_members",
  "invitations",
  "households",
  "members",
  "household_memberships",
  "contact_methods",
  "addresses",
  "relationships",
  "milestones",
  "background_checks",
  "tags",
  "member_tags",
  "custom_fields",
  "custom_field_values",
  "notes",
  "import_batches",
  "import_rows",
  "person_merges",
  "tenant_roles",
  "notifications",
  /*
   * R19.5. Everything else a church writes down. The export is the trust
   * mechanism, so a table added after it was written is a table missing from
   * every church's archive until somebody notices. The test beside this one
   * fails the moment a tenant table is not named here.
   */
  "announcements",
  "announcement_dismissals",
  "mailers",
  "conversations",
  "conversation_people",
  "messages",
  "message_reactions",
  "message_drafts",
  "message_files",
  "push_subscriptions",
  "events",
  "event_registrations",
  "plan_item_kinds",
  "saved_reports",
  "funds",
  "gifts",
  "gift_batches",
  "recurring_gifts",
  "pledges",
  "campaigns",
  "stripe_accounts",
  // HRT-286, HRT-287, R16.8. The church's own messaging wiring and, more to
  // the point, its record of who agreed to be contacted. A church that moves
  // away and loses its consent record has to ask four hundred people again.
  "church_providers",
  "church_sending_domains",
  "church_registrations",
  "contact_consent",
  /* R16.4, R16.6. What the church wrote, what it sent, and who each copy
     went to. A church that leaves takes its own correspondence with it. */
  "email_templates",
  "email_sends",
  "email_recipients",
  /*
   * SEC-011. `platform_events` is not here any more.
   *
   * It is the platform's own append-only log, and the rows carry the operator's
   * name and the free text they typed while approving, unapproving or archiving
   * this church. That is our record of a decision rather than the church's
   * record of itself, and the application role is now denied the table
   * outright, so reading it here would have been a contradiction as well as a
   * disclosure. A church that wants its own approval history should be given it
   * on purpose rather than through `select *`.
   */
  "audit_entries",
] as const;

export type ExportTable = (typeof TABLES)[number];

export interface Archive {
  /** The whole thing, as one object. Keyed by table. */
  data: Record<string, Record<string, unknown>[]>;
  /** One CSV per table, ready to write into a zip. */
  csv: Record<string, string>;
  meta: {
    exportedAt: string;
    church: string;
    format: number;
    counts: Record<string, number>;
    /** Named so a reader knows the export is complete but a field was withheld. */
    withheld: string[];
  };
}

/** The archive format version, so a future importer knows what it is reading. */
export const ARCHIVE_FORMAT = 1;

/**
 * Builds the whole archive.
 *
 * Held in memory, deliberately, for now. The target is churches of 50 to 500
 * members, where this is a few megabytes. Streaming it row by row is the right
 * answer at ten thousand and is a different piece of work; doing it now would be
 * complexity bought against a problem nobody has. HRT-39 covers it.
 */
export async function buildArchive(
  db: Tx,
  /*
   * SEC-007. The permissions come too, because this decides what a role may
   * read and `canX(role)` on a bare role answers for the built-in matrix
   * only: a church that wrote its own role carries `member` plus an array,
   * and the array is where its grants are.
   */
  actor: {
    tenantId: string;
    role: TenantRole;
    permissions?: readonly Permission[] | null;
  },
  church: { name: string; slug: string },
): Promise<Archive> {
  // Exporting hands over every record the church holds in one file. That is the
  // point, and it is also why it is not something any role can do unprompted.
  if (!canArchivePeople(actor)) throw new PermissionError(actor.role, "exportEverything");

  const data: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  const withheld: string[] = [];

  /*
   * R19.8. What each table's columns are called, whether or not it holds rows.
   *
   * A table a church has not used yet has no row to read the column names off,
   * and a CSV written from no columns is a file holding a byte order mark and
   * nothing else. A spreadsheet opens that as one cell of mojibake, which reads
   * as a corrupt export rather than as an empty one.
   */
  const named = (await db.execute(sql`
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position
  `)) as unknown as { table_name: string; column_name: string }[];

  const columnsOf = new Map<string, string[]>();
  for (const { table_name, column_name } of named) {
    if (DROPPED[table_name]?.includes(column_name)) continue;
    columnsOf.set(table_name, [...(columnsOf.get(table_name) ?? []), column_name]);
  }

  for (const table of TABLES) {
    // No tenant predicate. Row-level security supplies it, so a table added
    // later is scoped by the policy rather than by remembering to filter here.
    const rows = (await db.execute(
      sql`select * from ${sql.identifier(table)}`,
    )) as unknown as Record<string, unknown>[];

    const cleaned = rows
      .map((row) => clean(table, row, actor, withheld))
      .filter((row): row is Record<string, unknown> => row !== null);

    /* SEC-007. Said once for the table rather than once per row, and said
       even when the table is empty, so the reader is told the difference
       between a church with no gifts and a role that may not read them. */
    if (GIVING_TABLES.has(table) && !canReadGivingAmounts(actor)) {
      withheld.push(`${table}.*`);
    }

    data[table] = cleaned;
    counts[table] = cleaned.length;
  }

  const csv: Record<string, string> = {};
  for (const [table, rows] of Object.entries(data)) {
    // The rows name their own columns. An empty table has the schema to fall
    // back on, so it still arrives with its header row.
    csv[table] = toCsv(rows, rows.length > 0 ? undefined : columnsOf.get(table));
  }

  return {
    data,
    csv,
    meta: {
      exportedAt: new Date().toISOString(),
      church: church.name,
      format: ARCHIVE_FORMAT,
      counts,
      withheld: [...new Set(withheld)],
    },
  };
}

/**
 * Field-level permissions apply to an export exactly as they apply to a screen
 * (R1.5, R21.2). An export is the easiest place in any product to leak a
 * restricted field, because it is one query and nobody is looking at the output.
 *
 * A confidential note is decrypted for a role that may read it, because it is
 * the church's own data and ciphertext they cannot open is not an export. For
 * every other role the body is absent, and the withholding is declared in the
 * archive's metadata rather than left to be noticed.
 */
/**
 * R21.15. Columns the export never writes, whatever the role holds.
 *
 * Named here as well as removed below, so a table with no rows in it does not
 * advertise a column its CSV would never carry.
 */
const DROPPED: Record<string, string[]> = {
  church_providers: ["credential_key_id", "access_token"],
  notes: ["body_encrypted"],
};

/**
 * SEC-007, R13.11. The tables the giving permission governs.
 *
 * An export is the easiest place in a product to hand over a field a screen
 * refuses, and this was the place it happened. The archive is gated on
 * `members.archive`, which an Admin holds, and `giving.amounts`, which an
 * Admin does not, was never consulted: so a role the product keeps out of
 * every amount on the giving screen, the reports, the statements and the CSV
 * could download the whole ledger as `gifts.csv`.
 *
 * Withheld whole rather than redacted column by column. The permission governs
 * the ledger, not one column of it, and a gift row names the giver as well as
 * the amount. The table still arrives with its header, and `meta.withheld`
 * says what is missing and why, the same way a confidential note does.
 */
const GIVING_TABLES = new Set([
  "gifts",
  "gift_batches",
  "recurring_gifts",
  "pledges",
  "campaigns",
  "stripe_accounts",
]);

function clean(
  table: string,
  row: Record<string, unknown>,
  role: Who,
  withheld: string[],
): Record<string, unknown> | null {
  if (GIVING_TABLES.has(table) && !canReadGivingAmounts(role)) {
    return null;
  }

  /*
   * R21.15. A sealed provider credential leaves with nobody.
   *
   * It is useless to the church, since only our key opens it, and a copy of it
   * sitting in a volunteer's downloads folder is a copy we cannot revoke. The
   * row goes, so the church can see which accounts it had connected.
   */
  if (table === "church_providers") {
    const out = { ...row };
    delete out["credential"];
    delete out["credential_key_id"];
    /* SEC-007. Sealed with the same key and the same objection, and it was
       the one of the two that left in the file. */
    delete out["access_token"];
    out["credential"] = row["credential"] ? "sealed" : null;
    withheld.push("church_providers.credential");
    return out;
  }

  if (table !== "notes") return row;

  const out = { ...row };
  const encrypted = out["body_encrypted"];
  delete out["body_encrypted"];

  if (out["classification"] !== "confidential") return out;

  if (canReadConfidentialNotes(role)) {
    out["body"] = typeof encrypted === "string" ? decryptNote(encrypted) : out["body"];
    return out;
  }

  delete out["body"];
  out["restricted"] = true;
  withheld.push("notes.body");
  return out;
}

export { TABLES as EXPORT_TABLES };
