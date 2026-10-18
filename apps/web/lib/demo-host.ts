/**
 * HRT-416, R19.7. The address the demo lives at.
 *
 * A demo you have to find a button for is a demo for people who were already
 * going to look. On this host, arriving is starting: the first request with no
 * pass is handed a church of its own and put on the dashboard.
 *
 * Read from the environment so development can point it somewhere else, and
 * matched on the host alone, because everything else about the request is the
 * product behaving exactly as it does anywhere.
 */
export const DEMO_HOST = process.env["NEXT_PUBLIC_DEMO_HOST"] || "demo.connectapp.church";

/** Where a visitor with no pass is sent, which hands them one. */
export const DEMO_ENTRY = "/demo/go";

/**
 * Whether a request is on the demo's own address.
 *
 * The port is cut off so `demo.localhost:4488` works while somebody is
 * building this, and the comparison is lowercased because a Host header is
 * whatever the browser felt like sending.
 */
export function isDemoHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  return name === DEMO_HOST.toLowerCase();
}

/**
 * The address a request actually arrived on.
 *
 * `nextUrl` carries the host Next resolved the request under, which is not
 * always the one the browser typed: a redirect built from it sent a visitor
 * from `demo.connectapp.church` to the bare product, where the pass cookie
 * they had just been given is not sent, and they met the sign-in screen.
 *
 * Behind Vercel the browser's host is in `x-forwarded-host`, so that is
 * preferred and `host` is the fallback for running this on a laptop.
 */
export function cameFrom(headers: Headers): { host: string; proto: string } {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  const proto = headers.get("x-forwarded-proto")
    ?? (host.startsWith("localhost") || host.endsWith(".localhost") ? "http" : "https");
  return { host, proto };
}

/** An address on the host the request came in on, for a redirect. */
export function backTo(headers: Headers, path: string): URL {
  const { host, proto } = cameFrom(headers);
  return new URL(path, `${proto}://${host}`);
}

/**
 * The product's own site, worked out from the demo's address.
 *
 * `demo.connectapp.church` leads to `connectapp.church` and
 * `demo.dev.connectapp.church` to `dev.connectapp.church`, so leaving the
 * demo lands on whichever of the two the visitor came through without
 * either one being written down anywhere.
 */
export function productSite(host: string | null | undefined): string {
  const name = (host ?? DEMO_HOST).split(":")[0] ?? DEMO_HOST;
  const port = (host ?? "").includes(":") ? `:${host!.split(":")[1]}` : "";
  const bare = name.replace(/^demo\./i, "");
  const proto = bare === "localhost" || bare.endsWith(".localhost") ? "http" : "https";
  return `${proto}://${bare}${port}/`;
}
