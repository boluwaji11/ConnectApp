/**
 * The 0.1 exit criterion (R1.3, R21.1).
 *
 * "An adversarial test suite attempts cross-tenant reads and writes on every
 *  table through both the ORM and raw SQL as the application role, and every
 *  attempt fails."
 *
 * These are not unit tests. They are the reason a church can be told its data is
 * isolated, so they run against the real database as the real application role.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql as raw } from "drizzle-orm";
import { owner, appDb, withTenant, closeConnections } from "../src/client";
import { listPeople } from "../src/repo/members";
import { listNotesForPerson } from "../src/repo/notes";

let riverside: string;
let northgate: string;
let northgatePersonId: string;
let riversideSubjectId: string;
let tenantTables: string[];

beforeAll(async () => {
  const sql = owner();
  const tenants = await sql<{ id: string; slug: string }[]>`
    select id, slug from tenants where slug in ('riverside', 'northgate')`;
  riverside = tenants.find((t) => t.slug === "riverside")!.id;
  northgate = tenants.find((t) => t.slug === "northgate")!.id;

  const [np] = await sql<{ id: string }[]>`select id from members where tenant_id = ${northgate} limit 1`;
  northgatePersonId = np!.id;

  const [rs] = await sql<{ id: string }[]>`
    select member_id as id from notes where tenant_id = ${riverside} and classification = 'confidential' limit 1`;
  riversideSubjectId = rs!.id;

  tenantTables = (
    await sql<{ relname: string }[]>`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
      where n.nspname = 'public' and c.relkind = 'r'
        /*
         * SEC-011. The platform's own tables are not a church's, even though
         * platform_events carries a tenant_id to name the church an operator
         * acted on. The application role is denied them outright rather than
         * scoped to its own rows, which is a stronger property than anything
         * this file asserts, and hardening.test.ts is where it is asserted.
         *
         * They used to be in this list, so the suite was requiring
         * platform_events to have a tenant policy and passing once it had one.
         * That is the finding written down as an expectation.
         */
        and c.relname not like 'platform\_%'
      order by c.relname`
  ).map((r) => r.relname);
});

afterAll(async () => {
  await closeConnections();
});

describe("the application role itself", () => {
  it("is not a superuser and does not bypass row-level security", async () => {
    const [role] = await owner()<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = 'hearth_app'`;
    expect(role).toBeDefined();
    expect(role!.rolsuper).toBe(false);
    expect(role!.rolbypassrls).toBe(false);
  });

  it("does not own any table, because an owner bypasses its own policies", async () => {
    const owned = await owner()<{ relname: string }[]>`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles r on r.oid = c.relowner
      where n.nspname = 'public' and c.relkind = 'r' and r.rolname = 'hearth_app'`;
    expect(owned).toEqual([]);
  });

  it("has row-level security enabled on every tenant-scoped table", async () => {
    const unprotected = await owner()<{ relname: string }[]>`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relrowsecurity = false`;
    expect(unprotected).toEqual([]);
  });

  it("has an isolation policy on every tenant-scoped table", async () => {
    const missing = await owner()<{ relname: string }[]>`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
      where n.nspname = 'public' and c.relkind = 'r'
        -- SEC-011. The platform's own. Denied to the application role outright
        -- rather than scoped to its own rows, which hardening.test.ts asserts.
        and c.relname not like 'platform\_%'
        and not exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname
        )`;
    expect(missing).toEqual([]);
  });
});

describe("cross-tenant reads through the ORM", () => {
  it("returns only the current tenant's members", async () => {
    const riversidePeople = await withTenant({ tenantId: riverside, role: "admin" }, (tx) => listPeople(tx));
    const northgatePeople = await withTenant({ tenantId: northgate, role: "admin" }, (tx) => listPeople(tx));

    expect(riversidePeople.length).toBeGreaterThan(0);
    expect(northgatePeople.length).toBeGreaterThan(0);

    const riversideNames = riversidePeople.map((p) => p.lastName);
    const northgateNames = northgatePeople.map((p) => p.lastName);
    expect(riversideNames).toContain("Bennett");
    expect(riversideNames).not.toContain("Halvorsen");
    expect(northgateNames).toContain("Halvorsen");
    expect(northgateNames).not.toContain("Bennett");
  });

  it("cannot fetch another tenant's person by its exact id", async () => {
    const found = await withTenant({ tenantId: riverside, role: "owner" }, (tx) =>
      tx.execute(raw`select id from members where id = ${northgatePersonId}::uuid`),
    );
    expect(found.length).toBe(0);
  });
});

