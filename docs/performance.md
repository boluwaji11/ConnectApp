# Speed

What was slow, what was measured, what changed, and what was left alone.

Measured 6 October 2026 against the shared development Supabase project
(`aws-0-us-east-2`), from a laptop in the same session the owner was testing in.
Work item HRT-234.

## The one number that explains most of it

A round trip to the database costs **22ms**. The heaviest list query on the
product, the directory with its three subqueries per row, **executes in 4.4ms**.

```
Execution Time: 4.438 ms      -- members list, 237 rows, EXPLAIN ANALYZE
warm round trip: 22.1 ms      -- select 1, twenty times
first connect:   281 ms       -- TLS handshake, once per connection
```

So a page's cost is the number of times it goes to the database and back, not
what the database does when it gets there. The development project holds 247
members and 57,070 audit entries, and at that size no query plan on the product
is slow. Everything below is about round trips and about compilation.

## Where the time went

### Development compilation, which is most of what the owner felt

The dev server compiled each route the first time it was asked for. From the
server's own log, before:

| Route | First request |
|---|---|
| `/settings/profile` | 16,682ms |
| `/settings/group-types` | 14,915ms |
| `/import` | 12,512ms |
| `/dashboard` | 11,388ms |
| `/settings/team` | 9,084ms |
| `/settings/church` | 8,413ms |

The same routes under Turbopack:

| Route | First request | Repeat |
|---|---|---|
| `/settings/profile` | 584ms | 83ms |
| `/settings/group-types` | 617ms | 93ms |
| `/import` | 661ms | 186ms |
| `/members/[id]` | 1,099ms | 86ms |
| `/reports/build` | 575ms | 89ms |
| `/calendar` | 518ms | 81ms |

A production build of the same code serves these pages in single-digit
milliseconds plus the data, so roughly nine tenths of what the owner was
sitting through was the development compiler. The product is not that slow in
front of a church. It was that slow in front of us.

The one page that can be loaded without credentials, measured against a
production build on both sides:

```
/g/living-waters   before: 146  149  146 ms
                    after:  93   99  101 ms
```

Everything behind sign-in got the same treatment and more of it, since the
frame around a staff screen was the heaviest part, but it cannot be measured
here without materialising somebody's credentials.

### Setting the tenant context

`withTenant` opened a transaction and then sent four separate statements naming
the tenant, the role, the user and the request's address, one after another.
With BEGIN and COMMIT that is seven round trips before a query ran.

```
four separate set_config: 156ms per transaction
one combined statement:    89ms per transaction
```

89ms is the floor for BEGIN, the context, one query and COMMIT. The remaining
cost is the number of transactions a render opens.

### The frame around every screen

The shell opened three transactions on every staff page: one for the bell, the
notifications, the church and the setup path; one for the reader's own face; one
for the banner that says a church is still being checked. It made a fourth
connection for the demo check, and signed the church mark and the face in two
separate HTTPS calls to storage. Twenty-nine round trips.

Measured with the real connection, the real latency and one trivial read
standing in for each repository call:

```
shell before: 814ms
shell after:  130ms
```

### Reads waiting on each other

A page built its data as an object literal with an `await` on each property.
Properties are evaluated in source order, so eight independent reads cost eight
round trips. postgres.js pipelines queries issued together on one transaction:

```
six reads in turn:    206ms
six reads pipelined:   92ms
```

Counted per page: the dashboard seven, the directory six, a person's page six,
their edit panel eight, the check-in board five plus one roster per room in a
loop.

### Supabase Auth, once per request

`currentUser()` calls `supabase.auth.getUser()`, which is a live HTTPS request
to Supabase Auth on every page render and every server action. Measured from
the same machine:

```
auth endpoint: 37  40  46  58  79 ms
```

It is cached for the request, so it happens once per render rather than once
per component. It was not changed. Verifying the token locally against the
project's JWKS would remove the call, and whether to trust a locally verified
token instead of asking the issuer is a decision about the authentication
boundary, not a performance decision.

