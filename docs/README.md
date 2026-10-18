# Documentation

Everything written down about ConnectApp, and which document answers which question.

New here? Read [the project README](../README.md), then
[Contributing](../CONTRIBUTING.md), then whichever area below you are working in.

## Getting started

| Document | Answers |
|---|---|
| [README](../README.md) | What ConnectApp is, how to install it, how to run it, how to validate a change |
| [Contributing](../CONTRIBUTING.md) | How to propose a change, what gets accepted, how to open a pull request |
| [Contributor development](contributor-development.md) | Local development, the hosted development environment, and how to request access |
| [Environments](environments.md) | Production and development, which credentials live where, how a process knows which it is |

## Standards

| Document | Answers |
|---|---|
| [Engineering guidelines](engineering-guidelines.md) | The technical standard for every change: data access, isolation, migrations, i18n, testing, comments |
| [UX writing](ux-writing.md) | How ConnectApp talks: voice, tone, buttons, errors, dialogs, email, accessibility, localization |
| [Design system](design-system.md) | Tokens, colour, type, motion, components, the three densities, the station rules |

## The product

| Document | Answers |
|---|---|
| [Product requirements](../PRD.md) | The full specification: 23 domains, numbered requirements, acceptance criteria |
| [Roadmap](../ROADMAP.md) | What each area is, where it stands, and what it has to satisfy before a church depends on it |
| [Backlog](../BACKLOG.md) | Every deliverable, its ID, and its state. The authority on what is built next |
| [Repository inventory](repository-inventory.md) | What every questionable file is for, and what should happen to it |

## Architecture and data

| Document | Answers |
|---|---|
| [Architecture](architecture.md) | Decisions that are expensive to change: tenancy, offline check-in, the job queue |
| [Data model](data-model.md) | Entities and their relationships |
| [Performance](performance.md) | What was slow, what was measured, what changed |

## Feature areas

| Document | Answers |
|---|---|
| [Website builder](website-builder.md) | How a church's site is held, edited, published and served |
| [Giving](giving.md) | How money moves, and why ConnectApp never holds it |
| [In-app messages](messaging.md) | The part of communication that needs no provider, plus the public support form |
| [Connecting a provider](messaging-architecture.md) | How a church connects its own Resend, SMTP or Twilio account |
| [Provider console setup](messaging-setup.md) | What to do in the Twilio and Resend consoles, for whoever holds the platform accounts |
| [Email templates](email-templates/README.md) | The authentication emails Supabase sends, and their markup |
| [Domain Connect](domain-connect/README.md) | Putting a church's three sending records in place in one press, and what it needs from DNS companies |
| [Check-in acceptance](checkin-acceptance.md) | The acceptance criteria for the safety-critical area, written as tests |
| [Onboarding integrations](onboarding-integrations.md) | A design note on Stripe, domains, texting and email during onboarding. Nothing in it is approved |

## Security and operations

| Document | Answers |
|---|---|
| [Security](../SECURITY.md) | Reporting a vulnerability, and how church data is protected |
| [Backup and restore](backup-and-restore.md) | The restore runbook, the census tool, the quarterly drill log |
| [security-audit.md](security-audit.md) | The October 2026 security review: findings, severities and what is fixed |
| [security-hardening.md](security-hardening.md) | The conventions that came out of it, which new code is written against |
| [security/mfa-readiness.md](security/mfa-readiness.md) | The engineering handoff for multifactor authentication |
| [Drill records](../drills/README.md) | What the committed census files are, and why they carry no church data |

## Hearth Stage

Stage is a worship presenter built in its own repository. These documents are the specification of
record and stay here. Nothing in this repository is built for Stage today.

| Document | Answers |
|---|---|
| [Stage requirements](../PRD-STAGE.md) | 20 domains, `ST` requirement IDs |
| [Stage backlog](../BACKLOG-STAGE.md) | The Stage board, `STG` story IDs, and its execution plan |
| [Stage architecture](stage-architecture.md) | The Electron process model, the deck, outputs, the local cache |
| [Stage sync contract](stage-sync-contract.md) | The versioned sync API, if pairing is ever taken up |

## Historical design work

The October 2026 design pass. Half of it is a live reference and half of it is a record of what was
decided then.

| Document | Answers |
|---|---|
| [Redesign reconciliation](redesign/README.md) | What the design settles, what the repo keeps, and where the two disagreed. Start here |
| [Designer handoff](redesign/handoff.md) | The designer's own brief, unedited |
| [Token mapping](redesign/tokens.md) | The colour table the prototypes shipped with |
| [Screen map](redesign/screen-map.md) | Each design screen against the route it was drawn from |
| [The plan](redesign/plan.md) | How the work was broken into HRT-307 to HRT-336 |
| `redesign/design/` | The prototypes themselves. Open any `.dc.html` file straight in a browser |

The prototypes carry sample data and a prototype runtime. Neither belongs in `apps/web`.
