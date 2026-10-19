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
  /*
   * HRT-456, R22.1. The setup guide is put away before anybody arrives.
   *
   * A demo church is a church that is already running: it has members,
   * services, groups, giving and a year of attendance. The guide read it as a
   * church in its first week and told the visitor to add their members, which
   * is both wrong and in the way: open, it takes a third of a laptop screen,
   * and the giving table was being squeezed into what was left.
   *
   * Somebody evaluating this product should see the product. The guide is the
   * right thing for a church that just signed up and the wrong thing for the
   * one screen whose whole job is to show what the product looks like in use.
   */
  /*
   * HRT-462. Stamped as taken while it is being built.
   *
   * The pool hands over any demo church with an expiry that nobody has
   * claimed, and a church being built has both of those for the minute and a
   * half the loader runs. Stamping it means the claim cannot see it, so a
   * visitor is never handed a church with half a directory in it. The stamp is
   * cleared when a template takes its real name.
   */
  const [tenant] = await sql<{ id: string }[]>`
    insert into tenants (
      slug, name, timezone, demo_expires_at, demo_claimed_at, approved_at, approved_by,
      setup_dismissed_at
    )
    values (
      ${slug}, ${DEMO_NAME}, 'America/Chicago',
      ${how.template ? null : new Date(Date.now() + DEMO_LIFETIME_HOURS * 60 * 60 * 1000)},
      now(), now(), 'demo',
      now()
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
 * HRT-462, R19.7. How many copies stand ready for the next visitor.
 *
 * A copy of the template costs about a second of database work, which is a
 * second a visitor spends looking at nothing after pressing "See demo". Three
 * covers a burst from one link being shared without holding a day's worth of
 * churches nobody opens.
 */
export const DEMO_POOL_TARGET = 3;

/**
 * How long an unclaimed copy is allowed to stand.
 *
 * It carries an expiry like any other demo so that the sweep reaps it if the
 * pool is never drawn down, and the expiry is longer than a day so a copy
 * built by the nightly rebuild is still there the following evening. A visitor
 * claiming one gets the full `DEMO_LIFETIME_HOURS` from the moment they claim.
 */
const POOL_SHELF_HOURS = 48;

/** Names a visitor the only member of a church, and gives back its detail. */
async function handOver(
  tenantId: string,
  slug: string,
  userId: string,
  expiresAt: Date,
): Promise<DemoChurch> {
  await owner().begin(async (tx) => {
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
 * Takes a standing copy, or answers null when none is standing.
 *
 * One statement: the row is found and stamped together, so two visitors
 * arriving in the same moment cannot be handed the same church. `skip locked`
 * is what makes the second one take the next row rather than queue behind the
 * first one's lock.
 *
 * The template is excluded by carrying no expiry, which is also what keeps the
 * sweep off it. The slug is checked as well so that a template which somehow
 * gained an expiry could still never be handed to anybody.
 */
async function claimFromPool(userId: string, expiresAt: Date): Promise<DemoChurch | null> {
  const [taken] = await owner()<{ id: string; slug: string }[]>`
    with standing as (
      select id from tenants
       where demo_expires_at is not null
         and demo_claimed_at is null
         and slug <> ${TEMPLATE_SLUG}
       order by created_at
       limit 1
         for update skip locked
    )
    update tenants t
       set demo_claimed_at = now(),
           demo_expires_at = ${expiresAt}
      from standing
     where t.id = standing.id
    returning t.id, t.slug`;

  if (!taken) return null;
  return handOver(taken.id, taken.slug, userId, expiresAt);
}

/**
 * Hands a visitor a church that is already built.
 *
 * Takes one from the pool, names them its owner and starts its clock. Where the
 * pool is empty, one is copied while they wait, which is the behaviour the pool
 * exists to keep off the visitor's path.
 */
export async function createDemoChurch(userId: string): Promise<DemoChurch> {
  /*
   * R19.7. No sweep here. It used to run on the way in, because the moment
   * somebody asked for a demo was the only moment anything ran at all. The
   * nightly rebuild sweeps now, and this is the one path that has to be fast:
   * a visitor is waiting on it.
   */
  const expiresAt = new Date(Date.now() + DEMO_LIFETIME_HOURS * 60 * 60 * 1000);

  const standing = await claimFromPool(userId, expiresAt);
  if (standing) return standing;

  const template = await ensureDemoTemplate();
  const slug = `demo-${suffix()}`;

  /* Taken from birth: this copy is being made for somebody already waiting,
     so the pool must never offer it to the next arrival. */
  const tenantId = await cloneTenant(template, {
    slug,
    name: DEMO_NAME,
    demoExpiresAt: expiresAt,
    demoClaimedAt: new Date(),
  });

  return handOver(tenantId, slug, userId, expiresAt);
}

/** How many copies are standing ready, and how many are wanted. */
export async function demoPoolDepth(): Promise<{ standing: number; target: number }> {
  const [row] = await owner()<{ n: string }[]>`
    select count(*) as n from tenants
     where demo_expires_at is not null
       and demo_claimed_at is null
       and slug <> ${TEMPLATE_SLUG}`;
  return { standing: Number(row?.n ?? 0), target: DEMO_POOL_TARGET };
}

/**
 * HRT-462. Copies the template until the pool is full again.
 *
 * Called after a visitor has been answered rather than before, so the cost of
 * refilling is never on the press. `budgetMs` stops it part way rather than
 * holding a serverless invocation open: a pool one short is refilled by the
 * next visitor or the nightly run, and a request that will not end is worse
 * than a pool that is not full.
 */
export async function topUpDemoPool(
  target = DEMO_POOL_TARGET,
  budgetMs = 60_000,
): Promise<number> {
  const { standing } = await demoPoolDepth();
  const wanted = target - standing;
  if (wanted <= 0) return 0;

  const template = await ensureDemoTemplate();
  const until = Date.now() + budgetMs;
  let built = 0;

  for (let i = 0; i < wanted; i += 1) {
    if (Date.now() >= until) break;
    await cloneTenant(template, {
      slug: `demo-${suffix()}`,
      name: DEMO_NAME,
      demoExpiresAt: new Date(Date.now() + POOL_SHELF_HOURS * 60 * 60 * 1000),
    });
    built += 1;
  }

  return built;
}

/**
 * HRT-462. Throws away the copies nobody has taken.
 *
 * A copy carries the dates the template was built with, which is why the
 * template is rebuilt nightly. A pool standing from before that rebuild would
 * hand somebody the previous day's diary, so it goes when the template does.
 * Copies already claimed are left alone: somebody is looking at one.
 */
export async function discardUnclaimedDemos(): Promise<number> {
  return withAuditTriggersOff(async (sql) => {
    const gone = await sql<{ id: string }[]>`
      delete from tenants
       where demo_expires_at is not null
         and demo_claimed_at is null
         and slug <> ${TEMPLATE_SLUG}
      returning id`;
    return gone.length;
  });
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
 * The nightly rebuild makes it, and `pnpm demo:template` makes it by hand.
 * Nothing builds it at deploy time, so building it here is the net under both:
 * an environment where neither has run makes one visitor wait rather than
 * showing them nothing.
 */
export async function ensureDemoTemplate(): Promise<string> {
  const [held] = await owner()<{ id: string }[]>`
    select id from tenants where slug = ${TEMPLATE_SLUG}`;
  if (held) return held.id;

  return buildTemplate();
}

/**
 * HRT-462. Builds a template under a working name and takes the name last.
 *
 * The build is not one transaction: the church's row and its campus are
 * written before the loader starts, so a build that stops part way leaves a
 * church behind. Under the real name that church is a template with nothing in
 * it, and every copy taken from it afterwards shows a visitor an empty
 * product, which is worse than the wait it was trying to avoid. The loader
 * takes roughly a hundred seconds and a request that calls this has no
 * `maxDuration`, so stopping part way is the expected case rather than a
 * remote one.
 *
 * Under a working name, a build that stops leaves a church nobody can reach,
 * carrying an expiry so the sweep takes it. The name is moved across in one
 * statement once the loader has finished, so `demo-template` either is not
 * there or is complete.
 */
async function buildTemplate(): Promise<string> {
  const staging = `demo-building-${suffix()}`;

  /* An expiry while it is being built, so a build that stops leaves something
     the sweep reaps rather than a church standing for ever. The template
     carries none, which is what keeps the sweep off the finished one. */
  const built = await buildDemoChurch({ slug: staging, template: false });

  await owner()`
    update tenants
       set slug = ${TEMPLATE_SLUG}, demo_expires_at = null, demo_claimed_at = null
     where id = ${built.tenantId}`;

  return built.tenantId;
}

/**
 * Builds the template again from nothing, for when the seed has changed.
 *
 * HRT-462. The new one is built before the old one is let go. Deleting first
 * meant a rebuild that failed left no template at all, and the next visitor
 * paid for a build inline.
 */
export async function rebuildDemoTemplate(): Promise<string> {
  const [standing] = await owner()<{ id: string }[]>`
    select id from tenants where slug = ${TEMPLATE_SLUG}`;

  if (standing) {
    /* Out of the way under a name nothing looks for, so the new build can take
       the real one. Still no expiry, so a failure after this point leaves a
       template to fall back on rather than nothing. */
    await owner()`
      update tenants set slug = ${`demo-previous-${suffix()}`} where id = ${standing.id}`;
  }

  try {
    const made = await buildTemplate();
    if (standing) {
      await withAuditTriggersOff(async (sql) => {
        await sql`delete from tenants where id = ${standing.id}`;
      });
    }
    return made;
  } catch (trouble) {
    /* Put the old one back under its own name. A demo of yesterday's dates is
       a demo; no template at all is a visitor waiting a hundred seconds. */
    if (standing) {
      await owner()`
        update tenants set slug = ${TEMPLATE_SLUG} where id = ${standing.id}`;
    }
    throw trouble;
  }
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
 * Run by the nightly rebuild rather than on the way in: a visitor arriving is
 * the one path that has to be fast, and taking the audit triggers off locks
 * every audited table. This reaps a pool copy nobody took as well, because an
 * unclaimed copy carries an expiry like any other.
 *
 * The audit triggers come off first: deleting a tenant cascades to its members,
 * and the trigger would write rows referencing the tenant being deleted.
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
