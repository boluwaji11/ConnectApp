/**
 * HRT-30. The complete export (R19.8).
 *
 * This is the trust mechanism rather than a feature. The free-forever argument
 * rests on a church being able to leave whenever they want, and a promise nobody
 * can test is worth nothing. So the tests are about completeness, about the
 * export not leaking a restricted field, and about the file being readable by
 * something that is not us.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import JSZip from "jszip";
import { owner, withTenant, closeConnections, type Tx } from "../src/client";
import { buildArchive, EXPORT_TABLES, ARCHIVE_FORMAT } from "../src/export/archive";
import { zipArchive } from "../src/export/zip";
import { toCsv } from "../src/export/csv";
import { readSheet } from "../src/import/csv";
import { PermissionError, type TenantRole } from "../src/roles";

let riverside: { id: string; name: string; slug: string };
let northgate: { id: string; name: string; slug: string };

const run = <T>(tenantId: string, role: TenantRole, work: (tx: Tx) => Promise<T>) =>
  withTenant({ tenantId, role }, work);

const archiveFor = (tenant: typeof riverside, role: TenantRole = "owner") =>
  run(tenant.id, role, (tx) => buildArchive(tx, { tenantId: tenant.id, role }, tenant));

beforeAll(async () => {
  const rows = await owner()<{ id: string; name: string; slug: string }[]>`
    select id, name, slug from tenants where slug in ('riverside', 'northgate')`;
  riverside = rows.find((t) => t.slug === "riverside")!;
  northgate = rows.find((t) => t.slug === "northgate")!;
});

afterAll(async () => {
  await closeConnections();
});

describe("writing CSV", () => {
  it("quotes a value carrying a comma, a quote, or a newline", () => {
    const csv = toCsv([{ a: "x,y", b: 'he said "no"', c: "one\ntwo" }]);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"he said ""no"""');
    expect(csv).toContain('"one\ntwo"');
  });

  it("starts with a byte order mark, so Excel reads UTF-8 as UTF-8", () => {
    expect(toCsv([{ name: "Zoe" }]).startsWith("﻿")).toBe(true);
  });

  it("stops a cell from being run as a formula when the file is opened", () => {
    // A directory field containing =HYPERLINK(...) or a leading + is the oldest
    // spreadsheet injection there is. A church's own export must not execute.
    const csv = toCsv([{ note: "=1+1" }, { note: "+44 20 7946 0000" }, { note: "@someone" }]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+44 20 7946 0000");
    expect(csv).toContain("'@someone");
  });

  it("round-trips through the reader that reads a church's own file", () => {
    const rows = [{ first: "Sarah", last: "Bennett", note: 'a "quoted", multi\nline value' }];
    const parsed = readSheet(toCsv(rows));
    expect(parsed.rows[0]).toEqual(rows[0]);
  });

  it("writes a header even when there are no rows", () => {
    expect(toCsv([], ["id", "name"])).toContain("id,name");
  });
});

describe("what comes out", () => {
  it("covers every table that holds church data", async () => {
    const archive = await archiveFor(riverside);

    const tenantTables = (
      await owner()<{ relname: string }[]>`
        select c.relname
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and a.attnum > 0
         where n.nspname = 'public' and c.relkind = 'r'
           -- SEC-011. The platform's own log names the church an operator
           -- acted on, which is not the same as being the church's record of
           -- itself, and the application role is denied the table.
           and c.relname not like 'platform\_%'`
    ).map((r) => r.relname);

    // Every table with a tenant_id must be in the export, plus tenants itself.
    // A table added later and forgotten is an export that quietly stops being
    // complete, which is the failure this catches.
    const missing = tenantTables.filter((t) => !EXPORT_TABLES.includes(t as never));
    expect(missing).toEqual([]);
    expect(EXPORT_TABLES).toContain("tenants");
    expect(EXPORT_TABLES).not.toContain("platform_events");

    for (const table of EXPORT_TABLES) {
      expect(archive.data[table], `${table} missing from the archive`).toBeDefined();
      expect(archive.csv[table], `${table} missing from the CSVs`).toBeDefined();
    }
  });

  it("contains the church's actual members", async () => {
    const archive = await archiveFor(riverside);
    const names = archive.data["members"]!.map((p) => p["last_name"]);
    expect(names).toContain("Bennett");
    expect(archive.meta.counts["members"]).toBe(archive.data["members"]!.length);
  });

  it("contains no other church's rows", async () => {
    const archive = await archiveFor(riverside);
    const names = archive.data["members"]!.map((p) => p["last_name"]);
    expect(names).not.toContain("Halvorsen");

    const tenants = archive.data["tenants"]!;
    expect(tenants).toHaveLength(1);
    expect(tenants[0]!["slug"]).toBe("riverside");
  });

  /*
   * A table the church has not used yet has no row to read column names off,
   * and a CSV built from no columns is a byte order mark and nothing else. A
   * spreadsheet shows that as one cell of mojibake, so an export full of
   * tables a church has not reached yet reads as a corrupt file.
   */
  it("gives every table its header row, including the ones never used", async () => {
    const archive = await archiveFor(riverside);

    const empty = Object.entries(archive.data)
      .filter(([, rows]) => rows.length === 0)
      .map(([table]) => table);

    expect(empty.length).toBeGreaterThan(0);

    for (const table of empty) {
      const text = archive.csv[table]!.replace(/^\uFEFF/, "").trim();
      expect(text, `${table} has no header row`).not.toBe("");
      expect(text.split(",").length, `${table} has no columns`).toBeGreaterThan(1);
    }
  });

  it("states its format, so a reader in two years knows what it is", async () => {
    const archive = await archiveFor(riverside);
    expect(archive.meta.format).toBe(ARCHIVE_FORMAT);
    expect(archive.meta.church).toBe(riverside.name);
    expect(Date.parse(archive.meta.exportedAt)).not.toBeNaN();
  });
});