### The connection pools did not fit inside the pooler

The dev log carries this:

```
PostgresError: (EMAXCONNSESSION) max clients reached in session mode
                               - max clients are limited to pool_size: 15
```

`DATABASE_URL` and `APP_DATABASE_URL` both point at port 5432, which is
Supabase's pooler in **session mode**: a client connection pins a server
connection for as long as it is open, idle or not, and the ceiling is fifteen
clients per role. The client asked for `max: 8` on each of two pools, so one web
process could reach sixteen and the next request failed rather than waiting its
turn. The operator portal is a second process doing the same. At the time of
measuring, 26 connections were open against the project and 25 of them idle.

### A write on a read path

Every read of a church's roles opened with an upsert of the nine built-in roles.
The development project has logged **1,527 updates against 18 rows**, which is
the roles screen being opened, not roles being changed.

## What changed

1. **Turbopack in development.** `next dev --turbopack`. Checked before
   adopting: Tailwind v4 through PostCSS, the token stylesheet imported through
   the package exports map, `transpilePackages` across the three workspace
   packages, `serverExternalPackages` for postgres, and the view transition
   experiment. The stylesheet it serves carries both the tokens and the
   generated utilities. The production build stays on webpack.
2. **One statement sets the tenant context.** `packages/db/src/client.ts`. The
   four settings go down the wire together. Every transaction in the product,
   dev and production.
3. **One trip for the frame.** `apps/web/lib/shell-data.ts`. One transaction,
   its reads pipelined, the demo check alongside it, both storage keys signed in
   one call, the result held for the request so the staff frame and the portal
   frame share it. The two banners are handed what they display.
4. **The reads on a screen go down the wire together.** The dashboard, the
   directory, a person's page, their edit panel, the check-in board and the team
   screen. The check-in board's per-room roster loop went with them.
5. **The roles screen stops writing to read.** The rows the read returns answer
   the question the upsert was asking, so the write happens on the first read
   after a church is created or after a permission is added to the product.
6. **The component library is imported a piece at a time.**
   `optimizePackageImports`. 197 files reach for it through one barrel. First
   load JS fell by a mean of 24.5kB per route across 108 routes, and the landing
   page by 57kB.
7. **A leaked listener.** The watch on a church's approval added a
   `visibilitychange` listener on every mount and took none of them off again.
8. **The pools fit inside the pooler.** Six connections for the application and
   two for the owner, against a ceiling of fifteen, which leaves room for the
   operator portal and the job worker. A render holds a connection for about
   90ms, so six serve a church many times over and a seventh caller queues
   instead of failing. An idle connection is given back after ten seconds.
9. **The public groups page signs its pictures in one call.** A church with
   twelve groups meant twelve round trips to storage, in turn, on the page a
   stranger follows from the church's own website.

## Found and left alone

**The members list has no default limit.** `listPeople` falls back to
`Number.MAX_SAFE_INTEGER` unless the caller passes a page, and five of its seven
callers do not. The check-in board is one of them, and it wants the whole
directory on purpose, because a volunteer has to be able to find a child who
walked past the desk and the screen has to keep working with no network (R8).
Capping it would break check-in. It wants a different answer, probably a
directory the station holds rather than a page of one.

**Indexes.** The audit found real gaps: nothing on `contact_methods.kind`, which
the per-row email and phone subqueries read; no partial indexes for
`members.archived_at`, `group_memberships.left_on`, `household_memberships.ended_on`;
no trigram index on `groups.name`, which is the one search box `sql/search.sql`
does not cover; and `to_char(date_of_birth, 'MM-DD')` in the celebrations query
cannot use an index at all. None of it matters at 247 members, and all of it is
DDL against a shared database with real data in it. It belongs in a migration
written deliberately, measured against a church with 5,000 members. Writing
these indexes now would be guessing with a lock.

**`select *` across every table in the export.** `packages/db/src/export/archive.ts`
reads each table whole into memory. It is the largest memory risk in the package.
It is also the one path where reading everything is the point, so it wants
streaming rather than a smaller query.

