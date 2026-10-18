/**
 * Takes two-step verification off an account in development.
 *
 * For a developer who enrolled against a throwaway authenticator and no longer
 * has it, which a browser test does every time it runs. It deletes the factor
 * in Supabase's own schema, so it needs the owner connection and will only
 * ever work where that connection is to hand.
 *
 *   pnpm --filter @connectapp/db reset:two-step pastor@riverside.example.org
 */
import { owner, closeConnections } from "../src/client";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Give the email address to reset.");
    process.exit(1);
  }

  const sql = owner();
  const [user] = await sql<{ id: string }[]>`
    select id from auth.users where email = ${email}`;
  if (!user) {
    console.error(`No account for ${email}.`);
    await closeConnections();
    process.exit(1);
  }

  const gone = await sql`delete from auth.mfa_factors where user_id = ${user.id} returning id`;
  await sql`update app_users set mfa_enrolled_at = null where id = ${user.id}`;
  await sql`delete from account_recovery_codes where user_id = ${user.id}`;

  console.log(`${email}: ${gone.length} factor(s) removed, two-step is off.`);
  await closeConnections();
}

main();
