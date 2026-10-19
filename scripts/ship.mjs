#!/usr/bin/env node
/**
 * HRT-440, HRT-450. A look at production before anything moves.
 *
 * This used to apply the migrations itself and then push. It does not any
 * more: `.github/workflows/deploy.yml` runs on a push to `production` and
 * does the database first and the deployment second, so a merge is the whole
 * of deploying and nothing depends on anybody running a script.
 *
 * What is left is the looking, which is still worth doing before a release
 * rather than after one:
 *
 *   node scripts/ship.mjs          what production is missing, and nothing else
 *   node scripts/ship.mjs --go     the same, then move the branch
 *
 * `--go` is a convenience for pushing from here. Merging `main` into
 * `production` on GitHub does exactly the same thing.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GO = process.argv.includes("--go");

const run = (cmd, args, env) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } }).trim();

const quiet = (cmd, args, env) => {
  try {
    return run(cmd, args, env);
  } catch (error) {
    return error.stdout?.toString().trim() ?? "";
  }
};

const checks = [];
const note = (level, title, detail) => checks.push({ level, title, detail });
const ok = (title, detail) => note("ok", title, detail);
const warn = (title, detail) => note("warn", title, detail);
const stop = (title, detail) => note("stop", title, detail);

/* ------------------------------------------------------------------ */
/* 1. The working tree and the branch                                  */
/* ------------------------------------------------------------------ */

