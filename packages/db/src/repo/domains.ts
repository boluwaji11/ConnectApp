import { eq, and, ne } from "drizzle-orm";
import type { Tx } from "../client";
import { owner } from "../client";
import { tenants } from "../schema/tenancy";
import { PermissionError } from "../roles";
import { InvalidInputError, NameTakenError } from "../errors";
import { canManageChurch } from "./church";
import type { WriteActor } from "./members";
import {
  cleanDomain, slugUnderPlatform, cleanPortalName, isReservedName, isPlatformHost,
} from "./portal-rules";

/**
 * R1.1, R17.1. A church's own address for its members' screens.
 *
 * The point of it is the cookie. A session on connectapp.church inside a frame
 * on the church's site is a third-party cookie, which Safari refuses outright,
 * so the only way the signed-in screens can live on a church's own domain is
 * for the request to arrive at that domain. Then the cookie is first-party and
 * nothing is being worked around.
 */


















/**
 * R24.11, R17.1. Which church a host names, held for a minute.
 *
 * Every screen asks, because the host is what decides whose church this is
 * before anything else can be read, and the answer is a query on the owner
 * connection before a tenant context exists. It changes when a church sets its
 * address, which is a few times in a church's life and is written through the
 * three functions below, so they clear it.
 *
 * A host that names nobody is held too. A crawler hitting a hundred unknown
 * names is otherwise a hundred queries.
 */
const HOST_HOLD_MS = 60 * 1000;
type HostAnswer = { id: string; name: string; slug: string; portalName: string | null } | null;
const HELD_HOSTS = new Map<string, { answer: HostAnswer; until: number }>();

/** Called by anything that changes which church a host names. */
export function forgetHosts(): void {
  HELD_HOSTS.clear();
}

/**
 * Which church this host belongs to.
 *
 * One of the documented pre-authorization reads, the same shape as resolving a
 * church by its address: there is no tenant context to set until the tenant is
 * known, and the host is what names it. It answers nothing but an id, a name
 * and an address, and membership is still verified afterwards.
 */
export async function resolveTenantByHost(
  host: string,
): Promise<{ id: string; name: string; slug: string; portalName: string | null } | null> {
  const bare = cleanDomain(host);
  if (!bare) return null;

  const now = Date.now();
  const held = HELD_HOSTS.get(bare);
  if (held && held.until > now) return held.answer;

  /* R1.1. A name under ours names the church by its own slug, which is the
     address every church has without doing anything. */
  const under = slugUnderPlatform(bare);
  if (under) {
    /* The name the church chose, or its slug, which answers from the day it
       signs up and goes on answering after a name is chosen. */
    /* R17.1. A church that has turned its address off is not reachable at
       it, so the host names nobody. */
    const rows = await owner()<
      { id: string; name: string; slug: string; portal_name: string | null }[]
    >`
      select id, name, slug, portal_name from tenants
       where (portal_name = ${under} or slug = ${under}) and portal_open = true
       order by (portal_name = ${under}) desc
       limit 1`;
    const found = rows[0];
    return hold(bare, found ? { ...found, portalName: found.portal_name } : null);
  }

  /*
   * R21.1. A name of ours is never answered out of custom_domain.
   *
   * The branch above is the only way a host under the platform names a church,
   * and it refuses the apex and every reserved label. Falling through to the
   * custom domain lookup handed those names back: a church holding
   * `connectapp.church` became the church the front door resolved to, and
   * every member of every other church met `/choose-church?reason=denied`.
   *
   * Refused on the way in as well, in setCustomDomain. This is the half that
   * also neutralises a row written before that check existed.
   */
  if (isPlatformHost(bare)) return hold(bare, null);

  const rows = await owner()<
    { id: string; name: string; slug: string; portal_name: string | null }[]
  >`
    select id, name, slug, portal_name from tenants where custom_domain = ${bare} limit 1`;
  const found = rows[0];
  return hold(bare, found ? { ...found, portalName: found.portal_name } : null);
}

/** Keeps an answer, and keeps the map from growing without bound. */
function hold(host: string, answer: HostAnswer): HostAnswer {
  const now = Date.now();
  HELD_HOSTS.set(host, { answer, until: now + HOST_HOLD_MS });
  if (HELD_HOSTS.size > 1000) {
    for (const [key, value] of HELD_HOSTS) if (value.until <= now) HELD_HOSTS.delete(key);
  }
  return answer;
}

/**
 * R1.1. Setting it, or clearing it.
 *
 * Refused where another church already has it, because two churches on one
 * host is a request nobody can answer.
 */
