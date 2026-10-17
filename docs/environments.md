# Environments

HRT-397. Two of everything, so that working on ConnectApp cannot reach a church.

Until 17 October 2026 there was one of each: one Supabase project, one Stripe account, one Resend
grant, and a single `.env.local` holding the live credentials for all of them. `pnpm dev` on a
laptop read and wrote the production database. Every seed, every test send and every careless
delete was one keystroke from a real church's records.

There are now two environments. This document says what is in each, how a process decides which one
it is, and what to do when a credential has to be replaced.

## The two

| | Production | Development |
|---|---|---|
| Who uses it | churches | us |
| Supabase project | `nvdovjuqcnxacvhxfrmi`, ConnectApp, us-east-2 | `koaegntsyvvulioesufn`, ConnectApp Dev, us-east-1 |
| Runs at | `connectapp.church`, `admin.connectapp.church` | `localhost:4488`, `localhost:4489`, `dev.connectapp.church` |
| Vercel environment | Production | Preview |
| Branch | `production` | `develop`, and every pull request |
| Stripe | the live account, live keys | a sandbox, test keys |
| Resend | the live key, OAuth client `b52d3683…` | its own key, OAuth client `e2355dfb…` |
| Secrets | generated once, held by Vercel | generated for development, used nowhere else |
| Records | real churches | two seeded churches and ten accounts |

There is no third tier. Preview and local development share the development project, which is the
usual arrangement at this size: a staging database of its own costs money and buys nothing while one
person is building. Supabase's own branching is the other option and is a Pro-plan feature billed per
branch per hour, which a donation-funded product does not spend money on.

## How a process knows which it is

`@connectapp/env`. One small module with no dependencies, read before anything else is set up.

The environment is **declared, never inferred**:

1. `CONNECTAPP_ENV`, if it names one.
2. Vercel's own `VERCEL_ENV`, which is set automatically on every deployment.
3. Otherwise development.

`NODE_ENV` is not consulted at all. Every screen in this repository is checked by building it and
serving it from a laptop, which sets `NODE_ENV=production` and is not production. An environment
nobody has declared is development, so the only way to be production is to say so.

## The guard

`assertEnvironment()` runs from each app's `next.config.ts`, which is the first of our own code in
every build and every server start. It compares the keys the process is holding against the
environment it says it is, and it is asymmetric on purpose:

- **A production credential outside production stops the process.** A live Stripe key, the
  production Supabase project or the production database on a laptop is how a real church gets a
  test email or a real charge. The error names the variable.
- **A development credential inside production is written to the log and drawn on the operator
  portal's status screen.** That direction is a product that does not work rather than one that does
  damage, and a guard able to take the live site down over a misread variable is a worse risk than
  the thing it guards against.

```
$ pnpm dev
Error: Refusing to start. This process says it is development and is holding
production credentials:
  DATABASE_URL: The production database in development.
```

## The files

Both are at the repo root and both are gitignored. Next reads an env file beside the app it is
serving and this is a workspace, so the secrets live once at the root and `@connectapp/env/load`
loads them from there.

| File | Holds | Read when |
|---|---|---|
| `.env.local` | development | always, by default |
| `.env.production.local` | the production database, Stripe still on test keys | only when `CONNECTAPP_ENV=production` is set in the shell |

A variable already set in the shell wins over the file, which is how one value is overridden for a
single command. Production itself holds no file: Vercel passes the variables in and the loader finds
nothing.

### Running against production on purpose

Reading the real database from this desk is sometimes the only way to answer a question. It takes
saying so:

```
CONNECTAPP_ENV=production pnpm --filter @connectapp/db platform:admin list
```

Nothing else reaches it.

That file holds the production project and the production database with **Stripe still on test
keys**, which is deliberate: reading a real church's records to answer a question is sometimes
necessary and taking a real payment from a laptop never is. The guard says so and carries on, which
is the warn direction working as intended. The live Stripe keys exist only in Vercel.