**`checkFor` once per roster member.** `packages/db/src/repo/schedule.ts` batches
two reads carefully and then issues four more per person, so a forty-person team
costs about 163 round trips, and the same occurrence is fetched forty times. It
is the worst single pattern found. It sits on the scheduling action rather than
on a page render, so nobody is watching a screen through it, and batching it
changes what the conflict check means. It wants its own story.

**Two polls a minute.** The watch on approval and the watch on access each ask
the server every minute, and each question resolves a session. They are gated on
the tab being in front of somebody, and the approval one only exists while a
church is still being checked. One question would do for both.

**`force-dynamic` on 84 of 99 pages.** Most of it is right: the data is per
church and per role, and a stale permission is a security bug. `app/page.tsx` is
the exception worth noting. It is the marketing landing page, it awaits nothing
and fetches nothing, and it is marked dynamic. So are `/sign-in`, `/sign-up` and
`/reset`.

**`postgres` is not a dependency of `apps/web`.** Turbopack warns that it cannot
resolve the package named in `serverExternalPackages` from the app's own
directory, so it bundles the driver instead of leaving it external. Everything
works, and the fix is one line in `apps/web/package.json` plus an install, which
is not a thing to do underneath a dev server somebody is testing in.

**The session is resolved twice on every settings page.** The layout resolves it
from the host and the page resolves it from the address, and React's `cache`
keys on the argument list, so the two are different entries. Every verification
it makes is now held for the request, so the second resolution costs nothing,
but it is still two resolutions. Collapsing them properly means the layout
knowing the church, and a layout is not given search parameters.

## Two things noticed on the way past

**The dev server does not need an 8GB heap any more.** `--max-old-space-size=8192`
was there because webpack's dev compiler needed it to hold 3,100 modules across
110 routes. Under Turbopack the module graph lives in Rust, and the Node process
measured **61MB resident** while serving. The flag is harmless and was left
alone, since nothing is gained by removing a safety margin in the same pass that
changes the compiler.

**`tests/request-path.test.ts` is failing, and not because of anything here.**
The owner connection is not subject to the isolation policies, so the test
refuses to let it be imported into the web app at all. Two files import it:

```
apps/web/app/forms/actions.ts
apps/web/app/settings/team/actions.ts
```

Both are server actions, which are request paths. This is the tenancy guardrail
doing its job and it wants fixing before it ships.

## What to watch

- `pg_stat_user_tables.n_tup_upd` on `tenant_roles` should stop climbing when
  the roles screen is opened.
- The dev server log still prints `GET /x 200 in NNNms` for every request. A
  repeat visit to a staff page should now be a few hundred milliseconds rather
  than one to two and a half seconds.

## Signing out, 18 October 2026

HRT-437. Measured because it felt slow, and the feeling was real on a laptop
running `next dev` and not real anywhere else.

Driven through Playwright: sign in, open the confirm, and time from the press
of the confirm to the next page being painted.

| | `next dev` | production build |
|---|---|---|
| `POST /auth/sign-out` | 444ms | **88ms** |
| The page it lands on | 330ms | **23ms** |
| Press to painted | 1050ms | **516ms** |

The route does one thing that costs anything, which is asking Supabase to
revoke the session. That is a round trip and it is not optional: `signOut()`
defaults to revoking everywhere, so a refresh token that has been copied off
the machine stops working. Dropping to a local sign-out would take the round
trip away and leave that token valid until it expired, which is not a trade
worth 88ms.

The rest of the dev number is the compiler, and the destination is the
marketing page, which is the heaviest page in the product under `next dev` and
one of the lightest served from a build.

**Nothing was changed.** The number against a build is already where it should
be, and the button has said "Signing out" with a spinner throughout.

**A measuring note worth keeping.** The first run of this put the figure at
**31 seconds**, which was the test waiting thirty seconds for a selector inside
a dialog it had not opened, then falling through to a catch that opened it. The
request log showed the POST firing at the very end. A number that surprising is
usually the harness.
