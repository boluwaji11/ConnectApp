import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * HRT-453, R21.x. Every screen in the operator portal is in the operator
 * portal's menu.
 *
 * `/security` shipped with HRT-396 and grew the way back in for an owner
 * locked out of their own church with HRT-441, and nothing ever added it to
 * the rail. It was live in production for days, reachable only by somebody
 * who already knew the address. The one page that lets a church's owner back
 * in may as well not exist if it cannot be found on the day it is needed.
 *
 * This lives in the web app's suite because the admin app has no test runner
 * of its own, and a guard that runs is worth more than a guard in the tidier
 * place. It reads the admin app's own files.
 */

const admin = resolve(__dirname, "..", "..", "admin");
const portal = resolve(admin, "app", "(portal)");

/** Every screen under the portal layout, by the address it answers at. */
function screens(): string[] {
  const found: string[] = [];

  const walk = (dir: string, at: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      /* A dynamic segment is a record, not a section of the menu. */
      if (entry.name.startsWith("[") || entry.name.startsWith("@")) continue;
      const here = `${at}/${entry.name}`;
      if (existsSync(resolve(dir, entry.name, "page.tsx"))) found.push(here);
      walk(resolve(dir, entry.name), here);
    }
  };

  walk(portal, "");
  if (existsSync(resolve(portal, "page.tsx"))) found.push("/");
  return found;
}

describe("the operator portal's menu", () => {
  const nav = readFileSync(resolve(admin, "components/shell/nav.ts"), "utf8");

  it("finds the screens it is meant to be checking", () => {
    /* A guard on the guard: a walk that found nothing would pass while
       proving nothing. */
    const all = screens();
    expect(all.length).toBeGreaterThan(4);
    expect(all).toContain("/churches");
  });

  it("names every screen, so none is reachable only by typing its address", () => {
    const missing = screens().filter((href) => !nav.includes(`href: "${href}"`));
    expect(
      missing,
      "portal screens that exist and are in no menu",
    ).toEqual([]);
  });

  it("still names the one that lets somebody back into their church", () => {
    /* Named on its own as well as covered by the sweep above, because this is
       the one whose absence costs a church rather than costing a click. */
    expect(nav).toContain('href: "/security"');
  });
});