## The database

The development project was built from the migrations rather than copied from production, which is
the point: it proves the schema is reproducible. It was not, until this was done. `sql/security.sql`
created `church_takes_files` in a schema named after the old product that nothing creates, and it
only worked in production because that schema is there from history. A fresh project stopped with
"schema hearth does not exist", and finishing the rename was the fix.

Setting the development database up again from nothing:

```
pnpm --filter @connectapp/db migrate      # 162 migrations, then search.sql, then security.sql
pnpm --filter @connectapp/db seed         # two churches, 13 members
pnpm --filter @connectapp/db seed:users   # ten accounts, including an operator
```

The accounts all take `SEED_USER_PASSWORD` from `.env.local`.

| Account | Is |
|---|---|
| `pastor@riverside.example.org` | owner of Riverside Fellowship |
| `admin@riverside.example.org` | administrator |
| `care@riverside.example.org` | pastoral |
| `member@riverside.example.org` | member |
| the same four at `@northgate.example.org` | the second church, for the isolation tests |
| `founder@newchurch.example.org` | an account in no church, for the way in |
| `operator@connectapp.example.org` | operates the platform, for the portal |

The operator belongs to no church and no church's owner operates the platform, so the portal's two
gates are both exercised by accounts that exist.

**A migration is written once and applied to both.** Development first, because that is where it is
allowed to be wrong.

## Signing in to the sandbox

The two environments hold separate Supabase projects, so an address that signs in to production
does not exist in development at all. It reads as though it might, though, and a password typed
into the wrong one of two identical doors is a mistake worth designing out.

So the sandbox has an address of its own, with no counterpart in production:

```
pnpm --filter @connectapp/db dev:account          # prints a password
pnpm --filter @connectapp/db dev:account <chosen> # or set one
```

`dev@connectapp.church` opens `dev.connectapp.church` and `dev-admin.connectapp.church`. The script
refuses to run against production.

Every screen outside production carries a **Sandbox** bar across the top of the window. The word is
the same whatever the deployment calls itself: Vercel says preview, this repository says
development, and three names for one thing is how somebody ends up unsure which they are looking at.

## What production is owed

One command, run from a desk holding the production database URL:

```
CONNECTAPP_ENV=production pnpm --filter @connectapp/db migrate
```

It applies migration `0163_platform_watch.sql`, which is what the status bars and the sign-in
throttle are waiting on, and it reapplies `security.sql`, which takes the audit trigger off
`platform_events` (HRT-400). Until it runs, granting an operator fails against production with
`null value in column "tenant_id" of relation "audit_entries"`, from the terminal and from the
portal's own Operators screen alike, so there is no way to let a second person in.

## What is still to be filled in

Two credentials cannot be minted from this desk, because both would mean creating something inside
an account. Development runs without them and the screens that need them say so.

### Stripe

Development needs a **sandbox inside the ConnectApp Stripe account**, not a new standalone one:
Connect's platform settings belong to the account, so a sandbox anywhere else cannot create a
connected account the way production does. Stripe's own guidance is now to use a general sandbox
rather than the legacy test mode for new work, and to keep local development and CI in separate
sandboxes.

1. Stripe Dashboard, the account picker, **Sandboxes**, create one called `ConnectApp Dev`.
2. Inside it, Developers, API keys. Copy the publishable key and a secret key.
3. Set them:

```
scripts/set-dev-stripe.sh sk_test_... pk_test_...
```

That writes both into `.env.local` and into Vercel's Preview environment.

4. Make the two webhook destinations and write their signing secrets:

```
node scripts/set-dev-stripe-webhooks.mjs
```

A gift is recorded by the webhook and by nothing else, so a sandbox without destinations takes money
and writes nothing down, while the Payouts screen shows it because that screen reads Stripe live.
This step was a sentence telling somebody to go and do it in the dashboard, and it was skipped. The
Status screen in the admin portal now says when an environment has no destination (HRT-413).

### Resend

