/**
 * SEC-014. The Resend handshake is bound to the browser that started it.
 *
 * The landing reads no session, by design: Resend returns to one registered
 * address on the parent host, and in development a church's session cookie is
 * never sent there. So the sealed state carries who asked. It proved that
 * somebody holding the permission asked within the last fifteen minutes, and
 * not that the person finishing it was the person who started it.
 *
 * That gap is a CSRF with an unusual direction. An administrator of any church,
 * including one registered for the purpose, mints the authorize URL and sends
 * it on. If the person who receives it consents on Resend's own screen, their
 * Resend account is attached to the attacker's church, and the scope asked for
 * is full access, so the attacker can then send as that account's verified
 * domains.
 *
 * The nonce closes it: half in a cookie on the browser, half hashed into the
 * sealed state, and the landing wants both.
 */
import { describe, it, expect, beforeAll } from "vitest";

/* The handshake is sealed under a key derived from this, so it has to exist
   before the module is loaded. A throwaway value for a throwaway test. */
process.env["PROVIDER_CREDENTIAL_KEY"] ??= Buffer.alloc(32, 7).toString("base64");

let mod: typeof import("../lib/resend-oauth");

beforeAll(async () => {
  mod = await import("../lib/resend-oauth");
});

const held = () => ({
  tenantId: "11111111-1111-1111-1111-111111111111",
  role: "owner",
  userId: "22222222-2222-2222-2222-222222222222",
  host: "riverside.connectapp.church",
  from: "hello@riverside.org",
  name: "Riverside",
  verifier: "v".repeat(43),
});

describe("the sealed handshake", () => {
  it("comes back out as it went in", () => {
    const nonce = mod.newNonce();
    const open = mod.openHandshake(mod.sealHandshake({ ...held(), nonce: nonce.hashed }));
    expect(open?.tenantId).toBe(held().tenantId);
    expect(open?.nonce).toBe(nonce.hashed);
  });

  it("refuses a state that was tampered with", () => {
    const sealed = mod.sealHandshake({ ...held(), nonce: mod.newNonce().hashed });
    const [iv, tag, body] = sealed.split(".");
    const flipped = `${iv}.${tag}.${body!.slice(0, -2)}AA`;
    expect(mod.openHandshake(flipped)).toBeNull();
  });

  it("carries the hash of the nonce rather than the nonce", () => {
    const nonce = mod.newNonce();
    const sealed = mod.sealHandshake({ ...held(), nonce: nonce.hashed });
    const open = mod.openHandshake(sealed);
    expect(open?.nonce).not.toBe(nonce.value);
    expect(open?.nonce).toBe(mod.hashNonce(nonce.value));
  });

  it("matches only the nonce it was minted with", () => {
    const mine = mod.newNonce();
    const theirs = mod.newNonce();
    expect(mod.hashNonce(mine.value)).not.toBe(mod.hashNonce(theirs.value));
    /* Which is the whole of the check the landing makes: a URL handed to
       somebody else arrives with that person's cookie, or with none. */
    expect(mod.hashNonce(theirs.value)).not.toBe(mine.hashed);
  });

  it("mints a nonce with enough in it to be worth comparing", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(mod.newNonce().value);
    expect(seen.size).toBe(200);
    expect(mod.newNonce().value.length).toBeGreaterThanOrEqual(32);
  });
});
