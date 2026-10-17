import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { t } from "@connectapp/i18n";
import { en } from "../src/messages/en";
import { browserWords } from "../src/messages/client";

/**
 * R20.1, R24.11. The guard on the words the browser is given.
 *
 * The browser holds a subset, so a screen naming a word that was left out
 * would draw its key: `members.title` where the heading should be. Two things
 * stop that. The generator takes a whole group whenever a screen builds a key
 * at runtime, and this fails if the committed file no longer matches what the
 * screens name.
 */
const root = fileURLToPath(new URL("../../..", import.meta.url));
const OUT = `${root}/packages/i18n/src/messages/client.ts`;

/**
 * R20.1. Anything that is not a browser reads the whole catalogue.
 *
 * The split was keyed on `react-server` for an afternoon, and CI found what
 * that misses: the data layer builds its error messages through `t` and runs
 * under plain Node, where no such condition is set, so a church being told a
 * merge is too old to undo got `merge.error.tooOld` instead of the sentence.
 * It is the `browser` condition now, and this is what holds it there.
 */
describe("what anything outside a browser reads", () => {
  it("is the whole catalogue, not the screens' share of it", () => {
    expect(t("merge.error.tooOld")).toBe(en["merge.error.tooOld"]);
    expect(t("send.foot.sentTo", { address: "someone@example.org" })).not.toContain("send.foot");
  });
});

describe("the words the browser is given", () => {
  it("is what the screens name today", () => {
    const before = readFileSync(OUT, "utf8");
    execFileSync("node", [`${root}/scripts/build-client-catalogue.mjs`], { cwd: root });
    const after = readFileSync(OUT, "utf8");

    expect(
      after === before,
      "packages/i18n/src/messages/client.ts is stale. Run `pnpm catalogue`.",
    ).toBe(true);
  });

  it("says the same words as the catalogue it came from", () => {
    for (const [key, words] of Object.entries(browserWords)) {
      expect(words).toBe(en[key as keyof typeof en]);
    }
  });

  /*
   * The gap the generator cannot see.
   *
   * It follows this app's own files and stops at a package, so a table of
   * labels held in `@connectapp/db` and read on a screen with `t(one.name)`
   * reached the browser as its own key: the panel that starts a form listed
   * "template.connection" to the church. Every other library keeps its labels
   * beside the screen, which is why this is the only one that needs naming.
   */
  it("holds the form template names, which live in a package", () => {
    /* Read rather than imported: `@connectapp/db` depends on this package, so
       importing it back would be a cycle. */
    const source = readFileSync(`${root}/packages/db/src/repo/form-templates.ts`, "utf8");
    const names = [...source.matchAll(/^\s*name: "(template\.[A-Za-z0-9]+)",$/gm)].map((m) => m[1]!);

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(
        browserWords[name as keyof typeof browserWords],
        `${name} is missing from the browser's catalogue, so the panel that starts a form would draw the key. Name it in apps/web/app/(app)/forms/new-form.tsx.`,
      ).toBeTruthy();
    }
  });

  it("leaves out what only the server writes", () => {
    /* A sample of words that are only ever rendered on the server: an email's
       footer, a giving statement, the importer. If one of these turns up in
       the browser's catalogue the saving has quietly gone. */
    expect(browserWords["send.foot.sentTo"]).toBeUndefined();
    expect(Object.keys(browserWords).length).toBeLessThan(Object.keys(en).length * 0.8);
  });
});
