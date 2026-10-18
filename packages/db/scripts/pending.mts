/**
 * HRT-440. How many migrations this database has not had yet.
 *
 * Answers from the same table the migrator writes, so it cannot disagree with
 * what a migration run would do. Prints a number and the names, and nothing
 * else, so a deploy script can read it.
 *
 *   pnpm --filter @connectapp/db pending
 *   CONNECTAPP_ENV=production pnpm --filter @connectapp/db pending
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { owner, closeConnections } from "../src/client";

const here = dirname(fileURLToPath(import.meta.url));

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

async function main() {
  const journal = JSON.parse(
    readFileSync(resolve(here, "../migrations/meta/_journal.json"), "utf8"),
  ) as Journal;

  const sql = owner();

  /* A database nothing has ever been applied to has no table to read. */
  const [has] = await sql<{ there: boolean }[]>`
    select exists (
      select 1 from information_schema.tables
       where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
    ) as there`;

  const applied = has?.there
    ? Number(
        (await sql<{ n: string }[]>`select count(*)::text as n from drizzle.__drizzle_migrations`)[0]!.n,
      )
    : 0;

  const waiting = journal.entries.slice(applied);

  console.log(`written: ${journal.entries.length}`);
  console.log(`applied: ${applied}`);
  console.log(`pending: ${waiting.length}`);
  for (const one of waiting) console.log(`  ${one.tag}`);

  await closeConnections();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeConnections();
  process.exit(1);
});
