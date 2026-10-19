/**
 * Regression tests for findings raised by Supabase's database linter.
 *
 * Each of these was a real weakness, not a style complaint, so each gets a test
 * rather than a fix and a promise.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { owner, withTenant, closeConnections } from "../src/client";
import { withAuditTriggersOff, deleteTenantsLike } from "../src/maintenance";
import { testTenant } from "./helpers/tenant";

/**
 * SEC-012. Every function we define in `public`, asked of the catalogue.
 *
 * This used to be the list the query filtered by *and* the list the coverage
 * assertion compared against, so "covers every function we define in public"
 * could only fail if one of four went missing and could never notice a fifth.
 * `public` actually holds ten of ours, and the six the list omitted were
 * exactly the six that fail the two assertions underneath it: the slug helpers
 * pin no search_path, and two of the definer functions were pinned to
 * `public, pg_catalog` rather than to nothing.
 *
 * Nothing is named here now. A function added by a later migration is in scope
 * the day it is created, which is the same rule the audit trigger's coverage
 * loop already follows.
 */

/**
 * The storage schema belongs to Supabase, so the bucket policies and the
 * membership check they call only exist where it does. CI runs against a plain
 * Postgres container, where there is nothing to assert, and asserting it there
 * fails a check that is passing on the only database it applies to.
 *
 * Read at module load rather than in a hook, so the test is skipped at
 * collection and a skip is reported rather than a silent pass.
 */
const HAS_STORAGE = (
  await owner()<{ present: boolean }[]>`
    select to_regclass('storage.objects') is not null as present`
)[0]?.present ?? false;

let functions: { name: string; config: string[] | null; definer: boolean }[];

beforeAll(async () => {
  functions = await owner()<{ name: string; config: string[] | null; definer: boolean }[]>`
    select p.proname as name, p.proconfig as config, p.prosecdef as definer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname not like 'pg\_%'`;

});

afterAll(async () => {
  await closeConnections();
});

describe("function search_path is pinned", () => {
  it("finds the functions it is meant to be checking", () => {
    /* A guard on the guard: a query that matched nothing would make both
       assertions below pass while proving nothing at all. */
    expect(functions.length).toBeGreaterThan(3);
    expect(functions.map((f) => f.name)).toContain("app_tenant_id");
  });

  it("pins search_path on all of them", () => {
    // A mutable search_path lets anyone who can create an object in an earlier
    // schema shadow what the function resolves. That is escalation, not style.
    const unpinned = functions.filter((f) => !(f.config ?? []).some((c) => c.startsWith("search_path=")));
    expect(unpinned.map((f) => f.name)).toEqual([]);
  });

  it("pins every one of them to nothing, not to a path with a schema on it", () => {
    /*
     * HRT-425. Fixed is not the same property as empty. A path with `public`
     * on it still resolves a name through a schema, so a caller who can
     * create an object there decides which table the body reads. With nothing
     * on the path every name has to be written out in the body and there is
     * nothing left to shadow.
     *
     * The slug helpers and `campus_default` were the five that named their
     * tables unqualified and so had to be pinned to `public, pg_catalog`
     * instead. Migration 0166 wrote those names out. `pg_catalog` is searched
     * whether or not it is named, so the built-ins still resolve.
     */
    const loose = functions.filter(
      (f) => !(f.config ?? []).some((c) => c === 'search_path=""'),
    );
    expect(loose.map((f) => f.name)).toEqual([]);
  });

  it("still answers with the slug helpers pinned to nothing", async () => {
    /* The reason this waited: an empty path pins an unqualified body to
       failure rather than to safety, and that failure is a church unable to
       add a person. Proved rather than assumed. */
    const rows = await owner()<{ slug: string | null }[]>`
      select public.hearth_slug('Noah O''Brien-Smith!') as slug`;
    expect(rows[0]?.slug).toBe("noah-obrien-smith");
  });
});

describe("no SECURITY DEFINER surface", () => {
  it("defines none of our functions as definer", () => {
    // audit_write does not need it: hearth_app holds INSERT on audit_entries and
    // the isolation policy passes, because the row's tenant is the tenant in
    // context. Removing the escalation surface beats guarding it.
    expect(functions.filter((f) => f.definer).map((f) => f.name)).toEqual([]);
  });

  it("does not let anon or authenticated execute the audit trigger function", async () => {
    for (const role of ["anon", "authenticated", "public"]) {
      const rows = await owner()<{ ok: boolean | null }[]>`
        select has_function_privilege(${role}, 'public.audit_write()', 'execute') as ok`;
      expect(rows[0]?.ok, `${role} can execute audit_write`).toBe(false);
    }
  });

  it("still lets the application role call the policy helpers", async () => {
    for (const fn of ["app_tenant_id()", "app_role()", "app_user_id()"]) {
      const rows = await owner()<{ ok: boolean | null }[]>`
        select has_function_privilege('hearth_app', ${`public.${fn}`}, 'execute') as ok`;
      expect(rows[0]?.ok, `hearth_app cannot call ${fn}`).toBe(true);
    }
  });
});

