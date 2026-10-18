import type { Sql } from "postgres";
import { owner } from "./client";

/**
 * Operations that only the seed script and the test suite perform.
 *
 * Nothing here is reachable from the web app. It runs on the owner connection
 * and it removes data, which is exactly the combination that has no business in
 * a request path.
 */

/**
 * Runs work without writing audit rows, on one connection, for one transaction.
 *
 * Deleting a church cascades to its members, the trigger records each of those
 * deletions, and the new audit row points at the church being deleted in the
 * same statement. Postgres refuses it, correctly. A reset is not something a
 * person did, so there is nobody to attribute it to either.
 *
 * This used to disable the triggers, which takes an exclusive lock on every
 * audited table and stops everything else on the platform while it runs. It is
 * now a setting local to this transaction, so it affects this connection and
 * nothing else, and it cannot leak: the transaction ending puts it back whether
 * the work succeeded or not.
 *
 * The work is handed the connection that carries the setting. Using any other
 * one writes audit rows as normal, which is the safe way round for a mistake.
 */
export async function withAuditTriggersOff<T>(
  work: (sql: Sql) => Promise<T>,
): Promise<T> {
  return owner().begin(async (tx) => {
    await tx`select set_config('app.audit_off', '1', true)`;
    /*
     * HRT-435. The same transaction, for the same reason.
     *
     * The audit log, the operator log and the incident reports refuse an
     * update or a delete by trigger now, and removing a church cascades into
     * all three. A reset is not somebody tampering with a record, so this says
     * so once, here, where the removal already announces itself.
     */
    await tx`select set_config('app.purge', '1', true)`;
    return work(tx as unknown as Sql);
  }) as Promise<T>;
}

/** Removes churches by slug, and everything that cascades from them. */
export async function deleteTenants(slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;
  await withAuditTriggersOff(async (sql) => {
    await sql`delete from tenants where slug in ${sql(slugs)}`;
  });
}

/** Removes churches whose slug starts with a prefix. For test cleanup. */
export async function deleteTenantsLike(prefix: string): Promise<void> {
  await withAuditTriggersOff(async (sql) => {
    await sql`delete from tenants where slug like ${prefix + "%"}`;
  });
}
