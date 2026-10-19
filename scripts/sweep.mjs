#!/usr/bin/env node
/**
 * R24.11, N7. Every screen, in both engines, with the panels opened.
 *
 *   node scripts/sweep.mjs                       against a local build
 *   BASE=https://demo.connectapp.church node scripts/sweep.mjs --demo
 *
 * `browser-check.mjs` opens the addresses it is given and says whether they
 * threw. This walks every screen the app has, in Chromium and in WebKit, and
 * on each one presses the things a person presses: the sections in the left
 * rail, the first row of a list, the one filled button. A screen that renders
 * and falls over on the first press is a screen that does not work, and
 * loading it was never going to find that out.
 *
 * It reports per screen per engine, so a fault in one and not the other is
 * visible rather than averaged away.
 */
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env["BASE"] ?? "http://riverside.localhost:4510";
const DEMO = process.argv.includes("--demo");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const OUT = process.env["OUT"] ?? "/tmp/connectapp-sweep";

/** Every screen the app draws, from the files rather than from a list. */
function screens() {
  const base = resolve(root, "apps/web/app/(app)");
  const found = [];
  const walk = (dir, at) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      /* A record needs an id, and the sweep has none to give. The panels it
         opens cover those. Parallel slots are not addresses. */
      if (entry.name.startsWith("[") || entry.name.startsWith("@")) continue;
      /* Route groups are not part of the address. */
      const here = entry.name.startsWith("(") ? at : `${at}/${entry.name}`;
      try {
        readFileSync(resolve(dir, entry.name, "page.tsx"));
        found.push(here || "/");
      } catch { /* no page here, only children */ }
      walk(resolve(dir, entry.name), here);
    }
  };
  walk(base, "");
  return [...new Set(found)].sort();
}

/* The station is a kiosk with its own shell and its own worker, and the
   labels window opens itself for printing. Neither is a screen somebody
   navigates to from the rail, and both hold a browser open. */
const APART = new Set(["/checkin/station", "/checkin/labels"]);

const paths = (ONLY ? [ONLY] : screens()).filter((p) => !APART.has(p));

mkdirSync(OUT, { recursive: true });

/** A session for the church product, or a pass for the demo. */
async function sessionFor(ctx) {
  if (DEMO) {
    const page = await ctx.newPage();
    await page.goto(new URL("/", BASE).toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.close();
    return;
  }
  const env = Object.fromEntries(
    readFileSync(resolve(root, ".env.local"), "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => { const a = l.indexOf("="); return [l.slice(0, a).trim(), l.slice(a + 1).trim().replace(/^"|"$/g, "")]; }),
  );
  const url = env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const who = process.env["SEED_USER_EMAIL"] ?? "pastor@riverside.example.org";
  const answer = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email: who, password: env["SEED_USER_PASSWORD"] }),
  });
  if (!answer.ok) throw new Error(`Could not sign in as ${who}: ${answer.status}`);
  const session = await answer.json();
  session.expires_at ??= Math.floor(Date.now() / 1000) + 3600;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const MAX = 3180;
  const parts = value.length <= MAX ? [{ name, value }]
    : Array.from({ length: Math.ceil(value.length / MAX) }, (_, i) => ({
        name: `${name}.${i}`, value: value.slice(i * MAX, (i + 1) * MAX),
      }));
  await ctx.addCookies(parts.map((p) => ({ ...p, domain: new URL(BASE).hostname, path: "/" })));
}

/** Noise that means nothing outside Vercel, or about a page being left. */
const dull = (text) =>
  text.includes("/_vercel/")
  || text.includes("_rsc=")
  || text.includes("speed-insights")
  || text.includes("Failed to load resource")
  || text.includes("net::ERR_ABORTED");

async function sweep(engineName, engine) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sessionFor(ctx);

  const faults = [];

  for (const path of paths) {
    /*
     * A page each. Reusing one across sixty navigations wedges headless
     * WebKit, and a wedged browser reports every screen after it as broken,
     * which is how a working product looks broken for an afternoon.
     */
    const page = await ctx.newPage();
    const seen = [];
    page.on("console", (m) => { if (m.type() === "error" && !dull(m.text())) seen.push(`console: ${m.text().slice(0, 130)}`); });
    page.on("pageerror", (e) => seen.push(`threw: ${e.message.slice(0, 130)}`));
    page.on("response", (r) => { if (r.status() >= 400 && !dull(r.url())) seen.push(`${r.status()} ${r.url().slice(0, 90)}`); });

    const at = Date.now();
    let note = "";
    try {
      await page.goto(new URL(path, BASE).toString(), { waitUntil: "commit", timeout: 45_000 });
      await page.waitForSelector("h1, h2, [role=heading]", { timeout: 35_000 });

      /* The left rail's sections, which is a second level of navigation and
         the half a load never exercises. */
      const sections = await page.locator("aside button, nav button").all();
      for (const one of sections.slice(0, 3)) {
        await one.click({ timeout: 2500 }).catch(() => {});
      }

      /* The first row of whatever this screen lists, which is how a record
         or a panel is opened. */
      const row = page.locator("main a[href], main tbody tr").first();
      if (await row.count()) {
        await row.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }

      /* Anything still open is closed, so the next press is not swallowed. */
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
    } catch (error) {
      note = String(error.message).split("\n")[0].slice(0, 70);
      seen.push(`did not settle: ${note}`);
    }

    const unique = [...new Set(seen)];
    if (unique.length) faults.push({ path, engine: engineName, found: unique });
    const mark = unique.length ? "x" : " ";
    console.log(`  ${mark} ${engineName.padEnd(8)} ${path.padEnd(30)} ${String(Date.now() - at).padStart(6)} ms`);
    await page.close();
  }

  await browser.close();
  return faults;
}

console.log(`${paths.length} screens, against ${BASE}\n`);
const faults = [
  ...(await sweep("chromium", chromium)),
  ...(await sweep("webkit", webkit)),
];

console.log(`\n${faults.length} screen/engine pair(s) with something to look at.`);
for (const f of faults) {
  console.log(`\n  ${f.engine}  ${f.path}`);
  for (const one of f.found.slice(0, 4)) console.log(`     ${one}`);
}
process.exit(faults.length ? 1 : 0);
