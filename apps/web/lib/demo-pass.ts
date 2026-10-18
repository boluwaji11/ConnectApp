import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

/**
 * R19.7. How a demo visitor is recognised, without an account.
 *
 * A demo is meant to cost nothing to look at, so it asks for nothing: no email,
 * no password, no account of any kind. The visitor carries a signed cookie
 * naming the throwaway church that was built for them.
 *
 * The signature stops the cookie being rewritten to name somebody else's
 * church. It is not the only thing stopping it: the session layer also refuses
 * any tenant without a demo expiry in the future, so a forged pass pointing at
 * a real church is refused twice.
 */

import { DEMO_COOKIE } from "./demo-pass-name";

const COOKIE = DEMO_COOKIE;

const secret = (): string => {
  const value = process.env["DEMO_PASS_SECRET"] ?? process.env["NOTE_ENCRYPTION_KEY"];
  if (!value) throw new Error("DEMO_PASS_SECRET or NOTE_ENCRYPTION_KEY must be set.");
  return value;
};

const sign = (payload: string): string =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

const sameSignature = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Compared in constant time, and only when the lengths already match, because
  // timingSafeEqual throws on a length mismatch and that throw is itself a tell.
  return left.length === right.length && timingSafeEqual(left, right);
};

export interface DemoPass {
  tenantId: string;
  userId: string;
}

export const newDemoUserId = (): string => randomUUID();

export async function issueDemoPass(
  tenantId: string,
  userId: string,
  expiresAt: Date,
): Promise<void> {
  const payload = `${tenantId}.${userId}.${expiresAt.getTime()}`;
  const store = await cookies();
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function readDemoPass(): Promise<DemoPass | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [tenantId, userId, expiry, signature] = parts as [string, string, string, string];

  const payload = `${tenantId}.${userId}.${expiry}`;
  if (!sameSignature(sign(payload), signature)) return null;
  if (!Number(expiry) || Number(expiry) < Date.now()) return null;

  return { tenantId, userId };
}

export async function clearDemoPass(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
