import { owner } from "../../src/client";

/**
 * Whether this database carries Supabase's `auth` schema.
 *
 * It belongs to the deployment rather than to these migrations, so the test
 * container, which is a plain Postgres, does not have it. The cases that
 * write a factor row skip themselves there rather than failing, and the ones
 * that matter everywhere keep running.
 */
export async function hasAuthSchema(): Promise<boolean> {
  const [row] = await owner()<{ there: boolean }[]>`
    select to_regclass('auth.mfa_factors') is not null as there`;
  return row?.there === true;
}
