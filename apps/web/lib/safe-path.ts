/**
 * SEC-008, R1.4. A destination inside this product, or nothing.
 *
 * Pure, and in a file of its own so it can be read anywhere: the module next
 * door is `server-only` and reaches the database to ask whether a host belongs
 * to a church, which is the right shape for the rest of that decision and the
 * wrong shape for this part of it.
 *
 * `startsWith("/")` written on its own is the check this replaces, and it is
 * not enough. `//evil.example` begins with a slash and is a protocol-relative
 * URL, which a browser reads as another origin, and some URL parsers read a
 * backslash as a slash, so `/\evil.example` is the same trick again.
 */
export function safePath(asked: string | null | undefined): string | null {
  if (!asked) return null;
  if (!asked.startsWith("/") || asked.startsWith("//") || asked.startsWith("/\\")) return null;
  return asked;
}
