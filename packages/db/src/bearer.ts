/**
 * SEC-016. A bearer secret, compared without leaking where it stops matching.
 *
 * The three scheduled endpoints each compared the header to the expected value
 * with `!==`, which short-circuits on the first differing byte. Remote timing
 * extraction of a high-entropy secret over HTTP is not a realistic attack, and
 * this project's own note on the subject says the right thing anyway: a
 * comparison with `===` leaks the length and the prefix. Three other places in
 * the codebase already do it properly.
 *
 * Lives here rather than in the web app because the admin portal needs it too,
 * and both already depend on this package.
 */
import { timingSafeEqual } from "node:crypto";

/** Whether an Authorization header carries this secret. */
export function bearerHolds(header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;

  const given = Buffer.from(header);
  const want = Buffer.from(`Bearer ${secret}`);
  /* timingSafeEqual throws on a length mismatch, and that throw is itself a
     tell, so the lengths are compared first and nothing else is revealed. */
  return given.length === want.length && timingSafeEqual(given, want);
}
