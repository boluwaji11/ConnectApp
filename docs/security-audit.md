# Security audit, October 2026

A systematic security review of the whole platform, run on 17 and 18 October
2026. This is the public record: every finding, its severity, the component it
was in, and whether it is fixed. It deliberately carries no exploit steps, no
payloads and no reproduction instructions, because this repository is public and
some of what is below is only one deployment behind.

The working notes, with the traced paths and the payloads, are kept privately
for the maintainers. Ask for them through the process in [SECURITY.md](../SECURITY.md).

## What was reviewed

| Area | Covered |
|---|---|
| Authentication | Sign-up, sign-in, sign-out, email verification, password reset, invitations, sessions, the account-recovery paths, and the send-email hook |
| Authorization | Every one of the 295 exported server actions across 76 files, both apps, and the permission matrix behind them |
| Tenant isolation | Every table carrying a `tenant_id`, the policies on them, and every function that reaches a church on the owner connection |
| The database | `sql/security.sql` in full, every migration that grants or revokes, every function in `public` and in `connectapp`, the audit trigger, and the storage policies |
| Public HTTP surface | All 16 route handlers and every public page route, with their server actions |
| Children's check-in | The release decision, the code generator, the offline log and its replay, the station claim, and what the station holds |
| Giving | Stripe Connect onboarding, the webhooks, the public giving page, refunds, and every financial read |
| Messaging | Provider credentials, the composer, targeting, the send worker, consent, and the Resend OAuth handshake |
| The website builder | The document model, the public render path, media, custom domains, caching, and every HTML sink in the repo |
| The admin portal | Every route, every action, and every exported function it consumes |
| Secrets | The working tree, every ref in the history, the environment templates, and what reaches a log |
| Dependencies | Every workspace, the lockfile, and the GitHub Actions workflows |
| Background work | The queue, the three scheduled endpoints, and how a job carries its tenant |

## Not reviewed

Named so the coverage claim is honest.

- **Multifactor authentication**, excluded by instruction. The readiness note is
  at [security/mfa-readiness.md](security/mfa-readiness.md).
- **Live infrastructure.** No production database, no production deployment, no
  provider dashboard and no live credential was touched. Findings that depend on
  configuration outside this repository are marked as such.
- **The member portal's own service worker and caching**, beyond the check-in
  station's.
- **An exhaustive sweep of every client component** for over-fetched props. The
  components on the sensitive paths were read; the rest were not.
- **SMS.** There is no implementation to review.

## Findings

Severity is exploitability and impact together, not how interesting the bug is.
Cross-church exposure, children's records and money rank above everything else.