/**
 * SEC-010, SEC-011, SEC-012. The three findings the widened query above found,
 * and the one it could not see.
 */
describe("the schema and its functions are not open to whoever connects", () => {
  it("lets nobody but the owner create objects in public", async () => {
    /* The precondition for shadowing anything a function resolves. Supabase's
       own bootstrap grants the schema to these roles, so this is closed on
       purpose rather than closed by default. */
    for (const role of ["public", "anon", "authenticated", "hearth_app"]) {
      const rows = await owner()<{ ok: boolean | null }[]>`
        select has_schema_privilege(${role}, 'public', 'create') as ok`;
      /* A role the database does not have answers null, which is not a grant. */
      expect(rows[0]?.ok ?? false, `${role} can create in public`).toBe(false);
    }
  });

  /*
   * `information_schema.role_routine_grants` reports a PUBLIC grant with
   * `grantee = 'PUBLIC'`, so the assertion further down that filters on
   * `('anon','authenticated')` passed while anon held EXECUTE on five
   * functions through PUBLIC. This asks the privilege itself.
   */
  it("lets anon and authenticated execute nothing in public, PUBLIC grants included", async () => {
    const ours = await owner()<{ sig: string }[]>`
      select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f' and p.proname not like 'pg\_%'`;

    expect(ours.length).toBeGreaterThan(3);

    for (const role of ["anon", "authenticated"]) {
      for (const { sig } of ours) {
        const rows = await owner()<{ ok: boolean | null }[]>`
          select has_function_privilege(${role}, ${sig}, 'execute') as ok`;
        expect(rows[0]?.ok ?? false, `${role} can execute ${sig}`).toBe(false);
      }
    }
  });

  it("keeps the platform's own tables away from the application role", async () => {
    const tables = await owner()<{ name: string }[]>`
      select c.relname as name
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'platform\_%'`;

    expect(tables.length).toBeGreaterThan(0);

    for (const { name } of tables) {
      for (const right of ["select", "insert", "update", "delete"]) {
        const rows = await owner()<{ ok: boolean | null }[]>`
          select has_table_privilege('hearth_app', ${`public.${name}`}, ${right}) as ok`;
        expect(rows[0]?.ok ?? false, `hearth_app can ${right} ${name}`).toBe(false);
      }
    }
  });

  it("gives no platform table a tenant policy, however it is keyed", async () => {
    /* `platform_events` carries a tenant_id, so it matched the policy loop and
       was handed a tenant policy: a church's own session could read the
       operator notes written about it and forge a row saying it was approved. */
    const policies = await owner()<{ tablename: string; policyname: string }[]>`
      select tablename, policyname from pg_policies
       where schemaname = 'public' and tablename like 'platform\_%'`;
    expect(policies).toEqual([]);
  });

  it("leaves row-level security on every platform table", async () => {
    /* With no policy, RLS enabled is what denies the application role. Both
       mechanisms, because the grant above is the one a blanket grant undid. */
    const open = await owner()<{ name: string }[]>`
      select c.relname as name
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and c.relname like 'platform\_%' and c.relrowsecurity = false`;
    expect(open.map((r) => r.name)).toEqual([]);
  });
});

