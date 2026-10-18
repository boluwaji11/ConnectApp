import "server-only";
import { readsAs } from "./spelling";
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  membershipsForUser, resolveTenantByHost,
  demoMembership, twoStepFor,
  type Membership, type TenantRole, type Permission,
} from "@connectapp/db";
import { supabaseServer } from "./supabase/server";
import { readDemoPass } from "./demo-pass";
import { readChurchChoice } from "./church-choice";

export interface Session {
  userId: string;
  email: string;
  /** What to call them on screen. Their email address if they gave no name. */
  displayName: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  /** R22.8. Which spelling this church reads. */
  tenantCountry: string;
  role: TenantRole;
  /**
   * R1.6. The permissions this session holds, for somebody on a role their
   * church wrote. Null means the built-in role above, which the matrix answers.
   * Every canX() takes the session as well as a bare role, so passing `session`
   * where a role used to go is what makes a custom role grant anything.
   */
  permissions: Permission[] | null;
  memberships: Membership[];
}

/**
 * The authenticated user, or null. Cached per request, so several components can
 * ask without several round trips.
 *
 * R24.11. Read from the token and checked here rather than asked of the
 * authentication server. This project signs with ES256 and publishes the key,
 * so `getClaims` verifies the signature and the expiry with WebCrypto against a
 * key set the process holds for ten minutes. `getUser` was a round trip to
 * Supabase on every navigation, and the middleware had already made the same
 * one a moment earlier.
 *
 * What that costs: somebody signed out everywhere keeps a verified token until
 * it expires, which is an hour. It buys them nothing here. Every screen decides
 * what a reader may see from `tenant_members` on the request itself, so a
 * person taken out of a church, or moved to another role, meets that decision
 * on their next press whatever their token says.
 */
export const currentUser = cache(async () => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const text = (key: string) =>
    typeof meta[key] === "string" ? (meta[key] as string) : null;

  return {
    id: claims.sub,
    email: claims.email ?? "",
    fullName: text("full_name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    /*
     * R1.8. What this session has presented: `aal1` is a password or an email
     * link, `aal2` is a second factor as well. It is a claim on the token that
     * was verified two lines above, so reading it here costs nothing and no
     * navigation asks Supabase for it.
     */
    assurance: typeof claims["aal"] === "string" ? (claims["aal"] as string) : "aal1",
  };
});

/**
 * R1.8. Whether this person has finished setting up two-step verification.
 *
 * The mirror in `app_users`, not Supabase, because every request that resolves
 * a session needs the answer and Supabase would be a round trip on every
 * navigation. Read in the same breath as the memberships below, so it costs
 * nothing either.
 */
const myTwoStep = cache(async (userId: string) => twoStepFor(userId));

/**
 * R1.5. Whether this person has answered the email they signed up with.
 *
 * The one thing about a user that the token does not carry, so it is asked of
 * the authentication server, and only on the three screens that need it: the
 * ones that write a person into a church. A navigation never asks.
 */
export const emailIsVerified = cache(async (): Promise<boolean> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return false;
  return Boolean(data.user.email_confirmed_at);
});

/**
 * Resolves the session for a church, verifying membership against the database.
 *
 * This is the authorization boundary. Row-level security stops a request reading
 * another church's data once a context is set; it says nothing about which
 * context a user may set. That decision is made here, from tenant_members, never
 * from a cookie, a query parameter, or anything else the client controls.
 *
 * A church the user does not belong to is reported exactly like a church that
 * does not exist, so a URL cannot be used to discover who is on the platform.
 */
/**
 * R19.7. The session a demo visitor gets, built from their signed pass.
 *
 * Owner of one throwaway church and nothing else. The pass is signed, and the
 * lookup refuses any tenant without a demo expiry in the future, so this can
 * never hand somebody a way into a real church.
 */
const demoVisitorSession = cache(async (): Promise<Session | null> => {
  const pass = await readDemoPass();
  if (!pass) return null;

  const demo = await demoMembership(pass.tenantId, pass.userId);
  if (!demo) return null;

  return {
    userId: pass.userId,
    email: "",
    displayName: "Visitor",
    tenantId: demo.tenantId,
    tenantName: demo.name,
    tenantSlug: demo.slug,
    tenantCountry: "US",
    role: "owner",
    permissions: null,
    memberships: [],
  };
});

/**
 * R1.1, R17.1. The church this request arrived at, where the host names one.
 *
 * A church pointing its own name at the app means every screen underneath is
 * that church's without a word of it in the address. Cached per request,
 * because every screen asks and the answer cannot change mid-render.
 */
export const churchFromHost = cache(async (): Promise<string | null> => {
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host");
  if (!host) return null;
  const found = await resolveTenantByHost(host);
  return found?.slug ?? null;
});

/**
 * Every church this user belongs to.
 *
 * The same read as membershipsForUser, held for the duration of one request.
 * A settings page resolves the session twice, once in the layout from the host
 * and once in the page from the address, and the two asked the database the
 * same question each time.
 */
const myMemberships = cache(async (userId: string): Promise<Membership[]> =>
  membershipsForUser(userId),
);

/**
 * R1.4. This reader's membership of the church that slug names.
 *
 * Answered out of the list above rather than by two more reads of its own.
 * `membershipsForUser` is `verifyMembership`'s own query without the tenant
 * filter: the same table, the same joins, the same role and permission
 * resolution, the same refusal of an archived church. So the row for one
 * church is already in hand, and asking the database to find the church by
 * slug and then asking it again whether this user is in it was two round trips
 * for an answer the first read contained.
 *
 * The rows come from `tenant_members` for this user, so matching here decides
 * nothing the database did not already decide. A slug nobody holds and a slug
 * that names no church both answer null, which is what keeps a URL from being
 * used to discover which churches are on the platform.
 */
