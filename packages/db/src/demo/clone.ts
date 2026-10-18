import { owner } from "../client";

/**
 * HRT-416, R19.7. One church copied into another, in the database.
 *
 * A demo church is built by `loadDemoData`, which inserts a row at a time
 * through the repo layer so that what a visitor is shown is made by the same
 * functions the product uses and cannot drift from it. That takes 37.8 seconds
 * for the 872 rows a demo church holds, measured on 17 October 2026, and a
 * seed rich enough to show giving, messaging, forms and a website takes longer
 * still. It is the right way to build one and the wrong way to answer somebody
 * who has just arrived.
 *
 * So it is built once into a template and copied here. Postgres copying 872
 * rows between two tenants is a few statements rather than a few hundred round
 * trips.
 *
 * **Nothing here is written by hand.** The tables, their columns and the keys
 * between them are read from the catalogue every time, so a table added next
 * year is copied without anybody remembering to come back. The alternative,
 * a list in this file, fails silently: a visitor is shown a church with no
 * groups in it and nothing says anything is missing.
 */

/**
 * What a copy deliberately leaves behind.
 *
 * `audit_entries` is half of what a demo church holds and all of it describes
 * the loader building the template, not anything the visitor did. The log is
 * append only and belongs to the church that earned it.
 *
 * `demo_records` is the old loader's note of what it put into a real church,
 * which a demo church has no use for.
 *
 * `tenant_members` is who may open the church. The visitor is put in by the
 * caller, because they are the only member it should ever have.
 */
const LEAVE_BEHIND = new Set(["audit_entries", "demo_records", "tenant_members"]);

interface Column {
  table: string;
  column: string;
  notNull: boolean;
}

interface Key {
  table: string;
  column: string;
  target: string;
}

/** Every table carrying a tenant_id, which is what "belongs to a church" means. */
async function scopedTables(): Promise<string[]> {
  const rows = await owner()<{ table_name: string }[]>`
    select table_name
      from information_schema.columns
     where table_schema = 'public'
       and column_name = 'tenant_id'
     order by table_name`;
  return rows.map((r) => r.table_name).filter((name) => !LEAVE_BEHIND.has(name));
}

/** The columns of those tables, in the order the table declares them. */
async function columnsOf(tables: string[]): Promise<Column[]> {
  const rows = await owner()<{ table_name: string; column_name: string; is_nullable: string }[]>`
    select table_name, column_name, is_nullable
      from information_schema.columns
     where table_schema = 'public'
       and table_name = any(${tables})
       /* A generated column is written by the database and refused on insert. */
       and is_generated = 'NEVER'
       and identity_generation is null
     order by table_name, ordinal_position`;
  return rows.map((r) => ({
    table: r.table_name,
    column: r.column_name,
    notNull: r.is_nullable === "NO",
  }));
}

/**
 * The single-column foreign keys between the tables being copied.
 *
 * Single column because every key in this schema is one, and a composite key
 * cannot be remapped by the id map below. If one is ever added, `assertCloneable`
 * is what says so rather than this quietly copying a stale reference.
 */
async function keysAmong(tables: string[]): Promise<Key[]> {
  const rows = await owner()<{ src: string; col: string; tgt: string; cols: number }[]>`
    select src.relname as src, att.attname as col, tgt.relname as tgt,
           array_length(con.conkey, 1) as cols
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
      join unnest(con.conkey) as k(attnum) on true
      join pg_attribute att on att.attrelid = src.oid and att.attnum = k.attnum
     where con.contype = 'f'
       and src.relnamespace = 'public'::regnamespace
       and src.relname = any(${tables})
       and tgt.relname = any(${tables})`;
  return rows
    .filter((r) => r.cols === 1)
    .map((r) => ({ table: r.src, column: r.col, target: r.tgt }));
}

/** The tables that have an `id` of their own, so a copy can be pointed at it. */
async function tablesWithId(tables: string[]): Promise<Set<string>> {
  const rows = await owner()<{ table_name: string }[]>`
    select table_name
      from information_schema.columns
     where table_schema = 'public'
       and column_name = 'id'
       and data_type = 'uuid'
       and table_name = any(${tables})`;
  return new Set(rows.map((r) => r.table_name));
}

/**
 * The order to insert in, so a row never arrives before what it points at.
 *
 * A table pointing at itself is left in place: the id map holds every new id
 * before a single row is inserted, so a parent and its child go in together.
 */
