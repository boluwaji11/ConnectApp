import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * HRT-288, R16.1. Connecting Resend without a church ever seeing a key.
 *
 * The church presses one button, lands on Resend's own consent screen, signs
 * in or signs up there, and comes back connected. Pasting an API key was the
 * same grant with a volunteer in the middle of it, and the middle is where a
 * church gives up.
 *
 * A public client with PKCE, which is what Resend issues through its own
 * registration endpoint: there is no client secret to keep, and the code that
 * comes back is worthless without the verifier that never left this server.
 */

const RESEND = "https://api.resend.com";

/**
 * R16.1. Full access, because it is the only scope that can create a domain.
 *
 * `emails:send` covers sending and nothing else, so a church granting it would
 * still have to go and make its own sending domain. The screen says what this
 * means before the press.
 */
const SCOPE = "full_access";

/** The client Resend issued us. Registered once per environment. */
export const resendClientId = (): string | null =>
  process.env["RESEND_OAUTH_CLIENT_ID"]?.trim() || null;

/** Base64url, which is what every value in this exchange is written in. */
const url64 = (raw: Buffer): string => raw.toString("base64url");

/**
 * HRT-288, R1.4. Everything the way back needs, sealed into the state.
 *
 * Resend returns to one registered address, and that address is the parent
 * rather than any church's own name. In development a session cookie set on
 * `riverside.localhost` is not sent to `localhost`, so the landing has no
 * session and no cookie of ours to read, and an earlier version sent the
 * church through a sign-in in the middle of connecting.
 *
 * So the state carries it: which church, who pressed it, what mail goes out
 * as, and the PKCE verifier. Sealed with AES-256-GCM under a key derived from
 * the provider key, so what travels through the browser is opaque and cannot
 * be altered without the tag failing, and good for fifteen minutes, which is
 * long enough to sign up at Resend and short enough that a link left in a
 * browser's history is spent.
 */
export interface Handshake {
  tenantId: string;
  role: string;
  userId: string | null;
  host: string;
  from: string;
  name: string;
  verifier: string;
  /**
   * SEC-014. The hash of a nonce left in a cookie on the browser that started
   * this, so the handshake is bound to that browser and not merely unguessable.
   *
   * Sealed, so it cannot be swapped, and stored as a hash so the sealed state
   * is not itself the secret. Optional only so a handshake minted by the
   * version before this one is refused rather than crashing.
   */
  nonce?: string;
  /** Seconds since the epoch, after which this is refused. */
  until: number;
}

/** SEC-014. The cookie holding the other half of the handshake. */
export const RESEND_NONCE = "connectapp-resend";

/** A nonce for the browser, and the hash of it for the sealed state. */
export function newNonce(): { value: string; hashed: string } {
  const value = url64(randomBytes(32));
  return { value, hashed: hashNonce(value) };
}

export const hashNonce = (value: string): string =>
  createHash("sha256").update(`resend-nonce:${value}`).digest("base64url");

const MINUTES = 15;

const handshakeKey = (): Buffer =>
  createHash("sha256")
    .update(`${process.env["PROVIDER_CREDENTIAL_KEY"] ?? ""}:resend-handshake`)
    .digest();

export function sealHandshake(held: Omit<Handshake, "until">): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", handshakeKey(), iv);
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify({ ...held, until: Math.floor(Date.now() / 1000) + MINUTES * 60 }),
      "utf8",
    ),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

export function openHandshake(token: string): Handshake | null {
  try {
    const [ivPart, tagPart, bodyPart] = token.split(".");
    if (!ivPart || !tagPart || !bodyPart) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      handshakeKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const held = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(bodyPart, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as Handshake;

    return held.until > Math.floor(Date.now() / 1000) ? held : null;
  } catch {
    /* Tampered with, from another key, or simply old. */
    return null;
  }
}

/** The proof that the code came back to whoever asked for it. */
export const newVerifier = (): string => url64(randomBytes(64));

/** Where the church is sent to say yes. */
export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
}): string {
  const challenge = url64(createHash("sha256").update(input.verifier).digest());
  const query = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    scope: SCOPE,
    state: input.state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${RESEND}/oauth/authorize?${query.toString()}`;
}

export interface Tokens {
  accessToken: string;
  /** R16.1. How long the access token has, in seconds. */
  expiresIn: number;
  /**
   * R16.1. What the worker sends with, months from now.
   *
   * Resend rotates this on every use and refuses a token used twice, which
   * can revoke the whole grant, so whatever refreshes it writes the new one
   * back before it does anything else.
   */
  refreshToken: string;
}

/** The code the church came back with, turned into something we can use. */
export async function exchangeCode(input: {
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<{ ok: true; tokens: Tokens } | { ok: false; said: string }> {
  return token(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
    }),
  );
}

async function token(
  body: URLSearchParams,
): Promise<{ ok: true; tokens: Tokens } | { ok: false; said: string }> {
  try {
    const answer = await fetch(`${RESEND}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    const held: unknown = await answer.json().catch(() => null);
    const read = (key: string): string =>
      typeof held === "object" && held !== null && key in held
        ? String((held as Record<string, unknown>)[key])
        : "";

    if (!answer.ok) {
      return {
        ok: false,
        said: (read("error_description") || read("error") || `${answer.status}`).slice(0, 300),
      };
    }

    const accessToken = read("access_token");
    const refreshToken = read("refresh_token");
    if (!accessToken || !refreshToken) return { ok: false, said: `${answer.status}` };

    /* A quarter of an hour unless told otherwise, which is what Resend gives. */
    const seconds = Number(read("expires_in"));
    const expiresIn = Number.isFinite(seconds) && seconds > 0 ? seconds : 900;

    return { ok: true, tokens: { accessToken, refreshToken, expiresIn } };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, said: raw.replace(/\s+/g, " ").trim().slice(0, 300) };
  }
}

/**
 * HRT-290, R16.1. A fresh access token, and the new refresh token that came with it.
 *
 * The access token lasts fifteen minutes and is worth keeping for them: the
 * refresh token that comes back is new every time, the old one is spent, and
 * Resend revokes the grant when a spent one is replayed. So the caller writes
 * both down together, and asks again only when the access token is nearly out.
 */
export async function refreshTokens(
  clientId: string,
  refreshToken: string,
): Promise<{ ok: true; tokens: Tokens } | { ok: false; said: string }> {
  return token(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  );
}

/**
 * R16.1, R21.15. Handing the grant back when a church disconnects.
 *
 * Forgetting our copy is not the same as the church being free of us. The
 * grant is theirs to be rid of, so it is withdrawn at Resend as well, and a
 * failure here never stops the disconnect: the church asked to be
 * disconnected, and it is.
 */
export async function revokeGrant(clientId: string, refreshToken: string): Promise<void> {
  try {
    await fetch(`${RESEND}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    /* Already gone, or unreachable. Either way the church is disconnected. */
  }
}
