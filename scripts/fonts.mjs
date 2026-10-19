#!/usr/bin/env node
/**
 * Fetches the web fonts once, into the repository, so no build needs Google.
 *
 *   node scripts/fonts.mjs            fetch and rewrite the generated CSS
 *   node scripts/fonts.mjs --check    fail if anything named here is missing
 *
 * `next/font/google` downloads every face at build time. That is four network
 * calls to fonts.googleapis.com on a cold cache, and when one of them fails
 * the build fails with it: it took a production deploy down twice. The files
 * do not change, so they belong in the repository rather than on the critical
 * path of every deploy.
 *
 * Google's own subset files are kept as they are served, with their
 * `unicode-range` intact, because a browser then fetches only the ranges a
 * page actually sets. Rebuilding one file per face would need a subsetter and
 * would load Cyrillic to draw an English sentence.
 *
 * The faces are licensed under the SIL Open Font License, which permits
 * redistribution. `apps/web/public/fonts/OFL.txt` travels with them.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");

/* Asking as a current browser is what gets woff2 back rather than ttf. */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  + " (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/**
 * Every face the product sets, and which app serves it.
 *
 * `axis` is the css2 query: a list for static weights, a range for a variable
 * font. `preload` names the subsets worth a link in the document head, and is
 * empty for a face a page only sometimes reaches.
 */
const FACES = [
  { family: "IBM Plex Serif", axis: "wght@400;600", v: "--font-ibm-plex-serif",
    apps: ["web", "admin"], preload: ["latin"] },
  { family: "IBM Plex Sans", axis: "wght@100..700", v: "--font-ibm-plex-sans",
    apps: ["web", "admin"], preload: ["latin"] },
  { family: "IBM Plex Mono", axis: "wght@400;500", v: "--font-ibm-plex-mono",
    apps: ["web", "admin"], preload: [] },

  /* The six pairings a church can set its own website in. (HRT-380) */
  { family: "Fraunces", axis: "opsz,wght@9..144,100..900", v: "--site-font-fraunces", apps: ["web"], preload: [] },
  { family: "Inter", axis: "wght@100..900", v: "--site-font-inter", apps: ["web"], preload: [] },
  { family: "Outfit", axis: "wght@100..900", v: "--site-font-outfit", apps: ["web"], preload: [] },
  { family: "Playfair Display", axis: "wght@400..900", v: "--site-font-playfair", apps: ["web"], preload: [] },
  { family: "Lora", axis: "wght@400..700", v: "--site-font-lora", apps: ["web"], preload: [] },
  { family: "Source Serif 4", axis: "opsz,wght@8..60,200..900", v: "--site-font-source-serif", apps: ["web"], preload: [] },
  { family: "Source Sans 3", axis: "wght@200..900", v: "--site-font-source-sans", apps: ["web"], preload: [] },
  { family: "Archivo", axis: "wdth,wght@62..125,100..900", v: "--site-font-archivo", apps: ["web"], preload: [] },
  { family: "EB Garamond", axis: "wght@400..800", v: "--site-font-garamond", apps: ["web"], preload: [] },
  { family: "Work Sans", axis: "wght@100..900", v: "--site-font-work-sans", apps: ["web"], preload: [] },

  /* The type gallery sets these two and nothing else does. (/design/type) */
  { family: "Atkinson Hyperlegible Next", axis: "wght@200..800", v: null, apps: ["web"], preload: [] },
  { family: "JetBrains Mono", axis: "wght@100..800", v: null, apps: ["web"], preload: [] },
];

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function cssFor({ family, axis }) {
  const query = `family=${family.replace(/ /g, "+")}${axis ? `:${axis}` : ""}`;
  const url = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  const answer = await fetch(url, { headers: { "user-agent": UA } });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`${family}: ${answer.status} ${text.slice(0, 160)}`);
  return text;
}

