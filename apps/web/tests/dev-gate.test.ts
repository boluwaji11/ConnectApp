/**
 * SEC-028, HRT-402. The pass the development deployment is behind.
 *
 * Minted by one route that has just read the team list, and checked on every
 * request after that with no round trip. So the signature is the whole of it,
 * and it was compared with `!==` rather than verified.
 *
 * The round trip through mint and check is the part worth testing: a pass this
 * deployment did not sign, a pass whose body was edited, and a pass that has
 * run out all have to come back false, and the one it signed itself has to come
 * back true.
 */
import { describe, it, expect, beforeAll } from "vitest";

process.env["DEV_GATE_SECRET"] = "a-throwaway-secret-for-a-throwaway-test";

let mod: typeof import("../lib/dev-gate");

beforeAll(async () => {
  mod = await import("../lib/dev-gate");
});

const USER = "11111111-1111-1111-1111-111111111111";

describe("a development pass", () => {
  it("holds the one it signed itself", async () => {
    const pass = await mod.mintPass(USER);
    expect(pass).not.toBeNull();
    expect(await mod.passHolds(pass!)).toBe(true);
  });

  it("refuses one with the signature changed", async () => {
    const pass = (await mod.mintPass(USER))!;
    const cut = pass.lastIndexOf(".");
    const flipped = `${pass.slice(0, cut)}.${pass.slice(cut + 1).split("").reverse().join("")}`;
    expect(await mod.passHolds(flipped)).toBe(false);
  });

  it("refuses one with the body changed, signature and all", async () => {
    const pass = (await mod.mintPass(USER))!;
    const [body, mac] = [pass.slice(0, pass.lastIndexOf(".")), pass.slice(pass.lastIndexOf(".") + 1)];
    const other = body.replace(USER, "22222222-2222-2222-2222-222222222222");
    expect(await mod.passHolds(`${other}.${mac}`)).toBe(false);
  });

  it("refuses one that has run out", async () => {
    const pass = (await mod.mintPass(USER))!;
    const mac = pass.slice(pass.lastIndexOf(".") + 1);
    expect(await mod.passHolds(`${USER}.1.${mac}`)).toBe(false);
  });

  it("refuses nonsense rather than throwing on it", async () => {
    for (const bad of ["", "x", "x.y", "....", "not-base64!!.z", `${USER}.abc.$$$`]) {
      expect(await mod.passHolds(bad), bad).toBe(false);
    }
  });

  it("refuses nothing at all", async () => {
    expect(await mod.passHolds(undefined)).toBe(false);
  });
});

describe("what stays open without one", () => {
  it("keeps the door and the machine routes reachable", () => {
    for (const path of ["/dev-gate", "/sign-in", "/auth/callback", "/api/stripe/webhook"]) {
      expect(mod.openInDev(path), path).toBe(true);
    }
  });

  it("closes everything else", () => {
    for (const path of ["/", "/dashboard", "/members", "/settings/church", "/give/riverside"]) {
      expect(mod.openInDev(path), path).toBe(false);
    }
  });
});