describe("field-level permissions apply to an export too (R1.5, R21.2)", () => {
  it("gives an owner the confidential notes in plain text, not as ciphertext", async () => {
    const archive = await archiveFor(riverside, "owner");
    const confidential = archive.data["notes"]!.filter((n) => n["classification"] === "confidential");
    expect(confidential.length).toBeGreaterThan(0);

    for (const note of confidential) {
      expect(typeof note["body"]).toBe("string");
      expect(note["body"]).not.toMatch(/^v1\./);
      // The ciphertext column never leaves the module.
      expect(note).not.toHaveProperty("body_encrypted");
    }
    /*
     * The note's own body is the thing this test is about. The list is not
     * asserted empty, because a church that has connected its email withholds
     * its sealed provider credential from every role including this one, and
     * that is the archive doing its job rather than a role being refused.
     */
    expect(archive.meta.withheld).not.toContain("notes.body");
  });

  it("withholds them from a role that may not read them, and says so", async () => {
    const archive = await archiveFor(riverside, "admin");
    const confidential = archive.data["notes"]!.filter((n) => n["classification"] === "confidential");
    expect(confidential.length).toBeGreaterThan(0);

    for (const note of confidential) {
      // Absent, not blank, so a consumer that forgets to check renders nothing.
      expect(note).not.toHaveProperty("body");
      expect(note).not.toHaveProperty("body_encrypted");
      expect(note["restricted"]).toBe(true);
    }
    expect(archive.meta.withheld).toContain("notes.body");
  });

  it("never writes a sealed provider credential, under either of its names", async () => {
    const archive = await archiveFor(riverside, "owner");
    for (const row of archive.data["church_providers"] ?? []) {
      expect(row).not.toHaveProperty("access_token");
      expect(row).not.toHaveProperty("credential_key_id");
      expect(row["credential"] === "sealed" || row["credential"] === null).toBe(true);
    }
    expect(archive.csv["church_providers"]).not.toContain("access_token");
  });

  it("never writes ciphertext into the CSVs either", async () => {
    const archive = await archiveFor(riverside, "admin");
    expect(archive.csv["notes"]).not.toContain("v1.");
    expect(archive.csv["notes"]).not.toContain("body_encrypted");
  });

  it("refuses a role that cannot be handed every record at once", async () => {
    for (const role of ["staff", "pastoral", "member"] as TenantRole[]) {
      await expect(archiveFor(riverside, role)).rejects.toThrow(PermissionError);
    }
  });
});

describe("the file itself", () => {
  it("is a zip that something other than us can open", async () => {
    const archive = await archiveFor(riverside);
    const buffer = await zipArchive(archive);

    // Read back with a fresh reader, not the one that wrote it.
    const opened = await JSZip.loadAsync(buffer);
    const names = Object.keys(opened.files);

    expect(names).toContain("connectapp-export.json");
    expect(names).toContain("README.txt");
    expect(names).toContain("csv/members.csv");

    const json = JSON.parse(await opened.file("connectapp-export.json")!.async("string"));
    expect(json.meta.format).toBe(ARCHIVE_FORMAT);
    expect(json.data.members.length).toBe(archive.data["members"]!.length);

    // And the CSV inside the zip is still a CSV a spreadsheet can read.
    const members = readSheet(await opened.file("csv/members.csv")!.async("string"));
    expect(members.rows.length).toBe(archive.data["members"]!.length);
    expect(members.headers).toContain("last_name");
  });

  it("carries a readme, because the person opening it will not have this repository", async () => {
    const archive = await archiveFor(riverside);
    const opened = await JSZip.loadAsync(await zipArchive(archive));
    const readme = await opened.file("README.txt")!.async("string");

    expect(readme).toContain(riverside.name);
    expect(readme).toContain("AGPL-3.0");
    expect(readme).toContain("members:");
  });

  it("names what was withheld in the readme rather than leaving it to be noticed", async () => {
    const archive = await archiveFor(riverside, "admin");
    const opened = await JSZip.loadAsync(await zipArchive(archive));
    const readme = await opened.file("README.txt")!.async("string");
    expect(readme).toContain("notes.body");
  });

  it("exports a second church without leaking the first into it", async () => {
    const archive = await archiveFor(northgate);
    const opened = await JSZip.loadAsync(await zipArchive(archive));
    const members = await opened.file("csv/members.csv")!.async("string");
    expect(members).toContain("Halvorsen");
    expect(members).not.toContain("Bennett");
  });
});