const mineBySlug = async (userId: string, slug: string): Promise<Membership | null> =>
  (await myMemberships(userId)).find((one) => one.tenantSlug === slug) ?? null;

/**
 * R1.4, R13.6. Whether this reader belongs to this church.
 *
 * A public page names its church in the address, and somebody signed in to a
 * different church is a stranger on it: their own screens are somewhere else
 * and a link to this church's would refuse them at the door. So the page
 * asks before it treats them as one of the congregation.
 */
export const belongsTo = cache(async (userId: string, slug: string): Promise<boolean> =>
  (await mineBySlug(userId, slug)) !== null,
);

/**
 * R1.4. The same answer, with the role and the permissions on it.
 *
 * For a screen that has to decide where somebody goes rather than only
 * whether they may be here.
 */
export const verifiedMembership = cache(async (userId: string, slug: string) =>
  mineBySlug(userId, slug),
);

/**
 * The address this request is on, as a path.
 *
 * The middleware passes it through on a header, because a server component
 * cannot read the URL it is rendering for. Without it the reader still gets
 * to sign-in, just without the way back.
 */
const here = cache(async (): Promise<string | null> => {
  const head = await headers();
  const path = head.get("x-pathname");
  const query = head.get("x-search") ?? "";
  return path ? `${path}${query}` : null;
});

/** `?next=` for a path worth returning to, and nothing for anything else. */
function nextFrom(path: string | null): string {
  if (!path || !path.startsWith("/")) return "";
  if (path.startsWith("/sign-in") || path.startsWith("/sign-up")) return "";
  // The screen a role arrives at anyway, so there is nothing to carry.
  if (path === "/" || path === "/dashboard" || path === "/home") return "";
  return `?next=${encodeURIComponent(path)}`;
}

export const requireSession = cache(async (asked?: string): Promise<Session> => {
  /*
   * R1.4, R17.1. The host wins, then what they picked.
   *
   * A church's own address is the church, so riverside.connectapp.church is
   * Riverside's whatever anything else says. On our own host the church comes
   * from the chooser, which wrote it down, and a reader in one church needs
   * neither: there is one answer and the memberships below give it.
   *
   * Either way the membership is verified against tenant_members before a row
   * is read, so what names the church decides nothing about who may open it.
   */
  /*
   * The host is a query against `tenants` and the user is an HTTPS call to
   * Supabase Auth. They have nothing to say to each other, and awaiting one
   * and then the other spent the shorter of the two for nothing.
   */
  const [fromHost, user] = await Promise.all([churchFromHost(), currentUser()]);
  const slug = fromHost ?? asked ?? (await readChurchChoice());

  if (!user) {
    const demo = await demoVisitorSession();
    if (demo) return demo;
    /*
     * R1.4. Signing in carries the reader back to what they opened. A link
     * out of an email, a bookmark, a tab left open overnight: all of them
     * land on sign-in, and sending somebody to the dashboard afterwards
     * leaves them to find their way back to the thing they asked for.
     *
     * Opening the product with no particular screen in mind still lands on
     * the one the role arrives at, because there is nothing to carry.
     */
    redirect(`/sign-in${nextFrom(await here())}`);
  }

  /*
   * R1.8. Two reads with nothing to say to each other, so they go together.
   */
  const [memberships, twoStep] = await Promise.all([
    myMemberships(user.id),
    myTwoStep(user.id),
  ]);

  /*
   * R1.8, R21.4. A session that has only presented a password is not finished.
   *
   * Enforced here rather than on the sign-in action, because a server action
   * is one way in and a bookmark is another: somebody who closes the code
   * screen and types an address would otherwise be inside. This is the same
   * place the church and the spelling are settled, and for the same reason.
   *
   * The mirror decides only that a code is owed. The screen it sends them to
   * reads the factors from Supabase, and lets them straight through where
   * there is nothing to present.
   */
  if (twoStep.enrolledAt && user.assurance !== "aal2") {
    redirect(`/sign-in/code${nextFrom(await here())}`);
  }

  if (memberships.length === 0) redirect("/choose-church?reason=none");

  let chosen: Membership | undefined;

  if (slug) {
    /* Same outcome whether the church does not exist or the user is not in it,
       and the list already read above holds the answer. */
    chosen = memberships.find((one) => one.tenantSlug === slug);
    // R1.4. Which church was asked for, so the chooser can say so by name.
    if (!chosen) redirect(`/choose-church?reason=denied&asked=${encodeURIComponent(slug)}`);
  } else if (memberships.length === 1) {
    chosen = memberships[0];
  } else {
    redirect("/choose-church?reason=which");
  }

  const m = chosen!;

  /*
   * R22.8. Settled here, before any screen reads a word.
   *
   * It used to be set in the shell, and a shell is handed its page already
   * rendered, so every string on the page had been resolved before the shell
   * said which spelling to resolve them in. Every screen awaits this first.
   */
  readsAs(m.tenantCountry);

  return {
    userId: user.id,
    email: user.email,
    displayName: user.fullName?.trim() || user.email,
    tenantId: m.tenantId,
    tenantName: m.tenantName,
    tenantSlug: m.tenantSlug,
    tenantCountry: m.tenantCountry,
    role: m.role,
    permissions: m.permissions,
    memberships,
  };
});

/**
 * The id of the session this request is using, for marking "this device" in the
 * list and for keeping it when the others are ended.
 *
 * Read from the access token's own claim. The token was already verified by
 * currentUser() through Supabase, and the claim is used only to compare against
 * session ids the database returned, so a forged one matches nothing.
 */
export const currentSessionId = cache(async (): Promise<string | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      session_id?: string;
    };
    return json.session_id ?? null;
  } catch {
    return null;
  }
});