describe("cross-tenant reads through raw SQL, on every table", () => {
  it("leaks no row from another tenant on any table", async () => {
    const leaks: string[] = [];

    await withTenant({ tenantId: riverside, role: "owner" }, async (tx) => {
      for (const table of tenantTables) {
        const rows = await tx.execute(raw.raw(`select tenant_id from public."${table}" limit 500`));
        for (const row of rows as unknown as { tenant_id: string }[]) {
          if (row.tenant_id !== riverside) leaks.push(`${table}: ${row.tenant_id}`);
        }
      }
    });

    expect(leaks).toEqual([]);
    expect(tenantTables.length).toBeGreaterThan(10);
  });

  it("returns nothing when explicitly asked for another tenant's rows", async () => {
    await withTenant({ tenantId: riverside, role: "owner" }, async (tx) => {
      for (const table of tenantTables) {
        const rows = await tx.execute(
          raw.raw(`select 1 from public."${table}" where tenant_id = '${northgate}' limit 1`),
        );
        expect(rows.length, `${table} leaked a row for another tenant`).toBe(0);
      }
    });
  });

  it("returns nothing at all when no tenant context is set", async () => {
    await appDb().transaction(async (tx) => {
      for (const table of tenantTables) {
        const rows = await tx.execute(raw.raw(`select 1 from public."${table}" limit 1`));
        expect(rows.length, `${table} returned rows with no tenant context`).toBe(0);
      }
    });
  });
});