function inOrder(tables: string[], keys: Key[]): string[] {
  const waitsFor = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const key of keys) {
    if (key.table === key.target) continue;
    waitsFor.get(key.table)!.add(key.target);
  }

  const done: string[] = [];
  const placed = new Set<string>();
  /* Alphabetical within a round, so the order is the same every run and a
     failure is reproducible. */
  const left = [...tables].sort();

  while (placed.size < tables.length) {
    const ready = left.filter(
      (t) => !placed.has(t) && [...waitsFor.get(t)!].every((need) => placed.has(need)),
    );
    if (ready.length === 0) {
      /* A cycle between two tables, which this cannot order. It has never
         happened and would need deferrable constraints to solve, so it is
         said out loud rather than worked around. */
      const stuck = left.filter((t) => !placed.has(t));
      throw new Error(`Cannot order these tables for copying, they depend on each other: ${stuck.join(", ")}`);
    }
    for (const t of ready) {
      done.push(t);
      placed.add(t);
    }
  }
  return done;
}

export interface CloneInto {
  slug: string;
  name: string;
  /** Left as it is on the template when not given. */
  timezone?: string;
  demoExpiresAt?: Date | null;
}

/**
 * Copies one church into a new one and gives back the new church's id.
 *
 * The whole copy is one transaction: a half-copied church is worse than none,
 * because a visitor would be shown a directory with no households in it.
 */