/** The @font-face blocks, with the subset name Google writes above each one. */
function parse(css) {
  const out = [];
  const blocks = css.matchAll(/(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g);
  for (const [, subset, body] of blocks) {
    const field = (name) => body.match(new RegExp(`${name}:\\s*([^;]+)`))?.[1]?.trim();
    const src = body.match(/url\((https:[^)]+)\)/)?.[1];
    if (!src) continue;
    out.push({
      subset: subset ?? "all",
      src,
      weight: field("font-weight") ?? "400",
      style: field("font-style") ?? "normal",
      range: field("unicode-range"),
    });
  }
  return out;
}

const apps = { web: resolve(root, "apps/web"), admin: resolve(root, "apps/admin") };
const files = { web: [], admin: [] };
const rules = { web: [], admin: [] };
const vars = { web: [], admin: [] };
const preloads = { web: [], admin: [] };

for (const face of FACES) {
  const css = CHECK ? null : await cssFor(face);
  const faces = css ? parse(css) : [];
  const name = slug(face.family);

  if (CHECK) {
    for (const app of face.apps) {
      const dir = resolve(apps[app], "public/fonts");
      const has = existsSync(dir) && readdirSync(dir).some((f) => f.startsWith(`${name}-`));
      if (!has) throw new Error(`No files for ${face.family} in apps/${app}/public/fonts.`);
    }
    continue;
  }

  for (const one of faces) {
    const answer = await fetch(one.src, { headers: { "user-agent": UA } });
    if (!answer.ok) throw new Error(`${face.family} ${one.subset}: ${answer.status}`);
    const bytes = Buffer.from(await answer.arrayBuffer());
    /* Named by what is in it, so the immutable cache-control in next.config.ts
       is honest: a file at this address can never hold different bytes. */
    const stamp = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
    const file = `${name}-${one.subset}-${one.weight.replace(/\s+/g, "")}-${stamp}.woff2`;
    for (const app of face.apps) {
      files[app].push({ file, bytes });
      rules[app].push(
        `/* ${face.family}, ${one.subset} */\n@font-face {\n`
        + `  font-family: "${face.family}";\n`
        + `  font-style: ${one.style};\n`
        + `  font-weight: ${one.weight};\n`
        + `  font-display: swap;\n`
        + `  src: url(/fonts/${file}) format("woff2");\n`
        + (one.range ? `  unicode-range: ${one.range};\n` : "")
        + `}`,
      );
      if (face.preload.includes(one.subset)) preloads[app].push(`/fonts/${file}`);
    }
  }

  if (face.v) {
    for (const app of face.apps) vars[app].push(`  ${face.v}: "${face.family}";`);
  }
  console.log(`  ${face.family.padEnd(28)} ${String(faces.length).padStart(3)} face(s)`);
}

if (CHECK) {
  console.log("Every face named in scripts/fonts.mjs has files on disk.");
  process.exit(0);
}

const HEAD = `/*\n * Generated by scripts/fonts.mjs. Do not edit.\n *\n`
  + ` * The faces the product sets, served from this app rather than from\n`
  + ` * Google, so no build depends on a network call that can fail.\n */\n\n`;

/* The one face that is not local. See apps/web/app/fonts-emoji.ts. */
vars.web.push(`  --font-emoji: "Noto Color Emoji";`);

for (const app of ["web", "admin"]) {
  const dir = resolve(apps[app], "public/fonts");
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  let bytes = 0;
  for (const { file, bytes: data } of files[app]) {
    writeFileSync(resolve(dir, file), data);
    bytes += data.length;
  }
  writeFileSync(resolve(dir, "OFL.txt"), readFileSync(resolve(root, "scripts/fonts-licence.txt")));
  writeFileSync(
    resolve(apps[app], "app/fonts.css"),
    HEAD + `:root {\n${vars[app].join("\n")}\n}\n\n` + rules[app].join("\n\n") + "\n",
  );
  writeFileSync(
    resolve(apps[app], "app/fonts-preload.ts"),
    `/* Generated by scripts/fonts.mjs. Do not edit. */\n\n`
    + `/** The faces worth a link in the head: the ones every screen sets. */\n`
    + `export const PRELOAD_FONTS = [\n`
    + preloads[app].map((p) => `  "${p}",`).join("\n")
    + `\n] as const;\n`,
  );
  console.log(`\napps/${app}: ${files[app].length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}
