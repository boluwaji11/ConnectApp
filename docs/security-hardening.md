# Security conventions

How to write code here so the next review finds less. Every rule below comes
from something the October 2026 review actually found, and each names the shape
of the mistake rather than the principle, because the principle was already
written down and did not stop it.

[docs/engineering-guidelines.md](engineering-guidelines.md) owns technical
standards generally. This file owns the security-specific ones.
[docs/security-audit.md](security-audit.md) is the record of what was found.

## Authorization

**A server action is an HTTP endpoint.** It answers whoever can post to it,
whatever the screen draws. A page that hides a button has hidden a button.

**The documented design puts the check in the repository function.** That is
right for writes and it leaves a hole for reads, because repository readers take
no actor: row-level security supplies the tenant and nothing supplies the role.
So:

- **A write is checked in the repository function.** It keeps being checked
  there even when the action checks too.
- **A read that returns more than the caller's own records is checked in the
  action**, with the permission the writes beside it use. Fourteen reads were
  handing out the staff directory and the church's mailing history because the
  rule stopped at writes.
- **Where every action in a file shares one authority, check it in that file's
  own `context()`.** It then covers the action somebody adds next year. Both
  files where this review found a gap had the check in some actions and not
  others.

**Order matters when the side effect is outside the database.** Check the
permission before the call to a payment provider, not after. A refund that
reaches Stripe and is then refused by the database has moved real money and left
the books disagreeing with nothing recording why.

**Carry `permissions`, not just `role`.** A church that writes its own role
carries `role: "member"` and an array. `canX(role)` on a bare role answers for
the built-in matrix only. This fails closed, so it is a functional bug rather
than an escalation, but it means a check you add refuses a church its own grant.

## Tenant isolation

**Row-level security is the boundary and it only applies to the application
connection.** A query on `owner()` is outside it.

**Every function that uses `owner()` names the rows it may touch, in the query.**
Two had stopped: one took an id with no church, the other joined a table with no
tenant predicate. Both were cross-church.

**A tenant table gets one policy, `FOR ALL`, with `WITH CHECK` identical to
`USING`.** This is generated from the catalogue rather than written per table,
which is why there is no table where reading is scoped and writing is not.

**The platform's own tables are not a church's.** Anything matching
`platform\_%` is excluded from the policy loop, revoked from the application
role, and left with row-level security on and no policy. A blanket
`grant ... on all tables` undid a migration's revoke once; the revoke is by
pattern now so the next platform table is covered on creation.

**A value that has been to the database and back is not a constant.** An
identifier position cannot take a parameter, so anything going into one is
checked against the list it is supposed to have come from.

## The database

**Pin `search_path` on every function.** `''` for anything `SECURITY DEFINER`,
with every name schema-qualified. A function that names tables unqualified gets
a fixed path rather than an empty one: fixed is the property that matters.

**Nobody creates objects in `public` but its owner.** That is the precondition
for shadowing whatever a function resolves.

**Revoke `EXECUTE` from `PUBLIC` by pattern, not by a list.** A new function
carries `EXECUTE` for `PUBLIC` by default, and `REVOKE ... FROM anon` does not
remove what `anon` holds through `PUBLIC`. Five functions escaped a hand-written
list, and `information_schema.role_routine_grants` could not see it because a
`PUBLIC` grant appears there under the grantee name `PUBLIC`.

**Ask the catalogue, in the code and in the test.** Every loop in
`sql/security.sql` and every coverage assertion reads `pg_class`, `pg_proc` or
`information_schema` and excludes what it means to exclude. A test that filters
by the same list it asserts against can only fail if that list shrinks.

## Secrets

**One key, one purpose.** Not one key used by two algorithms in two domains.
Derive where a fallback is genuinely wanted, so the two never share a value.

**Compare a secret in constant time.** `!==` leaks the length and the prefix.
`timingSafeEqual` on equal-length buffers, or WebCrypto's `verify`, and the
decode goes inside the same `try`: in middleware a throw is not a refused pass,
it is a deployment that answers nothing.

