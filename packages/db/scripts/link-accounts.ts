/**
 * Gives every account a record in the church it belongs to.
 *
 * Everybody who signs in is somebody the church holds a record for. Accounts
 * made before that was true, or seeded for local review, are linked here: to a
 * record already carrying their address where there is one, and to a new record
 * where there is not.
 *
 * An account without one is not a cosmetic gap. The member-facing screens are
 * reads of a person's own record, so `personForUser` answering null takes My
 * giving, My groups and My schedule away from them, and My giving sends them
 * back to the home screen without a word about why.
 */
import { owner, closeConnections } from "../src/client";
import { linkOrCreatePerson } from "../src/repo/membership";

/** Links every account that has no record yet, and says what it did. */
export async function linkAccounts(say = true): Promise<number> {
  const sql = owner();

  const rows = await sql<
    { tenant_id: string; slug: string; user_id: string; email: string; full_name: string | null }[]
  >`
    select m.tenant_id, t.slug, m.user_id, u.email, u.full_name
      from tenant_members m
      join app_users u on u.id = m.user_id
      join tenants t on t.id = m.tenant_id
     where not exists (
       select 1 from members p
        where p.tenant_id = m.tenant_id and p.app_user_id = m.user_id and p.archived_at is null
     )
     order by t.slug, u.email`;

  for (const row of rows) {
    const id = await linkOrCreatePerson({
      tenantId: row.tenant_id,
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name,
    });
    if (!id) {
      if (say) console.log(`  ${row.slug.padEnd(12)} ${row.email.padEnd(32)} left alone, that address is already claimed`);
      continue;
    }
    if (!say) continue;
    const [person] = await sql<{ name: string }[]>`
      select btrim(coalesce(preferred_name, first_name) || ' ' || coalesce(last_name, '')) as name
        from members where id = ${id}`;
    console.log(`  ${row.slug.padEnd(12)} ${row.email.padEnd(32)} ${person!.name}`);
  }

  return rows.length;
}

/** Run on its own, for a database that drifted before the seed did this. */
async function main() {
  const count = await linkAccounts();
  console.log(`\n${count} accounts linked.`);
  await closeConnections();
}

if (process.argv[1]?.endsWith("link-accounts.ts")) void main();
