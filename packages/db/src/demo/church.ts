import { owner, withTenant } from "../client";
import { withAuditTriggersOff } from "../maintenance";
import { loadDemoData, loadDemoExtras } from "./load";
import { cloneTenant } from "./clone";

/**
 * R19.7 and R22.1. A demo church, belonging to nobody.
 *
 * The sample members were previously loadable into a real church, which put
 * invented records one press away from a giving statement. They now live in a
 * church of their own: created on arrival, filled, and removed a day later.
 *
 * Every visitor gets their own copy, so any action in it is safe, including the
 * destructive ones a demo exists to let somebody try.
 */

/** Long enough to look around twice, short enough that nobody settles in. */
export const DEMO_LIFETIME_HOURS = 24;

/** The church every demo is copied from. Never opened, never swept. */
export const TEMPLATE_SLUG = "demo-template";

export interface DemoChurch {
  tenantId: string;
  slug: string;
  name: string;
  expiresAt: Date;
}

const suffix = () => Math.random().toString(36).slice(2, 8);

const DEMO_NAME = "Fairview Church";

/**
 * Builds one demo church and leaves it unclaimed.
 *
 * Runs on the owner connection rather than through createChurch, because a demo
 * visitor has no verified email address and never will: the sign-in is
 * anonymous by design. The Owner role granted here is over a church that holds
 * only invented members and is removed the next day.
 */
async function buildDemoChurch(
  how: { slug?: string; template?: boolean } = {},
): Promise<{ tenantId: string; slug: string }> {
  const slug = how.slug ?? `demo-${suffix()}`;
  const sql = owner();

  /*
   * R1.1, R19.7. A demo church is approved from the moment it exists.
   *
   * Approval is the gate on a church nobody has looked at yet: twenty-five
   * members, no join link, no invitations. Every one of those is right for a
   * stranger's sign-up and wrong for a demo, which is a church we built
   * ourselves out of invented people so that somebody can see what the product
   * does. A visitor who met the cap, or pressed Invite and was refused, was
   * being shown a restriction rather than the product.
   *
   * Approving it opens nothing that could reach a real person: the church has
   * no messaging credentials and no Stripe account, so an invitation sends
   * nowhere and a gift cannot be taken.
   */
  const [tenant] = await sql<{ id: string }[]>`
    insert into tenants (slug, name, timezone, demo_expires_at, approved_at, approved_by)
    values (
      ${slug}, ${DEMO_NAME}, 'America/Chicago',
      ${how.template ? null : new Date(Date.now() + DEMO_LIFETIME_HOURS * 60 * 60 * 1000)},
      now(), 'demo'
    )
    returning id`;

  const tenantId = tenant!.id;

  await sql`
    insert into campuses (tenant_id, name, is_primary)
    values (${tenantId}, ${DEMO_NAME}, true)`;

  await withTenant({ tenantId, role: "owner" }, async (db) => {
    const actor = { tenantId, role: "owner" as const };
    await loadDemoData(db, actor);
    /* R19.7. Giving, the noticeboard, a form and the diary. Separate from the
       loader above because that one can also be emptied out of a church again,
       and these are only ever built into a church of our own. */
    await loadDemoExtras(db, actor);
  });

  return { tenantId, slug };
}

/**
 * Hands a visitor a church that is already built.
 *
 * Takes one from the pool, names them its owner and starts its clock. Where the
 * pool is empty, one is built while they wait, which is the old behaviour and
 * the reason the pool exists.
 *
 * `skip locked` matters: two visitors pressing at the same moment take two
 * different churches rather than queueing for the same one.
 */
export async function createDemoChurch(userId: string): Promise<DemoChurch> {
  await sweepExpiredDemos();

  const template = await ensureDemoTemplate();
  const expiresAt = new Date(Date.now() + DEMO_LIFETIME_HOURS * 60 * 60 * 1000);
  const slug = `demo-${suffix()}`;

  const tenantId = await cloneTenant(template, {
    slug,
    name: DEMO_NAME,
    demoExpiresAt: expiresAt,
  });

  await owner().begin(async (tx) => {
    await tx`
      update tenants set demo_claimed_at = now() where id = ${tenantId}`;

    await tx`
      insert into app_users (id, email, full_name)
      values (${userId}, ${`${slug}@demo.invalid`}, 'Demo visitor')
      on conflict (id) do nothing`;

    /* The visitor is the only member the copy ever has: `tenant_members` is
       one of the three things a copy deliberately leaves behind. */
    await tx`
      insert into tenant_members (tenant_id, user_id, role)
      values (${tenantId}, ${userId}, 'owner')`;
  });

  return { tenantId, slug, name: DEMO_NAME, expiresAt };
}

