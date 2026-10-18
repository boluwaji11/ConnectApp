/**
 * HRT-416. The pass cookie's name, on its own so the middleware can read it.
 *
 * `demo-pass.ts` is marked server-only and reaches for node:crypto, neither of
 * which the edge runtime the middleware runs in will take. The middleware only
 * needs to know whether the cookie is there; opening it is still the server's
 * job and still happens in the module next door.
 */
export const DEMO_COOKIE = "hearth_demo";