export async function cloneTenant(fromTenantId: string, into: CloneInto): Promise<string> {
  const tables = await scopedTables();
  const [columns, keys, hasId] = await Promise.all([
    columnsOf(tables),
    keysAmong(tables),
    tablesWithId(tables),
  ]);

  const order = inOrder(tables, keys);
  const keysFor = new Map<string, Map<string, string>>();
  for (const key of keys) {
    if (!keysFor.has(key.table)) keysFor.set(key.table, new Map());
    keysFor.get(key.table)!.set(key.column, key.target);
  }
  const columnsFor = new Map<string, Column[]>();
  for (const col of columns) {
    if (!columnsFor.has(col.table)) columnsFor.set(col.table, []);
    columnsFor.get(col.table)!.push(col);
  }

  return owner().begin(async (tx) => {
    /*
     * The church's own row, copied column by column rather than named here,
     * so a setting added to a church later comes across without this file
     * being edited. Only what must differ is overridden.
     */
    const tenantCols = await tx<{ column_name: string }[]>`
      select column_name
        from information_schema.columns
       where table_schema = 'public' and table_name = 'tenants'
         and is_generated = 'NEVER' and identity_generation is null
       order by ordinal_position`;

    const override: Record<string, string> = {
      id: "gen_random_uuid()",
      slug: "$1::text",
      name: "$2::text",
      demo_expires_at: "$3::timestamptz",
      created_at: "now()",
      updated_at: "now()",
      /* A copy cannot carry the template's web address: it is unique across
         every church and is the one thing two churches cannot share. */
      portal_name: "null",
      /* Cast and coalesced rather than left out when no timezone is given,
         because a parameter the statement never mentions is a parameter
         Postgres cannot find a type for. */
      timezone: 'coalesce($4::text, "timezone")',
    };

    const pick = tenantCols.map((c) => {
      const said = override[c.column_name];
      return said ? `${said} as "${c.column_name}"` : `"${c.column_name}"`;
    });
    const names = tenantCols.map((c) => `"${c.column_name}"`).join(", ");

    const churchStatement = `insert into tenants (${names})
       select ${pick.join(", ")} from tenants where id = $5::uuid
       returning id`;
    const [made] = await tx.unsafe<{ id: string }[]>(
      churchStatement,
      [into.slug, into.name, into.demoExpiresAt ?? null, into.timezone ?? null, fromTenantId],
    ).catch((trouble: Error) => {
      throw new Error(`Copying the church row failed: ${trouble.message}\n${churchStatement}`);
    }) as { id: string }[];
    if (!made) throw new Error(`No church to copy: ${fromTenantId}`);
    const newTenantId = made.id;

    /*
     * The two churches, checked to be nothing but a uuid before they are
     * written into the statements below. They are written in rather than
     * passed because a statement carrying parameters has to travel on its
     * own, and the whole point of the shape below is that they travel
     * together.
     */
    const from = asUuid(fromTenantId);
    const into_ = asUuid(newTenantId);

    /*
     * Which tables actually hold anything for this church, asked once.
     *
     * Ninety-nine tables and a demo church fills twenty-seven of them. Walking
     * all ninety-nine twice, once to map ids and once to insert, is two
     * hundred round trips to a database that is not on this machine, and that
     * is where the seconds went: not the 872 rows, the waiting.
     */
    const counts = order
      .map((table) => `select ${quote(table)} as t, count(*)::int as n from "${table}" where tenant_id = '${from}'`)
      .join(" union all ");
    const filled = (await tx.unsafe<{ t: string; n: number }[]>(counts))
      .filter((row) => row.n > 0)
      .map((row) => row.t);
    const walking = order.filter((table) => filled.includes(table));

    /*
     * Every new id, worked out before a single row is inserted, so a table
     * that points at itself and a pair that point at each other both land.
     * One statement rather than one per table, for the same reason.
     */
    await tx`
      create temporary table clone_map (
        from_table text not null,
        old_id uuid not null,
        new_id uuid not null default gen_random_uuid(),
        primary key (from_table, old_id)
      ) on commit drop`;

    const mapped = walking
      .filter((table) => hasId.has(table))
      .map((table) => `select ${quote(table)}, id from "${table}" where tenant_id = '${from}'`);
    if (mapped.length > 0) {
      await tx.unsafe(
        `insert into clone_map (from_table, old_id) ${mapped.join(" union all ")}`,
      );
      await tx`analyze clone_map`;
    }

    /** The insert for one table, with the two churches written in. */
    const statementFor = (table: string): string => {
      const cols = columnsFor.get(table) ?? [];
      const pointsAt = keysFor.get(table) ?? new Map<string, string>();
      const select = cols.map((col) => {
        if (col.column === "tenant_id") return `'${into_}'::uuid as "${col.column}"`;
        if (col.column === "id" && hasId.has(table)) {
          return `(select new_id from clone_map where from_table = ${quote(table)} and old_id = t."id") as "${col.column}"`;
        }
        const target = pointsAt.get(col.column);
        if (target && hasId.has(target)) {
          /*
           * A key pointing at a table outside the copy keeps its old value,
           * which is why only the ones inside it are rewritten. The lookup
           * gives null for a null, so an optional link stays optional.
           */
          return `(select new_id from clone_map where from_table = ${quote(target)} and old_id = t."${col.column}") as "${col.column}"`;
        }
        return `t."${col.column}"`;
      });
      const names = cols.map((col) => `"${col.column}"`).join(", ");
      return `insert into "${table}" (${names})
         select ${select.join(", ")} from "${table}" t where t.tenant_id = '${from}'`;
    };

    const inserts = walking.filter((table) => (columnsFor.get(table) ?? []).length > 0);
    /*
     * All of them in one go. The two ids are written in rather than passed,
     * which is what lets these travel together: a statement carrying
     * parameters is a statement on its own.
     */
    try {
      await tx.unsafe(inserts.map(statementFor).join(";\n"));
    } catch (trouble) {
      /*
       * One statement means one message, and it does not say which of the
       * twenty-seven it was. So on a failure they are run again one at a
       * time, which is slow and is happening once, to name the table.
       */
      for (const table of inserts) {
        await tx.unsafe(statementFor(table)).catch((again: Error) => {
          throw new Error(`Copying ${table} failed: ${again.message}\n${statementFor(table)}`);
        });
      }
      throw trouble;
    }

    const copied = walking.length;
    if (copied === 0) throw new Error(`The church at ${fromTenantId} held nothing to copy.`);
    return newTenantId;
  });
}

/** A uuid, refused unless that is exactly what it is. */
function asUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Not a church id: ${value}`);
  }
  return value;
}

/** A literal for the generated SQL above, where a parameter cannot be used. */
function quote(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Not a table name: ${value}`);
  return `'${value}'`;
}

/**
 * What a copy would cover, for the test that holds this honest.
 *
 * Returns the tables it would walk and the order it would walk them in, so a
 * test can clone a church and compare row counts table by table without
 * repeating the discovery and agreeing with itself.
 */
export async function cloneCoverage(): Promise<{ tables: string[]; order: string[]; skipped: string[] }> {
  const tables = await scopedTables();
  const keys = await keysAmong(tables);
  return { tables, order: inOrder(tables, keys), skipped: [...LEAVE_BEHIND] };
}