export async function setCustomDomain(
  db: Tx,
  actor: WriteActor,
  input: { domain: string | null },
): Promise<string | null> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "editChurch");

  const bare = input.domain?.trim() ? cleanDomain(input.domain) : null;
  if (input.domain?.trim() && !bare) throw new InvalidInputError("domain.error.shape");

  /*
   * R21.1. One of our own names is not a church's to take.
   *
   * A custom domain is a name the church owns and points here, and nothing
   * stopped it being one of ours. `resolveTenantByHost` answers the custom
   * domain lookup for every host that is not a single unreserved label under
   * the platform, so `connectapp.church` itself, `www.connectapp.church`, and
   * every reserved name under it, `give`, `admin`, `security`, `support`, were
   * all claimable. Taking the apex points the front door at one church and
   * refuses everybody else at it.
   *
   * The reserved list was already applied to the portal name, where a church
   * picks a label under our own domain, and never to this, where it can write
   * the whole host.
   */
  if (bare && isPlatformHost(bare)) throw new InvalidInputError("domain.error.ours");

  if (bare) {
    const [taken] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.customDomain, bare), ne(tenants.id, actor.tenantId)))
      .limit(1);
    if (taken) throw new NameTakenError("domain.error.taken", bare, taken.id);
  }

  await db
    .update(tenants)
    .set({ customDomain: bare })
    .where(eq(tenants.id, actor.tenantId));

  /* R24.11. The held answers name hosts, and one of them has just changed. */
  forgetHosts();

  return bare;
}

/** Every church that has one, for whoever runs the deployment. */
export async function churchesWithDomains(): Promise<{ slug: string; domain: string }[]> {
  return owner()<{ slug: string; domain: string }[]>`
    select slug, custom_domain as domain from tenants
     where custom_domain is not null order by slug`;
}

/**
 * R1.1, R17.1. Whether a church may have this name, and taking it.
 *
 * Checked against both columns, because a name that shadowed another church's
 * slug would take that church's address away from it.
 */
export async function portalNameFree(name: string, tenantId: string): Promise<boolean> {
  const bare = cleanPortalName(name);
  if (!bare || isReservedName(bare)) return false;

  const rows = await owner()<{ id: string }[]>`
    select id from tenants
     where (portal_name = ${bare} or slug = ${bare}) and id <> ${tenantId}
     limit 1`;
  return rows.length === 0;
}

export async function setPortalName(
  db: Tx,
  actor: WriteActor,
  input: { name: string | null },
): Promise<string | null> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "editChurch");

  const bare = input.name?.trim() ? cleanPortalName(input.name) : null;
  if (input.name?.trim() && !bare) throw new InvalidInputError("portal.error.shape");

  /* Ours, which is a different answer from somebody else having it. */
  if (bare && isReservedName(bare)) throw new InvalidInputError("portal.error.blocked");

  if (bare && !(await portalNameFree(bare, actor.tenantId))) {
    throw new NameTakenError("portal.error.taken", bare, actor.tenantId);
  }

  await db
    .update(tenants)
    .set({ portalName: bare })
    .where(eq(tenants.id, actor.tenantId));

  forgetHosts();

  return bare;
}

/** R1.1, R17.1. Turning the church's address on, or off. */
export async function setPortalOpen(
  db: Tx,
  actor: WriteActor,
  open: boolean,
): Promise<boolean> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "editChurch");

  await db.update(tenants).set({ portalOpen: open }).where(eq(tenants.id, actor.tenantId));
  forgetHosts();
  return open;
}

/**
 * R9.5. Where the church says its website is built.
 *
 * Asked rather than inferred. Only some nameservers name a builder, and the
 * common case, a name bought at a registrar and a site built somewhere else,
 * names none.
 */
export async function setSiteBuilder(
  db: Tx,
  actor: WriteActor,
  builder: string | null,
): Promise<string | null> {
  if (!canManageChurch(actor)) throw new PermissionError(actor.role, "editChurch");

  const kept = builder?.trim() || null;
  await db.update(tenants).set({ siteBuilder: kept }).where(eq(tenants.id, actor.tenantId));
  return kept;
}

/* The rules themselves, for everything that reads them from here. */
export {
  cleanDomain, slugUnderPlatform, cleanPortalName, isReservedName,
} from "./portal-rules";

/**
 * R1.1, R17.1. The name a church is reached at, for a page that knows its slug.
 *
 * A public address carries the slug, because that is what a church handed out
 * before it chose anything. What it is reached at now may be a name it picked
 * since, and may be nothing at all if it closed its address.
 */
export async function portalAddressFor(
  slug: string,
): Promise<{ slug: string; portalName: string | null; portalOpen: boolean } | null> {
  const rows = await owner()<
    { slug: string; portal_name: string | null; portal_open: boolean }[]
  >`
    select slug, portal_name, portal_open from tenants
     where slug = ${slug} and archived_at is null
     limit 1`;
  const found = rows[0];
  return found
    ? { slug: found.slug, portalName: found.portal_name, portalOpen: found.portal_open }
    : null;
}