**A credential never leaves, under any of its names.** Sealed columns are
stripped from the audit trigger, from the export and from every read path, and
when a table has two of them both are named. One of two was stripped in three
places and not the fourth.

**The audit log is read by more people than the record is.** Anything that is
somebody's whole credential comes out of it before the row is written: a child's
pickup code, an unsubscribe token, a response token, a sealed credential.

## Public surface

**An unauthenticated path that writes, sends or spends gets a rate limit.**
`apps/web/lib/rate-limit.ts`. It refuses to serve the path at all on a
deployment that cannot limit, because an open endpoint with no limiter is the
whole of the problem, and it runs unlimited on a laptop where there is no Redis
and nobody to abuse it.

**Refuse on size before reading the body.** `request.formData()` buffers
whatever arrived.

**A honeypot stops a crawler and nothing else.** A direct caller leaves the
field out.

**A storage key is matched by its whole shape, not its prefix.** A key is a
path, and `startsWith` passes `church/purpose/../../elsewhere`.

## Redirects

**Every redirect target is checked**, whether it came from a query parameter, a
form field or the Host header.

- `safePath` for somewhere inside the product. `startsWith("/")` alone passes
  `//evil.example` and `/\evil.example`.
- `ourOrigin` for an absolute address. Our own names, or a domain a church has
  actually set, read from the database rather than believed.

**An address that will carry a credential is the one to check hardest.** A
`redirect_to` handed to the authentication server comes back with the identity
on it.

## Rendering

**Escape the quotes, not just the brackets.** Escaping `< >` and leaving `"`
open lets stored text close an attribute and add another, which is an event
handler without a tag.

**Parse a URL rather than matching it.** `new URL()`, then an explicit protocol
allowlist, then refuse credentials in it.

**Prefer a model that cannot express markup.** The website builder validates
every section against a closed list and holds no HTML in any field, which is why
a review of it finds nothing.

## Headers

Set in middleware so one value is computed per request and every response gets
it, including the redirects.

**Do not declare `default-src` without doing the rest of the work.** It is what
every other directive falls back to, so it restricts scripts, connections,
images and frames at once, and this product legitimately needs all four. A CSP
that breaks the app is reverted wholesale and never comes back. `object-src`,
`base-uri`, `form-action` and `frame-ancestors` need no nonce and break nothing.

**Framing is a route decision here**, because a church is given an embed snippet
for some pages. A path nobody has named is refused, so a screen added tomorrow
defaults to closed, and the rule is a pure function with a test that walks it.

## Children's records

**Safety-critical, and the rule is the control.** If a check can be skipped by
leaving a field empty, it is not a control. The authorised pickup list was only
applied when the collector was named, and the screen's default was not to name
one.

**Enforce where the church has given us the data.** A church with no pickup
lists filled in must not be made to justify every release, or the escape hatch
becomes the habit and the check never runs.

**Decide on the server.** The station records what happened and the server
re-runs the decision on replay against the lists in the database.

**A minor with no date of birth is still a minor.** Fall back to the household
role. The directory was the one place that published and the one place without
the fallback.

**Any change here is tested at a real service before it ships.** A queue of
forty families two minutes before a service is the design case, and it is not
something to reason about.

## Testing

**Every security fix has a test, and the test is run with the fix reverted.** A
test that passes either way is worse than none, because it is read as coverage.
Two tests in this repository were passing while the thing they named was broken.

**A positive assertion and a negative one.** The authorised reader succeeds, the
unauthorised one is refused, the other church gets nothing, and the valid input
still works. A test where both roles get an empty table proves nothing.

**Assert the invariant, not the symptom.** "No tag carries an attribute other
than `href`" survives a payload that is inert; "the output does not contain
`onmouseover`" fails on text that is harmless.

**Pure rules live in their own file** so they can be tested without a database
or a browser. `apps/web` had no test harness at all until this review, which is
why several pure functions on security boundaries had never been run.