describe("cross-tenant writes", () => {
  it("refuses an insert stamped with another tenant's id", async () => {
    await expect(
      withTenant({ tenantId: riverside, role: "owner" }, (tx) =>
        tx.execute(raw`
          insert into members (tenant_id, first_name, last_name)
          values (${northgate}::uuid, ${"Injected"}, ${"Row"})`),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("updates nothing when targeting another tenant's row", async () => {
    await withTenant({ tenantId: riverside, role: "owner" }, async (tx) => {
      const result = await tx.execute(raw`
        update members set last_name = ${"Tampered"} where id = ${northgatePersonId}::uuid returning id`);
      expect(result.length).toBe(0);
    });

    const [check] = await owner()<{ last_name: string }[]>`
      select last_name from members where id = ${northgatePersonId}`;
    expect(check!.last_name).not.toBe("Tampered");
  });

  it("deletes nothing when targeting another tenant's row", async () => {
    await withTenant({ tenantId: riverside, role: "owner" }, async (tx) => {
      const result = await tx.execute(
        raw`delete from members where id = ${northgatePersonId}::uuid returning id`,
      );
      expect(result.length).toBe(0);
    });

    const [still] = await owner()<{ id: string }[]>`select id from members where id = ${northgatePersonId}`;
    expect(still).toBeDefined();
  });

  it("cannot reach another tenant by changing the session variable to it", async () => {
    // The application layer verifies membership before setting the context. This
    // asserts the blast radius if that check were ever bypassed: the attacker
    // still only reaches the tenant they named, never two at once.
    const rows = await withTenant({ tenantId: northgate, role: "owner" }, (tx) =>
      tx.execute(raw`select tenant_id from members`),
    );
    expect(
      (rows as unknown as { tenant_id: string }[]).every((r) => r.tenant_id === northgate),
    ).toBe(true);
  });
});

describe("app_users is not enumerable across tenants", () => {
  it("shows only users who belong to the current tenant", async () => {
    const seen = await withTenant({ tenantId: riverside, role: "owner" }, (tx) =>
      tx.execute(raw`select email from app_users`),
    );
    const emails = (seen as unknown as { email: string }[]).map((r) => r.email);

    expect(emails.length).toBeGreaterThan(0);
    expect(emails.some((e) => e.endsWith("@northgate.example.org"))).toBe(false);

    /* Everybody visible holds a seat in this church. The addresses are not
       all at the church's own domain: a volunteer signs in with the address
       they already have. */
    const seats = await owner()<{ email: string }[]>`
      select u.email from app_users u
      join tenant_members m on m.user_id = u.id
      where m.tenant_id = ${riverside}`;
    const held = new Set(seats.map((r) => r.email));
    expect(emails.every((e) => held.has(e))).toBe(true);

    // The other church's users exist. They are simply unreachable.
    const all = await owner()<{ email: string }[]>`select email from app_users`;
    expect(all.some((r) => r.email.endsWith("@northgate.example.org"))).toBe(true);
  });
});

describe("field-level permissions on confidential notes (R1.5, R6.2, R21.2)", () => {
  it("gives a staff role the note's existence but not its content", async () => {
    const notes = await withTenant({ tenantId: riverside, role: "staff" }, (tx) =>
      listNotesForPerson(tx, riversideSubjectId, "staff", { tenantId: riverside }),
    );

    const confidential = notes.filter((n) => n.classification === "confidential");
    expect(confidential.length).toBeGreaterThan(0);

    for (const note of confidential) {
      expect(note.restricted).toBe(true);
      expect(note.createdAt).toBeInstanceOf(Date);
      // Absent, not null and not an empty string, so a careless consumer
      // renders nothing rather than leaking a blank.
      expect("body" in note).toBe(false);
      expect(JSON.stringify(note)).not.toContain("permission boundary is broken");
    }
  });

  it("gives a pastoral role the decrypted content", async () => {
    const notes = await withTenant({ tenantId: riverside, role: "pastoral" }, (tx) =>
      listNotesForPerson(tx, riversideSubjectId, "pastoral", { tenantId: riverside }),
    );
    const confidential = notes.find((n) => n.classification === "confidential");
    expect(confidential?.restricted).toBe(false);
    expect(confidential?.body).toContain("Confidential pastoral note");
  });

  it("stores nothing readable in the column itself", async () => {
    const [row] = await owner()<{ body: string | null; body_encrypted: string }[]>`
      select body, body_encrypted from notes
      where tenant_id = ${riverside} and classification = 'confidential' limit 1`;
    expect(row!.body).toBeNull();
    expect(row!.body_encrypted).toMatch(/^v1\./);
    expect(row!.body_encrypted).not.toContain("permission boundary");
  });

  it("audits every confidential read, naming the reader", async () => {
    const before = await owner()<{ count: string }[]>`
      select count(*)::text as count from audit_entries
      where tenant_id = ${riverside} and action = 'read' and entity = 'notes'`;

    await withTenant({ tenantId: riverside, role: "pastoral" }, (tx) =>
      listNotesForPerson(tx, riversideSubjectId, "pastoral", { tenantId: riverside }),
    );

    const after = await owner()<{ count: string; actor_role: string }[]>`
      select count(*)::text as count from audit_entries
      where tenant_id = ${riverside} and action = 'read' and entity = 'notes'`;

    expect(Number(after[0]!.count)).toBeGreaterThan(Number(before[0]!.count));

    const [latest] = await owner()<{ actor_role: string }[]>`
      select actor_role from audit_entries
      where tenant_id = ${riverside} and action = 'read' and entity = 'notes'
      order by at desc limit 1`;
    expect(latest!.actor_role).toBe("pastoral");
  });
});

describe("the audit log is append only (R1.11)", () => {
  it("writes an entry automatically when a person is created", async () => {
    const created = await withTenant({ tenantId: riverside, role: "admin" }, async (tx) => {
      const rows = await tx.execute(raw`
        insert into members (tenant_id, first_name, last_name, slug)
        values (${riverside}::uuid, ${"Audit"}, ${"Probe"}, ${`audit-probe-${Date.now()}`})
        returning id`);
      return (rows as unknown as { id: string }[])[0]!.id;
    });

    const entries = await owner()<{ action: string; actor_role: string }[]>`
      select action, actor_role from audit_entries where entity = 'members' and entity_id = ${created}`;
    expect(entries.length).toBe(1);
    expect(entries[0]!.action).toBe("insert");
    expect(entries[0]!.actor_role).toBe("admin");

    await owner()`delete from members where id = ${created}`;
  });

  it("cannot be updated by the owner role of the tenant", async () => {
    await expect(
      withTenant({ tenantId: riverside, role: "owner" }, (tx) =>
        tx.execute(raw`update audit_entries set action = 'read' where tenant_id = ${riverside}::uuid`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("cannot be deleted by the owner role of the tenant", async () => {
    await expect(
      withTenant({ tenantId: riverside, role: "owner" }, (tx) =>
        tx.execute(raw`delete from audit_entries where tenant_id = ${riverside}::uuid`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("never records a confidential note's ciphertext", async () => {
    const rows = await owner()<{ after: Record<string, unknown> | null }[]>`
      select after from audit_entries where entity = 'notes' and after is not null`;
    for (const row of rows) {
      expect(Object.keys(row.after ?? {})).not.toContain("body_encrypted");
      expect(Object.keys(row.after ?? {})).not.toContain("body");
    }
  });
});
