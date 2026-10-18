/**
 * R1.1, R17.1. What a host and a name are allowed to be.
 *
 * Pure on purpose, and in a file of its own so it can be read in a browser.
 * Everything here is a rule rather than a lookup, and the moment it sat beside
 * a query the Postgres driver followed it into the bundle.
 */

/** What a host has to look like before it is worth asking the database. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** The address as it will be compared: lower case, no scheme, no port, no path. */
export function cleanDomain(value: string): string | null {
  const bare = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  return bare && HOST.test(bare) && bare.length <= 253 ? bare : null;
}

/**
 * R1.1, R17.1. Our own host, which every church gets a name under.
 *
 * `riverside.connectapp.church` is where Riverside's members sign in. It needs
 * nothing from the church: we own the name, we hold the certificate, and the
 * church is named by the slug it already has.
 */
const platformHost = (): string =>
  (process.env["PLATFORM_HOST"] ?? "connectapp.church").trim().toLowerCase();

/**
 * Names under ours that are the platform rather than a church.
 *
 * A church whose slug was `www` would otherwise take the front door with it.
 */
const RESERVED = new Set([
  // Ours. A church at connectapp.connectapp.church reads as the product
  // rather than as the church.
  "connectapp", "connect", "app", "apps", "www", "web", "portal", "go", "my",
  "home", "main", "root",

  // The routes and the infrastructure under them.
  "api", "admin", "administrator", "dashboard", "auth", "login", "signin",
  "signup", "register", "join", "account", "accounts", "settings", "static",
  "assets", "cdn", "media", "files", "img", "images", "js", "css", "ws",
  "socket", "graphql", "webhook", "webhooks", "callback", "oauth", "sso",
  "health", "ping", "metrics", "internal",

  // Mail. A church holding autodiscover or mx would answer for our own
  // domain to somebody's mail client, which is the one kind of collision
  // nobody would think to look for.
  "mail", "email", "smtp", "imap", "pop", "pop3", "mx", "ns", "ns1", "ns2",
  "dns", "autodiscover", "autoconfig", "mta-sts", "postmaster", "abuse",
  "noreply", "no-reply", "bounce", "bounces", "dmarc", "spf", "dkim",

  // Where the product is worked on, so these stay ours to use.
  "test", "testing", "example", "demo", "dev", "development", "stage",
  "staging", "sandbox", "preview", "beta", "alpha", "local", "localhost",
  "tmp", "temp", "qa",

  // Anything that would read as the company speaking.
  "support", "help", "helpdesk", "status", "security", "billing", "payments",
  "invoice", "invoices", "legal", "privacy", "terms", "press", "careers",
  "jobs", "blog", "docs", "documentation", "news", "about", "contact",
  "team", "staff", "official", "verify", "verified", "trust",

  // Money. A church at give.connectapp.church looks like our giving page
  // rather than theirs, and that is the one shape somebody could collect
  // under our name with.
  "give", "giving", "donate", "donation", "donations", "tithe", "tithes",
  "offering", "offerings", "pay", "checkout",
]);

/**
 * R1.1. The church named by a host under ours, if it is one.
 *
 * Returns the slug rather than looking it up, so the rule is one pure thing
 * that can be read and tested without a database.
 */
export function slugUnderPlatform(host: string, platform = platformHost()): string | null {
  const bare = (cleanDomain(host) ?? "").trim();
  if (!bare) return null;

  // Localhost always counts, so a church can be opened at
  // riverside.localhost while somebody is working on it.
  const roots = [platform, "localhost"];
  for (const root of roots) {
    if (!root || bare === root || !bare.endsWith(`.${root}`)) continue;
    const label = bare.slice(0, bare.length - root.length - 1);
    // One label deep. Anything further is not a church's address.
    if (!label || label.includes(".") || RESERVED.has(label)) return null;
    return label;
  }
  return null;
}

/**
 * R1.1. What a church may call its members' address.
 *
 * Lower case letters, digits and hyphens, because it is typed by a
 * congregation and read aloud from a notice sheet. Three characters at least,
 * so the short ones stay available, and forty at most, because an address
 * nobody can say is an address nobody uses.
 */
const PORTAL_NAME = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;

export function cleanPortalName(value: string): string | null {
  const bare = value.trim().toLowerCase();
  return PORTAL_NAME.test(bare) ? bare : null;
}

/**
 * R17.1. Whether this is one of ours.
 *
 * Asked apart from the shape, because "that is not a name" and "that name is
 * not yours to take" are different things to be told and a church told the
 * first about the second goes on trying to fix the spelling.
 */
export const isReservedName = (name: string): boolean =>
  RESERVED.has(name.trim().toLowerCase());

/**
 * R1.1, R17.1. Whether a host is one of ours rather than a church's own.
 *
 * A custom domain is a name a church owns and points here. Our own names are
 * not that, and a church must never be able to claim one: `resolveTenantByHost`
 * answers the custom domain lookup for any host that is not a single
 * unreserved label under the platform, so a church holding `connectapp.church`
 * becomes the church every request on the front door resolves to, and every
 * member of every other church is refused at it. The same goes for the names
 * the deployment itself answers on, which sit under the platform host but are
 * reserved rather than a church's slug.
 *
 * Every name this deployment knows itself by, not only `PLATFORM_HOST`. That
 * variable is `localhost` in development while the deployment also answers on
 * `dev.connectapp.church`, so a list of one would have left the deployed names
 * claimable in exactly the environment where somebody is trying things out.
 *
 * Checked on the way in, where a church sets the name, and again on the way
 * out, where a host is resolved, so a row written before this existed cannot
 * take the platform down either.
 */
/** A host as it compares: lower case, no scheme, no port, no path. */
function bareHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function isPlatformHost(host: string, platform?: string): boolean {
  const bare = bareHost(host);
  if (!bare) return false;

  /*
   * `localhost` is always ours, with or without an override, and it is read
   * without `cleanDomain` because that asks for a dot and `localhost` has
   * none. A church claiming `riverside.localhost` would take a developer's
   * own address, which costs nothing to refuse.
   */
  const roots = new Set<string>(["localhost"]);
  const named = platform
    ? [platform]
    : [
        platformHost(),
        process.env["PLATFORM_SITE"],
        process.env["PLATFORM_ADMIN_SITE"],
        process.env["NEXT_PUBLIC_DEMO_HOST"],
      ];

  for (const one of named) {
    const root = one ? bareHost(one) : "";
    if (root) roots.add(root);
  }

  for (const root of roots) {
    if (bare === root || bare.endsWith(`.${root}`)) return true;
  }
  return false;
}