| ID | Severity | Component | Issue | Status |
|---|---|---|---|---|
| SEC-001 | High | Rich text | Stored markdown could contribute an HTML attribute to the markup built from it, reaching three render paths | Fixed |
| SEC-002 | High | Online giving settings | Actions managing the church's Stripe account were reachable by any member of the church | Fixed |
| SEC-003 | High | Refunds | A refund reached the payment provider before the permission and the amount were checked | Fixed |
| SEC-004 | High | Children's check-in | Reads returning medical notes, pickup lists and live security codes had no role check | Fixed |
| SEC-005 | High | Invitations | Withdrawing an invitation was not scoped to the church doing it | Fixed |
| SEC-006 | Medium | Send worker | The consent lookup was not scoped to the church, so a message could carry another church's unsubscribe link | Fixed |
| SEC-007 | High | Export | The complete export was gated on the wrong permission for giving data | Fixed |
| SEC-008 | High | Authentication | Redirect and landing addresses were taken from the caller or the request without an allowlist | Fixed |
| SEC-009 | High | Custom domains | A church could claim one of the platform's own names | Fixed |
| SEC-010 | Medium | Database | Two privileged functions pinned a resolvable search path, and the schema permitted object creation | Fixed, needs a migration run |
| SEC-011 | High | Database | A blanket grant returned the platform's own tables to the application role, and one of them was given a tenant policy | Fixed, needs a migration run |
| SEC-012 | Medium | Database | Five functions kept their default execute grant, and the test meant to catch it could not | Fixed, needs a migration run |
| SEC-013 | Critical | Children's check-in | The authorised pickup list and any restriction were not applied when the collector was not named, which was the screen's default | Fixed, needs operational testing |
| SEC-014 | High | Messaging | The provider OAuth handshake was not bound to the browser that began it | Fixed |
| SEC-015 | Medium | Messaging | A church's own mail credential could be sent without TLS against a server that declined to offer it | Fixed |
| SEC-016 | Low | Scheduled endpoints | Bearer secrets were compared in non-constant time | Fixed |
| SEC-017 | Medium | Forms | A stored-file key was checked by its prefix rather than its shape | Fixed |
| SEC-018 | Medium | Scheduling | Unavailability could be deleted by somebody it did not belong to | Fixed |
| SEC-019 | Medium | Messages | A file link was scoped to the church rather than to the conversation | Fixed |
| SEC-020 | Medium | Both apps | No security headers were sent at all, so every page could be framed | Fixed |
| SEC-021 | Low | Admin portal | The unauthenticated path list opened a namespace rather than a route | Fixed |
| SEC-022 | Medium | Directory and messaging | Fourteen reads returned the staff directory or the mailing history with no role check | Fixed |
| SEC-023 | High | Audit log | Security codes and three credentials were written into the append-only log | Fixed for new rows, needs a migration run |
| SEC-024 | Medium | Export | Confidential notes were decrypted in bulk without the audit entry R6.2 requires | Fixed |
| SEC-025 | Medium | Directory | A minor with no recorded date of birth was published as an adult | Fixed |
| SEC-026 | Medium | Public endpoints | Five unauthenticated paths that write, send or spend had no rate limit, and one read its body before checking its size | Fixed |
| SEC-027 | Low | Data layer | Two dynamic SQL sites placed a value in an identifier or literal position without constraining it | Fixed |
| SEC-028 | Medium | Development deployment | The demo host bypassed the team gate on the development deployment | Fixed |
| SEC-029 | Low | Demo | The demo pass could be signed with the note encryption key | Fixed |

### Counts

| Severity | Verified | Fixed |
|---|---|---|
| Critical | 1 | 1 |
| High | 10 | 10 |
| Medium | 14 | 14 |
| Low | 4 | 4 |

No finding is open. Three need `pnpm db:migrate` run against each environment
before they take effect, because they live in `sql/security.sql`; one needs
operational testing before it reaches a church. Both are listed under
"Still to do" below.

### Confirmed secure

Recorded because a review that only lists faults tells you nothing about the
rest, and because these are the places where a later change would be a
regression.

- **The tenant boundary holds.** Every table carrying a `tenant_id` has a single
  policy, `FOR ALL`, with a `WITH CHECK` identical to its `USING`. There is no
  table where reading is scoped and writing is not, which is the classic shape
  of a cross-church write, and it holds because the policies are generated from
  the catalogue rather than written one at a time.
- **The application role cannot escape.** It is not the owner, owns no table,
  and cannot bypass row-level security. All three are asserted by tests, and a
  further test fails the build if the web app imports the owner connection.
- **Payment webhooks** verify their signature against the raw body before
  reading it, refuse an unsigned or unconfigured request, and drop an event
  whose mode disagrees with the key. The account-to-church lookup is keyed on a
  value only the provider can set, so connecting an account cannot write against
  another church.
- **The platform application fee is zero on every path**, including recurring,
  and the one constant that would change it is unreachable while it is zero.
- **No card data anywhere.** No field accepts it, no column holds it, and the
  only public payment key is the publishable one.
