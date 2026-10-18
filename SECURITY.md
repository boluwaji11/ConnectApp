# Security

ConnectApp holds church records: names, addresses, children, giving, and pastoral notes. This
document says how to report a problem with how we protect them, and what protections exist.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting on this repository: open the **Security** tab and choose
**Report a vulnerability**. The report goes only to the maintainers, and the thread stays private
until a fix is published.

If private reporting is unavailable to you, email <support@connectapp.church> with "Security" in the
subject and we will move the conversation somewhere private. Do not include exploit details in that
first email beyond what is needed to establish that there is an issue.

A useful report includes:

- What you found, and what an attacker could do with it.
- The steps to reproduce it, against your own local instance or the development environment.
- The affected area: a route, a repository function, a migration, a package.
- Whether it crosses a church boundary, touches children's records, or touches money.
- Anything you think we will get wrong when we try to reproduce it.

## What we have reviewed ourselves

[docs/security-audit.md](docs/security-audit.md) is the record of the October
2026 review: what was examined, what was found, what is fixed, and what is still
open. It carries no exploit steps, because this repository is public.

[docs/security-hardening.md](docs/security-hardening.md) is the set of
conventions that came out of it, which is what new code is written against.

## What happens next

- We acknowledge the report.
- We confirm or dispute it, and tell you which.
- We agree a disclosure timeline with you, and we will not ask you to stay quiet indefinitely.
- We credit you when a fix ships, unless you would rather we did not.

We will tell you honestly if a fix is going to take a while, and why. ConnectApp is maintained by a
very small team, and a slow fix explained is better than a fast one promised.

## Scope

In scope:

- This repository and anything deployed from it.
- `connectapp.church` and `admin.connectapp.church`.
- `dev.connectapp.church` and `dev-admin.connectapp.church`, which run the same code against seeded
  data.
- A church's published website served by the platform.

Out of scope:

- Supabase, Stripe, Resend, Vercel and Upstash themselves. Report those to the vendor.
- A church's own Stripe account, its own email provider, and its own DNS.
- Findings that require a church's own administrator to act against their own church.
- Volume and rate findings produced by load you generated yourself.

Please do not test against a real church's data, run automated scanners against production, or
attempt denial of service. Use a local instance or ask for access to the development environment
first (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Supported versions

ConnectApp is a hosted service deployed continuously from this repository. There are no released,
separately supported versions, and self-hosting is unsupported in v1.

| Branch | Status |
|---|---|
| `production` | What churches are served. Fixes land here. |
| `main` | Development, deployed to `dev.connectapp.church`. |

A security fix is written on `main` and moved forward to `production`. Older commits receive no
backports.

## How data is protected

### Tenant isolation

Every church's records are separated by PostgreSQL row-level security, not by application filtering.
Every table carrying church data has a `tenant_id` and a policy, the connection is made as a role the
policies apply to, and the tenant is set per transaction. An adversarial test suite attempts
cross-tenant reads and writes on every table, through both the ORM and raw SQL, and it is a release
gate in CI.

Application-layer filters exist for convenience and are never treated as the control.

### Authentication and authorization

Authentication is Supabase Auth, by email link. Authorization is ours, in our own tables, and is
enforced at the query layer rather than in the view: a query made under a role that may not see an
amount returns the record without the amount present. The same named predicates are used by the data
layer and the screens, so one rule has one implementation.

A session is verified against the church's membership on the request rather than trusted from the
browser. A role changed elsewhere reaches an open screen on its own.

TOTP multi-factor is on the board and is not yet built (HRT-13). It is recorded here as a known gap
rather than left to be discovered.

### Children's check-in

Treated as safety-critical rather than as a feature.

- Label pairs carry a unique code per visit, and a child cannot be released without the matching
  code.
- Authorized pickup is enforced at checkout, against the people the household has named.
- Allergies are shown on screen at the moment of check-in.
- Check-in continues with no network and reconciles afterwards, because the failure case is a service
  starting with the wifi down.

No requirement in this area is weakened for implementation convenience.

### Financial data

- Giving runs on Stripe Connect against **the church's own Stripe account**, with a platform
  application fee of zero. ConnectApp never holds church funds and is not a money transmitter.
- **Card data never enters a request path we control.** Stripe-hosted elements only, which keeps PCI
  scope at SAQ-A.
- Batch entry of cash and cheques requires dual control.
- Giving records are readable only by roles permitted to see them, enforced at the query layer.

### Audit logging

The audit log is append only. No application role can modify or delete an entry, including a church's
owner. Writes are made by database trigger rather than by application code, so a path that forgets to
log is not possible.

### Data retention and deletion

Records are archived rather than deleted: they come off every active list and the record stays, which
is what makes a mistaken removal recoverable. True deletion happens only through the subject access
and erasure path, which is on the board and not yet built.

A church can export everything it has at any time, with no plan gate and no support ticket.

We do not train models on church data, and no processor we use is permitted to either.

### Secrets and credentials

- Secrets are never committed. `.env.local` and `.env.production.local` are gitignored and
  `.env.example` carries names with no values.
- The Supabase service role key never appears in a request path. Only the job worker holds it.
- Development and production hold separate Supabase projects, Stripe accounts and email keys, and a
  guard refuses to start a non-production process that is holding a production credential.
- Reported or suspected credential exposure is treated as an incident: rotate first, investigate
  second.

### Reporting something that is not a vulnerability

A privacy concern, a question about what we hold, or a worry about how a church's data is handled can
go to <support@connectapp.church> in the open. It does not need the private channel.
