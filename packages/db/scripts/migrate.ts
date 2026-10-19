/**
 * Applies the generated table migrations, then the hand-written security layer.
 * Order matters: RLS policies and audit triggers loop over existing tables.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { owner, closeConnections } from "../src/client";
import { required } from "../src/env";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function main() {
  const sql = owner();
  await sql.unsafe("set client_min_messages = warning");
  const db = drizzle(sql);

  const migrationsFolder = join(root, "migrations");
  const files = readdirSync(migrationsFolder).filter((f) => f.endsWith(".sql"));
  console.log(`Applying ${files.length} table migration(s) from migrations/`);

  /*
   * HRT-455. Whether anything actually changed, so the rest can be skipped.
   *
   * `search.sql` and `security.sql` describe the shape the database should be
   * in: indexes, roles, RLS, grants and audit triggers. They are idempotent in
   * their result and expensive in their cost, because altering a table,
   * rewriting a policy, rebuilding a trigger and granting on a table each want
   * an ACCESS EXCLUSIVE lock on it.
   *
   * Running them on a deployment that changed no schema is asking a live
   * database for a hundred exclusive locks to arrive back where it started,
   * and it is what made three production deployments fail: a demo visitor
   * held an ordinary read on `tenants`, and the deployment could not get in.
   *
   * So they run when a migration ran, which is when the schema can have moved
   * underneath them, and not otherwise. `--all` runs them regardless, for
   * putting a database right by hand.
   */
  const applied = async () => {
    const rows = await sql<{ n: string }[]>`
      select count(*)::text as n from drizzle.__drizzle_migrations`.catch(() => [{ n: "0" }]);
    return Number(rows[0]?.n ?? 0);
  };

  const before = await applied();
  await migrate(db, { migrationsFolder });
  const after = await applied();

  const changed = after > before;
  const forced = process.argv.includes("--all");

  if (!changed && !forced) {
    console.log(
      `\nNo migration ran, so the schema is where sql/search.sql and`
      + ` sql/security.sql last left it.`,
    );
    console.log("Skipping both. To apply them anyway:  pnpm db:migrate --all");
    await report(sql);
    await closeConnections();
    return;
  }

  if (changed) console.log(`  ${after - before} new migration(s) applied.`);

  console.log("Applying sql/search.sql (trigram indexes behind the search box)");
  await sql.unsafe(readFileSync(join(root, "sql", "search.sql"), "utf8"));

  console.log("Applying sql/security.sql (roles, RLS, grants, audit triggers)");
  const security = readFileSync(join(root, "sql", "security.sql"), "utf8");

  // The app role's password is passed as a session setting rather than
  // interpolated into the file, so it never appears in a committed artefact.
  // The old name is still read, so an environment set up before the rename
  // keeps working. The Postgres setting itself is unchanged: every RLS policy
  // names the schema it lives in.
  const appPassword = process.env.CONNECTAPP_APP_PASSWORD
    ? required("CONNECTAPP_APP_PASSWORD")
    : required("HEARTH_APP_PASSWORD");
  await sql.unsafe(`set hearth.app_password = '${appPassword.replace(/'/g, "''")}'`);

  /*
   * HRT-455. A lock this file cannot get quickly is given up rather than
   * queued for.
   *
   * `security.sql` alters tables, rewrites policies and rebuilds triggers,
   * and each of those wants an ACCESS EXCLUSIVE lock. Against a live database
   * one of them lands behind an ordinary page render, and the damage is not
   * the waiting: a lock request that waits blocks every later reader of that
   * table behind it, so one slow read becomes a queue, and the statement
   * eventually dies on the statement timeout and takes the whole file with
   * it. A production deployment failed exactly this way on `church_sites`.
   *
   * Two seconds, then give up. Nothing queues behind a request that is not
   * waiting, and the file is simply run again: almost everything in it is now
   * guarded by a catalogue read, so a second attempt has less to do than the
   * first and finds the moment between two requests that it needs.
   */
  await sql.unsafe("set lock_timeout = '2s'");

  const ATTEMPTS = 5;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await sql.unsafe(security);
      break;
    } catch (error) {
      /* 55P03 is lock_not_available, which is this and nothing else. Anything
         else is a real fault and is not worth retrying. */
      const code = (error as { code?: string }).code;
      if (code !== "55P03" || attempt === ATTEMPTS) throw error;
      const wait = attempt * 3000;
      console.log(
        `  a table was busy, so the lock was given up rather than queued for.`
        + ` Trying again in ${wait / 1000}s (${attempt} of ${ATTEMPTS - 1}).`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  await report(sql);
  await closeConnections();
}

/**
 * What the database is carrying, printed whether or not anything ran.
 *
 * A deployment that skipped the security layer still has to say what the
 * security layer amounts to, or "skipped" reads as "unknown".
 */
async function report(sql: ReturnType<typeof owner>): Promise<void> {
  const policyRows = await sql<{ count: string }[]>`
    select count(*)::text as count from pg_policies where schemaname = 'public'`;
  const tableRows = await sql<{ count: string }[]>`
    select count(*)::text as count from pg_tables
    where schemaname = 'public' and rowsecurity = true`;
  const triggerRows = await sql<{ count: string }[]>`
    select count(*)::text as count from pg_trigger
    where not tgisinternal and tgname like 'audit_%'`;

  const policies = policyRows[0]?.count ?? "0";
  const tables = tableRows[0]?.count ?? "0";
  const triggers = triggerRows[0]?.count ?? "0";

  console.log(`\nDone. ${tables} tables with RLS enabled, ${policies} policies, ${triggers} audit triggers.`);
}

main().catch(async (err) => {
  console.error(err);
  await closeConnections();
  process.exit(1);
});