- **Church-supplied credentials** are sealed with AES-256-GCM, a fresh random IV
  per record, the tag verified on open, a 32-byte key enforced, and a genuinely
  separate key from the one used for notes. No read path selects them and no
  error message carries them.
- **Security codes** come from a CSPRNG over a 24.3 million code space with the
  modulo bias removed, are unique per church by database constraint, and the
  station uses the same server-issued blocks rather than generating its own.
- **The offline station does not decide a release.** It records what happened and
  the server re-runs the whole decision on replay against the lists in the
  database. Replay is idempotent on a station-generated event id, enforced by a
  unique index.
- **The website builder cannot emit markup.** Every section type is validated
  against a closed list, an unknown one is rejected rather than dropped, no field
  anywhere holds HTML, and every URL is parsed and restricted to `https`.
- **A church session cannot reach the admin portal.** The two apps use different
  cookie names, so an ordinary session is not merely refused there, it is not
  sent. Every portal route, action and layout checks platform membership first.
- **Operators cannot assume a church session.** There is no impersonation path,
  and nothing in the portal reaches member, giving, note or attendance records.
- **No credential has ever been committed**, on any ref. Every match in the
  history is a prefix literal in validation code, a test fixture or
  documentation. No secret reaches a log, and the service role key is not
  introduced anywhere in the repository.
- **No workflow runs untrusted code with secrets.** There is no
  `pull_request_target`, and the workflow that runs on a pull request references
  no secret at all.

## Still to do

| What | Why it is not done | Where |
|---|---|---|
| Apply `sql/security.sql` to development and then production | It is a privilege change to a shared database and belongs with somebody watching it. CI applies it to a throwaway Postgres on every push, which is where the SQL itself is verified | SEC-010, SEC-011, SEC-012, SEC-023 |
| Clear the security codes already written into the audit log | The trigger decides what a new row holds and cannot reach the rows already there, and that table is append-only by design, so it is a deliberate one-off on the owner connection | SEC-023 |
| Walk the new checkout refusal through a real service | It changes the desk flow at the busiest minute of the week, and a queue is the only place that can be judged | SEC-013, HRT-426 |
| Prove a domain before serving it | Needs a DNS challenge and a verification state on the record. The part that reached the platform's own names is closed | HRT-424 |
| `script-src` with a nonce | Needs the nonce threaded through the document, and a `script-src` that falls back to `unsafe-inline` reads as protection without being any | HRT-306 |
| `drizzle-orm` to 0.45.x | Seven minors across the data layer; wants the isolation suite behind it rather than a late-night bump | HRT-432 |
| Qualify the slug helpers' bodies and pin them to an empty search path | They name tables unqualified, so they are pinned to a fixed path rather than to nothing | HRT-425 |
| Audit what an operator reads across churches | Every privileged write is recorded; no read is. For a portal whose purpose is cross-church reach, that is the record that matters most | HRT-434 |
| Enforce append-only on the platform log and the incident records in the database | Both are append-only by convention and by the absence of a write path, not by a grant or a trigger | HRT-435 |
| Clear the station's cache and local database on sign-out | A shared tablet keeps one church's roster after signing out of it. The fix interacts with the offline design and needs care | HRT-436 |

## How this was verified

Every fix has a test, and every test was run with the fix reverted to confirm it
fails. The commands were:

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint --max-warnings 44
pnpm --filter @connectapp/web test        # new: 30 cases over five boundaries
pnpm --filter @connectapp/db test         # the isolation and authorization suite
pnpm --filter @connectapp/i18n test
pnpm --filter @connectapp/ui test
pnpm build
pnpm audit
node scripts/browser-check.mjs /dashboard /members /giving /checkin /settings/online
```

The database suite runs against a real Postgres in CI, which applies every
migration and `sql/security.sql` first, so the database findings are verified
end to end on a throwaway instance rather than reasoned about.

`apps/web` had no test harness before this review, which is why several pure
functions on security boundaries had never been exercised. It has one now and CI
runs it.
