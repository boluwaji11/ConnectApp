/**
 * HRT-306, SEC-020, R21.x. The headers every answer carries.
 *
 * The app sent none of these. No `frame-ancestors` and no `X-Frame-Options`, so
 * every page could be framed, sign-in included, and a page that frames our
 * sign-in over its own chrome gets a volunteer typing a password into what
 * looks like somebody else's site. Nothing set `nosniff`, which matters because
 * two routes serve files a church uploaded. Nothing set a referrer policy, so a
 * path carrying a token left the building in a `Referer`.
 *
 * Embedding is a feature here, which is why this is a function and not a
 * constant: a church is handed an `<iframe>` for its group finder, its events
 * and its forms, and those pages are meant to sit inside the church's own site.
 * Everything else is meant to sit inside nothing.
 *
 * Pure, so the route rule is tested rather than trusted. The backlog asks for
 * exactly that: a test that walks the routes and fails when a new page lands in
 * neither case.
 *
 * What is deliberately not here yet is `script-src`. Next's hydration needs
 * either `unsafe-inline` or a nonce threaded through the document, and a
 * `script-src` that falls back to `unsafe-inline` is a header that reads as
 * protection and is not any. The four directives below need no nonce and break
 * nothing, and the nonce work is the rest of HRT-306.
 */

/** Paths a church is given an embed snippet for, which anybody may frame. */
const FRAMEABLE = [
  /* The finder, the events list and a form, with and without a church in the
     path, and the one-record pages underneath them. */
  /^\/g(\/|$)/,
  /^\/e(\/|$)/,
  /^\/f(\/|$)/,
];

/**
 * Whether anybody may put this page in a frame.
 *
 * Everything not named above answers no, so a screen added tomorrow is refused
 * by default rather than exposed by omission.
 */
export function mayBeFramed(pathname: string): boolean {
  return FRAMEABLE.some((one) => one.test(pathname));
}

/**
 * The headers for a path.
 *
 * `object-src 'none'` and `base-uri 'self'` close two injection routes that
 * need no script of their own: a plugin object, and a `<base>` tag that
 * silently repoints every relative URL on the page. `form-action 'self'` stops
 * an injected form posting a password somewhere else; every form in this
 * product posts to this product.
 */
export function securityHeaders(pathname: string): Record<string, string> {
  const framed = mayBeFramed(pathname);

  /*
   * No `default-src`. It is the directive every other one falls back to, so
   * declaring it restricts `script-src`, `connect-src`, `img-src` and
   * `frame-src` at the same time, and this product legitimately loads Stripe's
   * checkout script, talks to Supabase, serves church media from object
   * storage, frames a church's chosen video, and relies on Next's own inline
   * hydration script. A `default-src 'self'` here would break all five at once,
   * which is how a CSP gets reverted wholesale a week later and never comes
   * back. The four below restrict only what they name.
   */
  const policy = [
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    framed ? "frame-ancestors *" : "frame-ancestors 'none'",
  ].join("; ");

  return {
    /* Only the directives above are declared, so nothing else is restricted
       and no existing request shape changes. */
    "Content-Security-Policy": policy,
    ...(framed ? {} : { "X-Frame-Options": "DENY" }),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    /*
     * Two years, and not `includeSubDomains`. A church points its own name
     * here, and claiming its subdomains would reach services of theirs we know
     * nothing about.
     */
    "Strict-Transport-Security": "max-age=63072000",
  };
}
