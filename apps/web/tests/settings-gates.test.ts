/**
 * HRT-444, R21.2. Every settings screen refuses somebody who may not read it.
 *
 * The menu hides what a role may not reach, and hiding a link is not a check.
 * `/settings/church` was hidden from anybody without `church.manage` and
 * rendered the church's legal name, address, phone number and email to any
 * member who typed the address. Every other screen in that section already
 * refused; that one refused only the editing.
 *
 * So this walks the screens rather than trusting the menu. A new settings
 * screen that forgets its check fails here on the day it is written, with the
 * name of the screen, rather than on the day somebody goes looking.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SETTINGS = resolve(import.meta.dirname, "../app/(app)/settings");

/**
 * The screens that are a person's own account rather than the church's.
 *
 * Everybody reaches their own profile and their own sign-in, whatever their
 * role, so a permission check on either would be wrong. Named here so that
 * "no check" is a decision somebody made rather than one nobody noticed.
 */
const PERSONAL = new Set(["profile", "security"]);

/** A screen that refuses somebody, however it says so. */
function refuses(source: string): boolean {
  return (
    /\bDenied\b/.test(source)
    || /\bredirect\(/.test(source)
    || /\bnotFound\(/.test(source)
  );
}

const screens = readdirSync(SETTINGS, { withFileTypes: true })
  .filter((one) => one.isDirectory())
  .map((one) => one.name)
  .filter((name) => existsSync(resolve(SETTINGS, name, "page.tsx")))
  .sort();

describe("every settings screen decides who may read it", () => {
  it("finds the screens at all, so a move cannot make this vacuous", () => {
    expect(screens.length).toBeGreaterThan(15);
    expect(screens).toContain("church");
  });

  it.each(screens)("/settings/%s", (name) => {
    const source = readFileSync(resolve(SETTINGS, name, "page.tsx"), "utf8");

    if (PERSONAL.has(name)) {
      /* Nothing to assert beyond the decision being deliberate. */
      expect(PERSONAL.has(name)).toBe(true);
      return;
    }

    expect(refuses(source), `/settings/${name} reads the church and refuses nobody`).toBe(true);
  });
});

describe("the church's own record", () => {
  const source = () =>
    readFileSync(resolve(SETTINGS, "church", "page.tsx"), "utf8");

  it("asks for church.manage before it reads anything", () => {
    const text = source();
    expect(text).toContain("canManageChurch(session)");
    /* Before the read, not after: a refusal that runs second has already
       fetched the record it was meant to withhold. */
    expect(text.indexOf("canManageChurch(session)")).toBeLessThan(text.indexOf("withTenant("));
  });

  it("answers with the same refusal every other screen uses", () => {
    expect(source()).toContain("<Denied");
  });
});
