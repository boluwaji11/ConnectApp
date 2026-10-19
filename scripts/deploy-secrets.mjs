#!/usr/bin/env node
/**
 * HRT-450. Hands GitHub what the deploy workflow needs, once.
 *
 *   node scripts/deploy-secrets.mjs
 *
 * The deploy workflow applies the production migrations and then deploys, in
 * that order, on a push to `production`. To do either it needs credentials,
 * and GitHub is the only place it can read them from. This puts them there.
 *
 * What it reads: `.env.production.local`, which is the file that already holds
 * them and is not in the repository. What it writes: repository secrets and
 * variables, through `gh`, which encrypts them on the way. Nothing is printed.
 *
 * Run it again whenever one of them changes. It overwrites rather than adding
 * a second.
 *
 * This is a real widening of who can reach the production database: anybody
 * who can merge a workflow change can make it read these. That is the trade
 * for a deployment that does not depend on somebody remembering a script, and
 * it is the same trade every deployment pipeline makes. Branch protection on
 * `production` is what keeps the other side of it.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const file = resolve(root, ".env.production.local");
if (!existsSync(file)) {
  console.error("No .env.production.local here. That is the file this reads.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^"|"$/g, "")];
    }),
);

/** Both projects are linked on this machine, so neither id has to be typed. */
const linked = (where) => {
  const path = resolve(root, where, ".vercel", "project.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
};

const web = linked(".");
const admin = linked("apps/admin");

/** A secret is encrypted and unreadable afterwards. A variable is not. */
const secrets = {
  PRODUCTION_DATABASE_URL: env["DATABASE_URL"],
  PRODUCTION_APP_PASSWORD: env["CONNECTAPP_APP_PASSWORD"] ?? env["HEARTH_APP_PASSWORD"],
  VERCEL_TOKEN: process.env["VERCEL_TOKEN"],
};

const variables = {
  VERCEL_ORG_ID: web?.orgId ?? admin?.orgId,
  VERCEL_PROJECT_ID_WEB: web?.projectId,
  VERCEL_PROJECT_ID_ADMIN: admin?.projectId ?? process.env["VERCEL_PROJECT_ID_ADMIN"],
};

const run = (args, input) => {
  const done = spawnSync("gh", args, { input, encoding: "utf8" });
  if (done.status !== 0) {
    console.error(done.stderr?.trim() || `gh ${args[0]} failed`);
    process.exit(1);
  }
};

let missing = [];

for (const [name, value] of Object.entries(secrets)) {
  if (!value) {
    missing.push(name);
    continue;
  }
  /* Through stdin, so it is never an argument and never reaches the shell's
     history or the process list. */
  run(["secret", "set", name], value);
  console.log(`  secret    ${name}  set`);
}

for (const [name, value] of Object.entries(variables)) {
  if (!value) {
    missing.push(name);
    continue;
  }
  run(["variable", "set", name, "--body", value]);
  console.log(`  variable  ${name}  set`);
}

if (missing.length > 0) {
  console.log(`\nStill to set: ${missing.join(", ")}`);
  if (missing.includes("VERCEL_TOKEN")) {
    console.log("  VERCEL_TOKEN: make one at vercel.com/account/tokens, then");
    console.log("    VERCEL_TOKEN=... node scripts/deploy-secrets.mjs");
  }
  if (missing.includes("VERCEL_PROJECT_ID_ADMIN")) {
    console.log("  VERCEL_PROJECT_ID_ADMIN: run `vercel link` in apps/admin, or");
    console.log("    VERCEL_PROJECT_ID_ADMIN=... node scripts/deploy-secrets.mjs");
  }
  process.exit(1);
}

console.log("\nAll set. A push to production now migrates and then deploys.");
