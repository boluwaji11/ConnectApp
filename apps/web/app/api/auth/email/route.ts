import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendAsPlatform, authMessage, HOME } from "@connectapp/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * HRT-392, R1.7, R16.4. Every message Supabase Auth would have sent, sent by
 * us instead.
 *
 * Supabase mints the token behind a confirmation link and will not hand it to
 * anything that is not holding the service role key, which this product keeps
 * out of every request path. The way through is its send hook: it posts the
 * token here and sends nothing itself, so the message is ours to draw and
 * ours to put through Resend, beside the welcome and the approval.
 *
 * What that buys over pointing Supabase's own mail at Resend is that the
 * wording lives in the catalogue rather than pasted into a dashboard, where a
 * change to the brand reaches it and nobody has to remember.
 */

/** What Supabase is being asked to tell somebody. */
type Action = "signup" | "email_change" | "recovery" | "magiclink";

interface Hook {
  user: { email?: string };
  email_data: {
    token_hash: string;
    redirect_to?: string;
    email_action_type: string;
  };
}

/**
 * R21.x. Standard Webhooks, which is what Supabase signs this with.
 *
 * The signed content is the id, the timestamp and the body, joined by dots,
 * and the header carries a space separated list so a secret can be rolled
 * without a gap. Compared in constant time, because comparing a signature
 * with `===` leaks its length and its prefix.
 */
function signed(body: string, headers: Headers, secret: string): boolean {
  const id = headers.get("webhook-id");
  const stamp = headers.get("webhook-timestamp");
  const given = headers.get("webhook-signature");
  if (!id || !stamp || !given) return false;

  /* Five minutes either way, which is the replay window the standard sets. */
  const age = Math.abs(Date.now() / 1000 - Number(stamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^v1,whsec_/, "").replace(/^whsec_/, ""), "base64");
  const ours = createHmac("sha256", key).update(`${id}.${stamp}.${body}`).digest();

  return given.split(" ").some((one) => {
    const theirs = Buffer.from(one.replace(/^v1,/, ""), "base64");
    return theirs.length === ours.length && timingSafeEqual(theirs, ours);
  });
}

/**
 * HRT-392, R1.7, R17.1. The address the button goes to.
 *
 * Our own name, not the project's: a link reading
 * `nvdovjuqcnxacvhxfrmi.supabase.co` in the one message asking a church to
 * trust us is the shape a phishing mail takes. `/auth/verify` hands the token
 * straight on to Supabase, which proves it and sends them back.
 *
 * Back to **our callback**, which is the thing that knows what to do with
 * what comes back. Supabase drops a `redirect_to` it has not been told to
 * allow and falls back to the site's root, where nothing exchanges the code
 * and the token is spent for nothing: that is the expired link a church then
 * meets. So the fallback written here is the callback rather than the root.
 */
function confirmUrl(hook: Hook): string | null {
  /*
   * Our own address, from our own configuration.
   *
   * `site_url` in the payload is not the church-facing site: Supabase hands
   * over its auth API's own base, so building on it produced
   * `<project>.supabase.co/auth/v1/auth/verify`, which is the doubled path
   * that gave the game away. The one name this link may carry is ours.
   */
  const site = HOME.replace(/\/$/, "");
  if (!site) return null;

  /*
   * SEC-008. Clamped before it goes into the link, not only used to pick the
   * host the link points at.
   *
   * `atHost` below already refused a foreign origin when deciding which of our
   * two sites proves the token. The value itself was then passed through
   * untouched, so the emailed link carried `redirect_to=<anything>` onward to
   * Supabase, and Supabase appends the identity to it. Only Supabase's own
   * allowlist stood between a crafted `redirect_to` and a live credential
   * leaving the building, and that allowlist is configuration this repository
   * does not hold.
   */
  const asked = hook.email_data.redirect_to;
  const back = asked && atHost(asked) ? asked : `${site}/auth/callback`;

  /*
   * HRT-401. A link into the admin portal is proved on the portal's own
   * host rather than this one.
   *
   * Supabase sets the session at whichever of our addresses hands it the
   * token, and a session set on connectapp.church is not a session
   * admin.connectapp.church can read: the cookie is host-only there. So an
   * invitation sent through here arrived signed in to the church product and
   * signed out of the portal it was an invitation to.
   */
  const where = atHost(back) ?? site;
  const query = new URLSearchParams({
    token: hook.email_data.token_hash,
    type: hook.email_data.email_action_type,
    redirect_to: back,
  });

  return `${where}/auth/verify?${query.toString()}`;
}

/**
 * HRT-401. The origin of an address we are willing to send somebody to.
 *
 * Only our own: a `redirect_to` is attacker-reachable through the auth API, so
 * an unchecked one turns this into an open redirect that carries a live token.
 * Anything else falls back to this site.
 */
function atHost(back: string): string | null {
  const allowed = [HOME, process.env["PLATFORM_ADMIN_SITE"]]
    .filter((one): one is string => Boolean(one))
    .map((one) => one.replace(/\/$/, ""));

  try {
    const asked = new URL(back);
    const origin = `${asked.protocol}//${asked.host}`;
    return allowed.includes(origin) ? origin : null;
  } catch {
    return null;
  }
}

/**
 * Which of our messages this is.
 *
 * An invitation to a church is this product's own message, sent when the
 * church sends it, so Supabase has no business sending a second one.
 */
const DRAWN = new Set(["signup", "email_change", "recovery", "magiclink"]);

/**
 * R1.7. Every answer is JSON, and says so.
 *
 * Supabase reads the Content-Type on the way back and refuses a reply without
 * one, whatever its status: an empty 200 came back as
 * `hook_payload_invalid_content_type` and the church was told its account
 * could not be made. The body is for us reading a log; the header is what the
 * other end is actually checking.
 */
const answer = (status: number, said?: string): NextResponse =>
  NextResponse.json(said ? { error: said } : {}, { status });

export async function POST(request: Request) {
  const secret = process.env["SEND_EMAIL_HOOK_SECRET"];
  /*
   * Unset means the hook is not in use and Supabase is sending its own mail.
   * Answering 200 to an unsigned request would let anybody make this send.
   */
  if (!secret) return answer(503, "Not configured");

  const body = await request.text();
  if (!signed(body, request.headers, secret)) return answer(401, "Bad signature");

  let hook: Hook;
  try {
    hook = JSON.parse(body) as Hook;
  } catch {
    return answer(400, "Unreadable");
  }

  const to = hook.user?.email;
  const link = confirmUrl(hook);
  if (!to || !link) return answer(400, "Nothing to send");

  const action = hook.email_data.email_action_type;
  /* A kind we do not draw is refused rather than swallowed. */
  if (!DRAWN.has(action)) return answer(400, "Not handled");

  /* HRT-401. A magic link whose landing is the portal's own /join is an
     invitation onto the platform team, and reads as one. */
  const invite =
    action === "magiclink" && (hook.email_data.redirect_to ?? "").includes("/join?t=");

  const sent = await sendAsPlatform({
    to,
    ...authMessage(invite ? "teaminvite" : (action as Action), link),
  });
  if (!sent.ok) {
    console.error("[auth mail] not sent", sent.said);
    /* Supabase retries a failure and tells the person it could not send,
       which is the truth and better than a silent nothing in their inbox. */
    return answer(500, "Not sent");
  }

  return answer(200);
}