const branch = quiet("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const dirty = quiet("git", ["status", "--porcelain"]);
const head = quiet("git", ["rev-parse", "--short", "HEAD"]);

if (branch !== "main") stop("Branch", `You are on ${branch}. Production is moved forward from main.`);
else ok("Branch", `main at ${head}`);

if (dirty) stop("Working tree", `${dirty.split("\n").length} uncommitted file(s). Commit or stash first.`);
else ok("Working tree", "clean");

quiet("git", ["fetch", "origin", "--quiet"]);
const ahead = quiet("git", ["rev-list", "--count", "origin/main..HEAD"]);
const behind = quiet("git", ["rev-list", "--count", "HEAD..origin/main"]);
if (behind !== "0") stop("Up to date", `origin/main is ${behind} commit(s) ahead. Pull first.`);
else if (ahead !== "0") stop("Up to date", `${ahead} commit(s) not pushed. Push to main first.`);
else ok("Up to date", "main matches origin/main");

/* What production would be moving over, so the size of it is visible. */
const moving = quiet("git", ["rev-list", "--count", "origin/production..HEAD"]);
const summary = quiet("git", ["log", "--oneline", "origin/production..HEAD"]);
if (moving === "0") warn("Nothing to move", "production already holds this commit.");
else ok("Commits to move", `${moving}\n${summary.split("\n").slice(0, 8).map((l) => `      ${l}`).join("\n")}`);

/* ------------------------------------------------------------------ */
/* 2. Continuous integration                                           */
/* ------------------------------------------------------------------ */

const ci = quiet("gh", ["run", "list", "--branch", "main", "--limit", "1",
  "--json", "headSha,conclusion,status"]);
try {
  const [last] = JSON.parse(ci || "[]");
  if (!last) warn("CI", "No run found for main.");
  else if (!last.headSha.startsWith(head)) warn("CI", `Newest run is for ${last.headSha.slice(0, 7)}, not ${head}.`);
  else if (last.status !== "completed") stop("CI", "Still running. Wait for it.");
  else if (last.conclusion !== "success") stop("CI", `Last run ${last.conclusion}.`);
  else ok("CI", "green on this commit");
} catch {
  warn("CI", "Could not be read. Is the gh CLI signed in?");
}

/* ------------------------------------------------------------------ */
/* 3. The database                                                     */
/* ------------------------------------------------------------------ */

const pending = quiet("pnpm", ["--filter", "@connectapp/db", "pending"], {
  CONNECTAPP_ENV: "production",
});
const count = Number(/pending: (\d+)/.exec(pending)?.[1] ?? "-1");
const names = pending.split("\n").filter((l) => l.startsWith("  "));

if (count < 0) stop("Migrations", "Production could not be read. Is .env.production.local in place?");
else if (count === 0) ok("Migrations", "production has every migration");
else note(GO ? "ok" : "warn", "Migrations", `${count} to apply:\n${names.map((n) => `    ${n}`).join("\n")}`);

/* ------------------------------------------------------------------ */
/* 4. The environment                                                  */
/* ------------------------------------------------------------------ */

/*
 * Every name .env.example documents, less the ones production is right not to
 * have. A check that cries about a seed password on every run is a check
 * people learn to scroll past.
 */
const NOT_IN_PRODUCTION = new Set([
  /* Seeded accounts exist in development and nowhere else. */
  "SEED_USER_PASSWORD",
  /* Off unless a deployment turns it on, and absent means off. */
  "PASSKEYS_ENABLED",
  /* The development deployment's own door. */
  "DEV_GATE_SECRET",
  "DEV_TEAM",
]);

const wanted = readFileSync(resolve(ROOT, ".env.example"), "utf8")
  .split("\n")
  .map((line) => /^([A-Z0-9_]+)=/.exec(line.trim())?.[1])
  .filter((one) => Boolean(one) && !NOT_IN_PRODUCTION.has(one));

/*
 * The linked project only. The other one is a separate link and asking for it
 * from here means naming a scope, which is the kind of thing that is wrong in
 * one environment and right in another. It is listed as a reminder instead.
 */
const listed = quiet("vercel", ["env", "ls", "production"]);
if (!listed || !listed.includes("name ")) {
  warn("Environment", "Vercel could not be read. Is the CLI signed in and the project linked?");
} else {
  const have = new Set(
    listed
      .split("\n")
      .map((line) => /^\s{1,3}([A-Z0-9_]+)\s/.exec(line)?.[1])
      .filter((one) => Boolean(one)),
  );
  const missing = wanted.filter((one) => !have.has(one));
  const project = /found for \S+\/(\S+)/.exec(listed)?.[1] ?? "the linked project";

  if (have.size === 0) warn("Environment", "No names were read back, so this check says nothing.");
  else if (missing.length === 0) ok(`Environment (${project})`, `${have.size} set, every documented name among them`);
  else warn(`Environment (${project})`, `documented but not set: ${missing.join(", ")}`);

  warn("Environment (the other app)", "Only the linked project is read. Check the other one by hand.");
}

/* ------------------------------------------------------------------ */
/* 5. Say it                                                           */
/* ------------------------------------------------------------------ */

const mark = { ok: "  ok  ", warn: " warn ", stop: " STOP " };
console.log("");
for (const one of checks) {
  console.log(`[${mark[one.level]}] ${one.title}`);
  for (const line of String(one.detail).split("\n")) console.log(`         ${line}`);
}

const blocked = checks.filter((one) => one.level === "stop");
const warned = checks.filter((one) => one.level === "warn");
console.log("");

if (blocked.length > 0) {
  console.log(`Not ready: ${blocked.length} thing(s) to settle first.`);
  process.exit(1);
}

console.log(
  `Ready.${warned.length > 0 ? ` ${warned.length} warning(s), which do not stop a deploy.` : ""}`,
);

if (!GO) {
  console.log("");
  console.log("Nothing has been changed. To do it:  node scripts/ship.mjs --go");
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* 6. Do it                                                            */
/* ------------------------------------------------------------------ */

const ask = createInterface({ input: process.stdin, output: process.stdout });
const said = await ask.question(`\nMove production to ${head}? Type the commit to confirm: `);
ask.close();

if (said.trim() !== head) {
  console.log("Nothing has been changed.");
  process.exit(1);
}

/*
 * HRT-450. The migrations are not applied here.
 *
 * The deploy workflow applies them on the push below, before it deploys
 * anything, which is the only ordering that cannot be raced. Doing it here as
 * well would run them twice and would put the one place that decides the
 * order back into a script somebody has to remember.
 */
console.log("\nMoving production forward...");
console.log(run("git", ["push", "--force-with-lease", "origin", "main:production"]));
console.log(
  count > 0
    ? `\nDone. The deploy workflow is applying ${count} migration(s), then deploying.`
    : "\nDone. The deploy workflow is deploying.",
);
console.log("Watch it with: gh run watch");