/**
 * The church every demo is a copy of, built once.
 *
 * Built by the loader, slowly and through the same repo functions the product
 * uses, so what a visitor is shown cannot drift into something the product
 * does not do. It is never opened: it carries no expiry, so the session layer
 * refuses it the way it refuses any church that is not a demo, and the sweep
 * leaves it alone for the same reason.
 *
 * `pnpm demo:template` builds it at deploy time. Building it here as well is
 * the net under that: an environment where nobody ran the script makes one
 * visitor wait rather than showing them nothing.
 */
export async function ensureDemoTemplate(): Promise<string> {
  const [held] = await owner()<{ id: string }[]>`
    select id from tenants where slug = ${TEMPLATE_SLUG}`;
  if (held) return held.id;

  const built = await buildDemoChurch({ slug: TEMPLATE_SLUG, template: true });
  return built.tenantId;
}

/** Builds the template again from nothing, for when the seed has changed. */
export async function rebuildDemoTemplate(): Promise<string> {
  await withAuditTriggersOff(async (sql) => {
    await sql`delete from tenants where slug = ${TEMPLATE_SLUG}`;
  });
  return ensureDemoTemplate();
}

export interface DemoInfo {
  isDemo: boolean;
  expiresAt: Date | null;
}

export async function demoChurchInfo(tenantId: string): Promise<DemoInfo> {
  const rows = await owner()<{ demo_expires_at: Date | null }[]>`
    select demo_expires_at from tenants where id = ${tenantId}`;
  const expiresAt = rows[0]?.demo_expires_at ?? null;
  return { isDemo: expiresAt !== null, expiresAt };
}

/**
 * Removes demo churches that have run out.
 *
 * Swept on the way in rather than on a schedule, because there is no job runner
 * yet and the moment somebody asks for a demo is a moment we are already paying
 * for a round trip. The audit triggers come off first: deleting a tenant
 * cascades to its members, and the trigger would write rows referencing the
 * tenant being deleted.
 */
export async function sweepExpiredDemos(): Promise<number> {
  // Asked before anything is disabled. Taking the triggers off locks every
  // audited table, and the answer is almost always that there is nothing to
  // sweep, so paying that on every visitor is paying it for nothing.
  const [row] = await owner()<{ n: string }[]>`
    select count(*) as n from tenants
     where demo_expires_at is not null and demo_expires_at < now()`;
  if (Number(row?.n ?? 0) === 0) return 0;

  return withAuditTriggersOff(async (sql) => {
    const gone = await sql<{ id: string }[]>`
      delete from tenants
      where demo_expires_at is not null and demo_expires_at < now()
      returning id`;
    return gone.length;
  });
}

export interface DemoMembership {
  tenantId: string;
  slug: string;
  name: string;
  expiresAt: Date;
}

/**
 * Confirms that this visitor is in this demo, and that it is still a demo.
 *
 * The pass a demo visitor carries is signed, so it cannot be rewritten to name
 * a different church. This is the second lock: the tenant has to have an expiry
 * in the future, so a pass naming a real church is refused even if the signing
 * key ever leaked. A demo can never be a way into somebody's records.
 */
export async function demoMembership(
  tenantId: string,
  userId: string,
): Promise<DemoMembership | null> {
  const rows = await owner()<{ id: string; slug: string; name: string; demo_expires_at: Date }[]>`
    select t.id, t.slug, t.name, t.demo_expires_at
    from tenants t
    join tenant_members m on m.tenant_id = t.id and m.user_id = ${userId}
    where t.id = ${tenantId}
      and t.demo_expires_at is not null
      and t.demo_expires_at > now()
    limit 1`;

  const row = rows[0];
  if (!row) return null;
  return { tenantId: row.id, slug: row.slug, name: row.name, expiresAt: row.demo_expires_at };
}