describe("nothing is reachable over the auto-generated REST API", () => {
  it("grants anon and authenticated no privilege on any table", async () => {
    const grants = await owner()<{ grantee: string; table_name: string; privilege_type: string }[]>`
      select grantee, table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
    expect(grants).toEqual([]);
  });

  it("grants them no function privileges in the exposed schema", async () => {
    const grants = await owner()<{ grantee: string; routine_name: string }[]>`
      select grantee, routine_name
      from information_schema.role_routine_grants
      where specific_schema = 'public' and grantee in ('anon', 'authenticated')`;

    expect(grants).toEqual([]);
  });

  /**
   * The one function `authenticated` may call lives where PostgREST cannot
   * serve it.
   *
   * The storage bucket policies are evaluated as that role, so the membership
   * check they call has to be executable by it. PostgREST publishes every
   * function in the exposed schema as an RPC endpoint, so the function sits in
   * `connectapp`, which is not exposed. It answers one question about the caller's
   * own account: am I in this church.
   */
  it.skipIf(!HAS_STORAGE)("keeps the storage membership check out of the exposed schema", async () => {
    const [fn] = await owner()<{ definer: boolean }[]>`
      select p.prosecdef as definer
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'connectapp' and p.proname = 'user_in_church'`;
    expect(fn?.definer, "connectapp.user_in_church is missing").toBe(true);

    const [gone] = await owner()<{ present: boolean }[]>`
      select exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'user_in_church'
      ) as present`;
    expect(gone?.present, "public.user_in_church is still an RPC endpoint").toBe(false);

    const [may] = await owner()<{ ok: boolean | null }[]>`
      select has_function_privilege('authenticated', 'connectapp.user_in_church(text)', 'execute') as ok`;
    expect(may?.ok, "the bucket policies cannot call it").toBe(true);
  });
});

/**
 * R1.11 says the audit log covers every write. That was once a hardcoded list of
 * table names in security.sql, which held until the day a table was added and
 * nobody noticed it was writing nothing. An unaudited table looks exactly like an
 * audited one right up to the moment somebody asks who changed a record.
 *
 * So the coverage is asserted rather than trusted, by looking at what the
 * database actually has.
 */
describe("the audit log covers every table that holds church data", () => {
  it("has an audit trigger on every table with a tenant_id, and none on the log itself", async () => {
    const rows = await owner()<{ relname: string; triggers: number }[]>`
      select c.relname, count(t.tgname) filter (where t.tgname like 'audit_%')::int as triggers
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
        left join pg_trigger t on t.tgrelid = c.oid
       group by c.relname, n.nspname, c.relkind
      having n.nspname = 'public' and c.relkind = 'r'
       order by c.relname`;

    /*
     * HRT-400. The platform's own tables are the one exception, and it is a
     * correction rather than a convenience. `platform_events.tenant_id` names
     * the church an operator acted on, so it is null for every action that is
     * not about one church: granting somebody the portal, for instance. An
     * audit row with no tenant is refused, so auditing that table meant nobody
     * could be let into the portal at all. Those tables sit outside the
     * tenancy and keep their own append-only log.
     */
    const exempt = (name: string) => name === "audit_entries" || name.startsWith("platform_");

    const unaudited = rows.filter((r) => !exempt(r.relname) && r.triggers === 0);
    expect(unaudited.map((r) => r.relname), "tables with no audit trigger").toEqual([]);

    // Auditing the audit log would recurse on every write.
    const log = rows.find((r) => r.relname === "audit_entries");
    expect(log?.triggers).toBe(0);

    const platform = rows.filter((r) => r.relname.startsWith("platform_"));
    expect(
      platform.filter((r) => r.triggers > 0).map((r) => r.relname),
      "platform tables that should carry no audit trigger",
    ).toEqual([]);
  });
});

describe("the request path cannot switch its own auditing off", () => {
  it("writes the audit row anyway when hearth_app sets the flag", async () => {
    const id = await testTenant("auditoff", "Audit Off Church");

    // Exactly what a compromised query layer would try: the setting that the
    // maintenance path uses, set from the role every request runs as.
    await withTenant({ tenantId: id, role: "owner" }, async (tx) => {
      await tx.execute(sql`select set_config('app.audit_off', '1', true)`);
      await tx.execute(sql`
        insert into tags (tenant_id, name, hue) values (${id}, 'Audited anyway', 'sky')`);
    });

    const [row] = await owner()<{ n: string }[]>`
      select count(*)::text as n from audit_entries
       where tenant_id = ${id} and entity = 'tags'`;
    expect(Number(row!.n)).toBe(1);

    await deleteTenantsLike("auditoff");
  });

  it("is honoured for the owner connection, which is the one that resets things", async () => {
    const id = await testTenant("auditoff2", "Audit Off Church 2");

    await withAuditTriggersOff(async (sql) => {
      await sql`insert into tags (tenant_id, name, hue) values (${id}, 'Quiet', 'sky')`;
    });

    const [row] = await owner()<{ n: string }[]>`
      select count(*)::text as n from audit_entries where tenant_id = ${id}`;
    expect(Number(row!.n)).toBe(0);

    await deleteTenantsLike("auditoff2");
  });
});

describe("no table carries the same index twice", () => {
  /*
   * HRT-451. `search.sql` created `address_member_idx` and
   * `address_household_idx` over the same two columns, in the same order, that
   * the schema already indexed as `addresses_person_idx` and
   * `addresses_household_idx`. Postgres kept all four and maintained every one
   * of them on every write, which is a tax on the import path and on every
   * member a church adds.
   *
   * It went unnoticed because nothing broke: a duplicate index is correct, it
   * is only wasteful. Supabase's own advisor found it. This is the version
   * that fails a build instead.
   */
  it("has no two indexes with the same definition on one table", async () => {
    const rows = await owner()<{ tablename: string; names: string[] }[]>`
      select tablename, array_agg(indexname order by indexname) as names
        from (
          select tablename, indexname,
                 regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ', '') as body
            from pg_indexes where schemaname = 'public'
        ) x
       group by tablename, body
      having count(*) > 1`;

    expect(
      rows.map((r) => `${r.tablename}: ${r.names.join(" = ")}`),
      "duplicate indexes, maintained on every write for nothing",
    ).toEqual([]);
  });
});
