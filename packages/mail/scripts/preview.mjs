/**
 * R16.4. Every email ConnectApp sends, drawn and photographed.
 *
 * Reading markup is not reading an email. This renders each message in a real
 * browser at phone and desktop width, writes a PNG a person can look at, and
 * prints the address behind every button so a link that stopped being ours is
 * visible rather than inferred.
 *
 * It is run once per site, because `HOME` is read when the module loads and a
 * second import in the same process keeps the first answer. The first version
 * of this did exactly that and reported the development welcome linking to the
 * production dashboard, which was the script rather than the product.
 *
 *   PLATFORM_SITE=https://connectapp.church LABEL=prod node packages/mail/scripts/preview.mjs
 *
 * Output lands in email-previews/, which is not committed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../../..");
const OUT = resolve(ROOT, "email-previews");

/** The token a real link carries, as Supabase would mint it. */
const TOKEN = "pkce_9f2c1b7a4e8d0c3f6b5a2e9d8c7b6a5f4e3d2c1b";

const SITE = process.env["PLATFORM_SITE"] ?? "https://connectapp.church";
const LABEL = process.env["LABEL"] ?? "prod";

async function messagesFor(site) {
  const mail = await import("../src/index.ts");
  const link = `${site}/auth/verify?token=${TOKEN}&type=signup&redirect_to=${site}/auth/callback`;

  return [
    ["confirm-email", "Confirm your email address", mail.authMessage("signup", link)],
    ["confirm-new-email", "Confirm your new email address", mail.authMessage("email_change", link)],
    ["reset-password", "Set a new password", mail.authMessage("recovery", link)],
    ["sign-in", "Sign in to ConnectApp", mail.authMessage("magiclink", link)],
    ["team-invitation", "ConnectApp team invitation", mail.authMessage("teaminvite", link)],
    ["welcome", "Welcome", mail.welcomeMessage({
      church: "Riverside Fellowship", slug: "riverside",
      to: "pastor@riverside.example.org", approved: false, cap: 25,
    })],
    ["welcome-approved", "Welcome, already approved", mail.welcomeMessage({
      church: "Riverside Fellowship", slug: "riverside",
      to: "pastor@riverside.example.org", approved: true, cap: 25,
    })],
    ["church-approved", "Church approved", mail.approvedMessage({
      church: "Riverside Fellowship", slug: "riverside", to: "pastor@riverside.example.org",
    })],
  ];
}

const browser = await chromium.launch();
const report = [];

{
  const label = LABEL;
  const site = SITE;
  mkdirSync(resolve(OUT, label), { recursive: true });
  const page = await browser.newPage({ viewport: { width: 760, height: 900 } });

  for (const [slug, name, message] of await messagesFor(site)) {
    await page.setContent(message.html, { waitUntil: "load" });
    const file = resolve(OUT, label, `${slug}.png`);
    await page.screenshot({ path: file, fullPage: true });

    const links = await page.locator("a").evaluateAll((els) =>
      els.map((e) => ({ text: (e.textContent ?? "").trim(), href: e.getAttribute("href") ?? "" })));

    report.push({ label, slug, name, subject: message.subject, links });
  }
  await page.close();
}

await browser.close();

/* A page to open, rather than sixteen files to find. Each run writes its own
   and a tiny index links the two, so the two sites can sit side by side. */
const rows = report.map((one) =>
  `<section><h2>${one.name} <small>(${one.label})</small></h2>`
  + `<p><b>Subject:</b> ${one.subject} <i>(${one.subject.length} characters)</i></p>`
  + `<ul>${one.links.map((l) => `<li>${l.text || "(button)"}: <code>${l.href}</code></li>`).join("")}</ul>`
  + `<img src="${one.label}/${one.slug}.png" width="700"></section>`).join("\n");

writeFileSync(resolve(OUT, `${LABEL}.html`),
  `<!doctype html><meta charset="utf-8"><title>ConnectApp emails</title>`
  + `<style>body{font:15px system-ui;max-width:860px;margin:40px auto;padding:0 16px}`
  + `img{border:1px solid #ddd;border-radius:8px}code{font-size:12px;word-break:break-all}`
  + `section{margin:0 0 56px}</style><h1>Every email ConnectApp sends</h1>${rows}`);

for (const one of report) {
  console.log(`${one.label.padEnd(5)} ${one.slug.padEnd(20)} ${one.subject}`);
  for (const l of one.links) console.log(`        ${l.href}`);
}
console.log(`\nOpen ${resolve(OUT, `${LABEL}.html`)}`);