The OAuth client a church connects through is already registered for development, with callbacks on
`localhost:4488` and `dev.connectapp.church`. What is missing is the platform's own API key, which
is what sends the welcome, the approval and the confirmation.

Resend has no sandbox. A key of its own in the same account is the separation, and
`delivered@resend.dev` is the address to send to while testing, which Resend accepts and never
delivers to a person.

1. Resend, API keys, create one called `ConnectApp Dev`.
2. `scripts/set-dev-resend.sh re_...`

Until then, development sends nothing and says so rather than failing quietly.

### Upstash

Unset in development. The rate limiter falls back to refusing nothing, which is the right behaviour
on a machine with one person on it.

## Vercel

Two projects.

| Project | Root | Environment | Branch | Domain |
|---|---|---|---|---|
| `connectapp` | `apps/web` | Production | `production` | `connectapp.church` |
| `connectapp` | `apps/web` | Preview | pull requests | preview URLs |
| `connectapp-admin` | `apps/admin` | Production | `main` | `admin.connectapp.church` |

The operator portal deploys from `main` rather than from `production`, so it is
always ahead of what the churches are running. That is deliberate for a tool
whose job is to tell you what the platform is doing, and it is why the portal
is written to work against a database that has not had its migration yet. To
make it wait for `production` instead, change Production Branch in that
project's Git settings; the API will not take that field.

The portal holds 14 of its own variables. Five of the web project's are marked
sensitive in Vercel and cannot be read back even by the API, so they were set
from `.env.production.local` instead: `RESEND_API_KEY`, `PLATFORM_FROM_EMAIL`
and `CRON_SECRET`. The two Upstash ones are in neither place, so the portal's
status screen reports Upstash as having no credential here. Set them with:

```
printf '%s' "<value>" | vercel env add UPSTASH_REDIS_REST_URL production
```

run from `apps/admin`.

Preview had no variables at all before this, so every preview deployment had been failing. The
production variables were not touched: they were listed before and after, and the count went from 25
to 26 only because `CONNECTAPP_ENV=production` was added to make production say so itself.

**Turborepo removes what `turbo.json` does not name.** Vercel runs this workspace in strict
environment mode, so a variable absent from the `env` list never reaches the build. The portal's
first deployment came up with an empty `NEXT_PUBLIC_SUPABASE_URL` inlined into its middleware and
failed on every request. The build said so, in a warning under a green build.

## The scripts beside this document

| Script | What it does |
|---|---|
| `scripts/set-dev-stripe.sh sk_test_... pk_test_...` | Writes the development Stripe keys into `.env.local` and into Vercel's Preview environment |
| `scripts/set-dev-resend.sh re_...` | The same for the development Resend key |
| `scripts/vercel-env.sh` | Copies the production environment from `.env.local` into the linked Vercel project, run from the repo root. Values are piped, never printed, and `PLATFORM_HOST` and `AUTH_COOKIE_DOMAIN` are overridden because the local ones name localhost |
| `pnpm --filter @connectapp/db dev:account` | Creates `dev@connectapp.church` and prints a password |
| `pnpm --filter @connectapp/db seed:dev` | Four seeded churches for the development environment |

**`vercel-env.sh` holds a list of variable names, and that list has gone stale once.** The messaging
work added `PROVIDER_CREDENTIAL_KEY`, the deployment never received it, every church's sealed
credential failed to open in production, and the queue worker answered 500 every five minutes while
working perfectly on a laptop. Add a name to that list in the same commit that first reads it.

## When a secret has to be replaced

Development's secrets were generated for development and appear nowhere else, so replacing one is
local. Generate, write it into `.env.local`, push it to Preview:

```
openssl rand -base64 32                                   # an encryption key
node -e "console.log(require('web-push').generateVAPIDKeys())"   # a push pair
printf '%s' "<value>" | vercel env add <NAME> preview --force
```

Never `vercel env add ... production` while doing development work. That is the one line that
reaches a church.
