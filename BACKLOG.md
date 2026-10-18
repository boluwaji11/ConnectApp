# Backlog

The board. Every piece of work has an ID, a state, and an owner of the next move.

Requirement IDs (`R2.3`, `R8.21`) point at [PRD.md](PRD.md) and say **what** to build. Work item IDs
(`HRT-14`) say **when** it is being built and whether it is finished. One is the specification, the
other is the schedule. Neither replaces the other.

## How this works

Four levels, narrowest to widest:

| Level | Meaning | ID |
|---|---|---|
| **Epic** | A release. Defined by what a church can do with it. | `E1` to `E6` |
| **Feature** | A PRD domain inside that release. | `F1` to `F23` |
| **Story** | One deliverable. Built, then tested, then closed. | `HRT-n` |
| **Task** | Steps inside a story. Tracked in the story's checklist, not given IDs. |  |

A story is sized to be one sitting and one test. If it cannot be described in a sentence that starts
with a verb, it is too big and gets split.

### States

| State | Meaning | Who moves it next |
|---|---|---|
| **New** | Specified, not started. | Whoever picks it up |
| **Active** | Being built right now. Exactly one story is Active at a time. | The builder |
| **Resolved** | Built, verified by its own tests, waiting to be tested by a person. | **Boluwaji** |
| **Closed** | Tested and accepted. Done. | Nobody, it is finished |
| **Blocked** | Waiting on something external. The blocker is named in the row. | Whoever owns the blocker |
| **Deferred** | Deliberately pushed to a later release. The reason is named. | Reconsidered at release planning |

**Resolved is not Closed.** Nothing closes because the person who built it thinks it works. A story
sits in Resolved until it has been used by hand, which is the whole point of building one step at a
time. That gap between Resolved and Closed is the review.

### Rules

1. **One story Active at a time.** No parallel half-finished work.
2. **Every story names what to test.** A story with no test instruction cannot reach Resolved.
3. **Commits reference the story**, in the footer, one line: `Work item: HRT-14`.
4. **Nothing is built that has no story.** Scope creep is a new row, not a bigger row.
5. **The board is updated in the same commit as the work.** A stale board is worse than none.

### Next, in order

Named here because each one is agreed and none of them is a story's next task, so
the board would otherwise lose them.

1. **Walk a new church through onboarding end to end**, as Fairview Church, with a
   website: sign up, the website fork, approval, the member portal address, and a
   piece of ConnectApp embedded on its own site. This is the hand check that moves
   HRT-294, HRT-295, HRT-289 and HRT-296 out of Resolved.
2. **HRT-305's authenticated visual check**, which is the last thing between the
   member record panel and Closed.
3. **HRT-306**, the framing rules, before launch rather than after it.
4. **Deploy `main` to `production`.** The branch is a long way ahead of what is
   live, and every commit in between is one more thing in a single deploy.

---

## E1. Foundation (0.1)

Internal only. No church touches this. Exit criteria in [ROADMAP.md](ROADMAP.md).

### F24. Design system

| ID | Story | Req | State |
|---|---|---|---|
| HRT-1 | Platform-neutral tokens, generated to CSS, three density modes | R24.1 to R24.3, R24.7, R24.13 | Closed |
| HRT-2 | Colour spectrum, hues assigned to things rather than sprinkled | R24.4, R24.9 | Closed |
| HRT-3 | Component library, every state, both themes, all three densities | R24.6, R24.11, R24.12, R24.15, R24.17 | Closed |
| HRT-4 | The `/design` gallery, eight pages | R24.8, R24.16 | Closed |
| HRT-5 | Replace native browser validation with our own field messages | R24.6 | Closed |
| HRT-6 | Dark-mode status colours, and stop tinting invalid inputs | R24.5, R24.10 | Closed |
| HRT-113 | UI sweep: every screen against the design system, 58 findings | R24.6, R24.18 | Closed |
| HRT-200 | Land the redesign handoff, reconcile its tokens against ours | R24.1, R24.4 | Closed |
| HRT-201 | The shell: collapsible sidebar, a top bar with one action, bottom tabs on a phone | R24.6, R24.14 | Closed |
| HRT-202 | Navigation scoped to the role, one sidebar per persona | R1.3, R24.6 | Closed |
| HRT-303 | Group the staff sidebar into expandable sections with a warm, clear active state | R24.6 | Closed |
| HRT-203 | The dashboard: setup checklist, reorderable tiles, attendance over time | R18.1, R22.1 | Closed |
| HRT-204 | People: the filter drawer, inline search, CSV export, pagination | R2.14, R19.4 | Closed |
| HRT-205 | The command palette on Cmd+K, and no search box in the top bar | R24.6 | New |
| HRT-206 | Empty, first-run, loading and error states across every screen | R24.6, R24.11 | Closed |
| HRT-207 | Notifications: the bell, the unread count, a panel per role | R24.6 | Closed |
| HRT-253 | Every screen on a phone: the shell, the tables, the panels and the public site | R24.6, R24.14 | Closed. The check-in desk and the supervisor board need a service on today's date to exercise |
| HRT-254 | One way to reach an archived record, on every screen that has them | R24.6, R2.9 | Closed |
| HRT-208 | The remaining screens against the redesign, one pass each | R24.6, R24.18 | Closed |
| HRT-222 | The ConnectApp website: the page a church reads before it is anybody | R22.1, R24.6 | Closed |
| HRT-298 | Update the landing page story and invite churches to the pilot | R22.1, R22.2 | Closed |
| HRT-223 | The church code comes out: a church is named by its address, not a secret | R1.7, R22.1 | Closed |
| HRT-224 | Onboarding: a welcome, the five things in the order one unblocks the next | R22.1, R22.3 | Closed |
| HRT-225 | The setup dock: the path follows whoever is walking it, on any screen | R22.1, R22.3 | Closed |
| HRT-226 | A church writes its own vocabulary: group types and teams start empty, teams configured in Settings | R9.1, R10.1 | Closed |
| HRT-227 | The ConnectApp admin portal: churches, approval, archive, the operators and the log | R21.x, R22.x | Closed |
| HRT-234 | Speed: Turbopack in development, one trip to the database per frame, pipelined reads. [docs/performance.md](docs/performance.md) | R24.11 | Closed |
| HRT-342 | The warning count comes down, and the landing page's shots are sized for the device they land on | R24.11, R22.1 | Resolved |
| HRT-343 | A send mints every way out in one go, rather than one round trip a recipient | R24.11, R16.8 | Resolved |
| HRT-344 | A claimed copy that never left goes back in the queue | R24.11, R16.6 | Resolved |
| HRT-345 | Giving statements are read in set-based queries, not one giver at a time | R24.11, R18.9 | Resolved |
| HRT-346 | A bulk action over a selection is one write, not one a row | R24.11, R1.13 | Resolved |
| HRT-347 | The frame and the page read at the same time | R24.11 | Resolved |
| HRT-348 | Fifteen screens read their independent rows together | R24.11 | Resolved |
| HRT-349 | A session resolves in two round trips, not five | R24.11, R1.5 | Resolved |
| HRT-350 | The directory's duplicate count is answered in SQL | R24.11, R1.12 | Resolved |
| HRT-351 | One authentication call a navigation, and the job routes are left alone | R24.11, R1.5 | Resolved |
| HRT-352 | The catalogue splits by area, so a screen ships the words it uses | R24.11, R20.1 | Resolved |
| HRT-353 | The screens stream: the frame paints while the rows arrive | R24.11, R24.12 | Resolved |
| HRT-354 | Server-side observability: which page, which query, which church | R24.11, N3 | Resolved |
| HRT-355 | The send queue keeps up with a thousand churches | R24.11, R16.6 | Resolved |
| HRT-356 | The things read on every request are read once: a cache for the church, its host and its signed links | R24.11, R17.1 | Resolved |
| HRT-357 | Nothing hangs: a statement timeout, and a budget on every call that leaves the building | R24.11, R21.5 | Resolved |
| HRT-358 | A screen somebody just looked at is still in hand when they come back | R24.11, R24.12 | Resolved |
| HRT-359 | Every area's links are always in the navigation, so the browser can fetch them before they are pressed | R24.11, R24.12 | Resolved |
| HRT-360 | The shell becomes a layout, so a navigation fetches the screen rather than the whole frame | R24.11, R24.12 | Resolved |
| HRT-361 | The gifts spreadsheet says how the money came in in the church's own English | R13.23, R22.8 | Resolved |
| HRT-362 | A table narrower than it can be read scrolls rather than running into itself | R24.6, R2.14 | Resolved |
| HRT-363 | Settings closes the area column, the way Overview already does | R24.14 | Resolved |
| HRT-364 | The pager says which page you are on, and which ones there are | R2.14, R24.6 | Resolved |
| HRT-366 | The screen's name goes back across the top, where it was | R24.6, R24.11 | Resolved |
| HRT-365 | Five screens cannot navigate to themselves, so their paging and filters do nothing | R24.12, R13.21 | New |
| HRT-297 | Collect production Core Web Vitals in Vercel Speed Insights | N3 | Closed |
| HRT-299 | Compare font systems in the design gallery without changing app fonts | R24.6 | Closed |
| HRT-300 | Set IBM Plex as the platform type system across web, admin and design tokens | R24.7 | Closed |
| HRT-301 | Alternate the landing-page "for free" and "always" typewriter phrases | R22.1, R24.6 | Closed |
| HRT-302 | Send landing-page support messages to the support inbox and link the footer contribution page | R22.1 | Closed |
| HRT-235 | Plan templates are configured in Settings, with ready-made shapes, and the plan screen starts from them | R11.8 | Closed |
| HRT-236 | The kinds of plan item are a list the church keeps, in its own words | R11.2 | Closed |
| HRT-237 | Giving: the funds, the counting session with dual control, and what came in | R13.9 to R13.15, R13.21 | Closed |
| HRT-238 | Stripe Connect at a zero platform fee: the church's own account, direct charges, the webhook | R13.1, R13.2 | Closed |
| HRT-239 | The giving page a church links to from its own website, with optional fee coverage | R13.5, R13.6 | Closed |
| HRT-240 | The deposit slip, and the gifts as a spreadsheet | R13.22, R13.23 | Closed |
| HRT-241 | Year-end giving statements to Publication 1771, on screen and in print | R13.17, R13.19 | Closed |
| HRT-242 | The giving report: by month, by fund, who stopped giving, who started | R13.21, R13.24, R13.25 | Closed |
| HRT-243 | A gift that repeats, and the giver's own way to change or stop it | R13.3 | Closed |
| HRT-244 | A member's own giving, and their own statement, from the portal | R13.19, R17.4 | Closed |
| HRT-245 | A repeating gift that has stopped collecting says so on the giving screen | R13.8 | Closed |
| HRT-246 | Campaigns and pledges: a target over a period, and what households committed | R13.16, R13.18 | Closed |
| HRT-247 | One statement a household, where the church chooses that | R13.18 | Closed |
| HRT-248 | A gift split across funds, written as one gift a fund | R13.4 | Closed |
| HRT-249 | A printable QR code for the foyer and the bulletin | R13.7 | Closed. Text-to-give waits on messaging |
| HRT-250 | The church's balance, payouts and payments read inside ConnectApp, no actions | R13.1 | Closed |
| HRT-251 | Stripe Accounts v2: account creation, onboarding links, account sessions and the v2 event destination | R13.1 | Resolved |
| HRT-252 | A bank gift shows the day it is authorised and counts the day it arrives, with what the bank said where it did not | R13.2 | Closed |
| HRT-386 | The church says whether Stripe granted it the nonprofit rate, and the covered fee is worked out from it | R13.5 | Resolved |
| HRT-387 | One refresh of a church's Resend grant at a time, and a quiet church's grant renewed before it lapses | R16.1 | Resolved |
| HRT-388 | A church is welcomed when it is created and told when it is approved | R1.1, R22.1 | Resolved |
| HRT-389 | The invitation email draws itself from the shared brand shell | R16.4 | Resolved |
| HRT-390 | A form says which field is wrong, and a refused sign-up keeps what was typed | R1.7, R22.1 | Resolved |
| HRT-391 | The messages Supabase Auth sends are drawn in our brand and leave through Resend | R1.7, R16.4 | Resolved |
| HRT-392 | Supabase's send hook, so every auth message is ours to draw and goes out through Resend | R1.7, R16.4 | Resolved |
| HRT-397 | A development environment of its own, from Supabase to Stripe, and a guard that refuses another environment's keys | R21.x, N3 | Resolved |
| HRT-393 | The operator portal wears one frame: a collapsible rail, and every screen drawn from the component library | R21.x, R24.6, R24.14 | Resolved |
| HRT-394 | The platform's own status: every integration and every API probed, with what each one last said | R21.x, N3 | Resolved. The bars stay empty until migration 0163 is applied to production |
| HRT-395 | Delivery: what is on main, what is live, what CI said, and where the board stands | R21.x, R22.x | Resolved |
| HRT-396 | The portal's own door: one gate in front of every screen, a throttle, and every attempt written down | R21.1, R21.x | Resolved |
| HRT-399 | A second factor on the operator portal, and the setting that makes it compulsory | R21.1 | New |
| HRT-402 | The development deployment is behind the team, on its own addresses, with its own keys | R21.x | Resolved |
| HRT-401 | Inviting a team member who has no ConnectApp account: one email, one press, and they are in | R21.x, R1.7 | Resolved |
| HRT-400 | Granting an operator reaches the audit trigger, which refuses it, so nobody could be let into the portal | R21.x, R1.11 | Resolved. The fix is in security.sql and needs a migrate run against production |
| HRT-398 | The operator portal on its own address, admin.connectapp.church | R21.x | Resolved. Live. Upstash is unset there, and the only operator is mike@connectapp.church |

The pass against the reference screens, October 2026. Phase A builds the vocabulary once,
B puts it in the shell, C applies it a screen at a time, D adds what the reference has and
we do not. The reading that produced them is below the table.

| HRT-307 | One page header: where you are, what the screen is, what it is for, and its one action | R24.6, R24.15 | Resolved |
| HRT-308 | One table: a row, a cell, sorting, selection and the empty case, instead of sixteen | R24.6, R24.15, R2.14 | Resolved |
| HRT-309 | One segmented control instead of five. No counts on tabs: the user struck them | R24.6, R24.15 | Dropped, folded into Phase C |
| HRT-310 | Pagination the reader controls, with how many a page as a choice rather than a constant | R24.6, R2.14 | Dropped, folded into Phase C |
| HRT-311 | One relative time, laddering to years, written in the church's own language | R22.8, R24.6 | Dropped, folded into Phase C |
| HRT-312 | One tag chip, with the count of the ones that did not fit | R1.13, R24.4 | Dropped, folded into Phase C |
| HRT-313 | A face pile, for a group's leaders and the holders of a role | R24.6, R24.9 | Dropped, folded into Phase C |
| HRT-314 | A stat tile that can say "+8 this week", and one of them instead of three | R24.6, R18.1 | Dropped, folded into Phase C |
| HRT-315 | The charts move into the design system, and gain a gauge and a sparkline | R24.4, R24.6 | Dropped, folded into Phase C |
| HRT-316 | The activity feed, out of the member record and into the design system | R2.15, R24.6 | Dropped, folded into Phase C |
| HRT-317 | A status pill that changes the status | R2.2, R24.9, R24.15 | Dropped, folded into Phase C |
| HRT-318 | How complete a record is, said once and the same way everywhere | R2.1, R24.9 | Dropped, folded into Phase C |
| HRT-319 | The sidecar: four areas in a rail, their items beside it, and the accordion goes | R24.6, R24.14, R1.3 | Resolved |
| HRT-320 | The phone follows the sidecar: four areas, one tab each | R24.6, R24.14 | Resolved |
| HRT-321 | Members against the new vocabulary: the directory, the window, and every screen under it | R2.1, R2.14, R24.6 | Resolved |
| HRT-322 | Groups against the new vocabulary, and the two shells that screen renders | R9.5, R24.6 | Resolved |
| HRT-323 | Events against the new vocabulary: the list, the record and the roster | R14.1, R24.6 | Resolved |
| HRT-324 | Forms against the new vocabulary: the list, the builder and the responses | R4.1, R24.6 | Resolved |
| HRT-325 | The dashboard: tiles that carry a change, and the charts beside them | R18.1, R22.1, R24.6 | Resolved |
| HRT-326 | Reports: the shared table, the promoted charts, and a catalogue that looks like them | R18.2, R24.6 | Resolved |
| HRT-327 | Settings: twenty-three screens to one header and one table | R1.1, R24.6 | Resolved |
| HRT-328 | Follow-ups, calendar, incidents, import and the website editor | R5.1, R15.1, R24.6 | Resolved |
| HRT-329 | Giving against the new vocabulary, inside what 0.3 already built | R13.21, R24.6 | Resolved |
| HRT-330 | The check-in screens, where the rules deliberately differ | R24.14, R8.8, R24.11 | Resolved |
| HRT-331 | The public pages and the member portal | R17.1, R24.6 | Resolved |
| HRT-332 | One paper style across eleven print sheets | R24.6, R2.14 | Resolved |
| HRT-334 | A record says how complete it is, and the directory says which are not | R2.1, R19.3 | New |
| HRT-335 | The church's own activity feed, read from the log that already records it | R1.11, R18.1 | New |
| HRT-336 | Sweep the dead ends: a link to nothing, two empty directories, components nothing renders | R24.18 | Resolved |
| HRT-337 | Lint in CI, with the rules of hooks enforced | R22.7, N7 | Resolved |
| HRT-340 | Take out the church prop nothing reads | R24.18 | Resolved |
| HRT-338 | Website Builder 2.0: a church builds a site it is proud of (umbrella) | R22.2, R24.15 | New |
| HRT-377 | The website document model: pages, sections, theme, draft and published revisions | R22.2, R24.15 | Resolved |
| HRT-378 | The visual editor: canvas, selection, inline text, inspector, undo, autosave | R22.2, R24.15 | Resolved |
| HRT-379 | The section library and its layout variants | R22.2, R24.15 | Resolved |
| HRT-380 | Six art-directed templates, and site styles a church changes once | R22.2, R24.6 | Resolved |
| HRT-381 | Pages, navigation, the shared header and the shared footer | R22.2, R17.1 | Resolved |
| HRT-382 | What the site reads from the church: service times, events, groups, forms, giving | R22.2, R1.5 | Resolved |
| HRT-383 | Publish, revisions, preview, search engines, and how fast the page is | R22.2, R24.15, R22.7 | Resolved |
| HRT-384 | The landing page's feature grid says what each part is for | R24.6, R22.1 | Resolved |
| HRT-385 | The setup guide offers a church the website it can have | R22.1, R22.2 | Resolved |




## The sidecar, October 2026

HRT-319. The navigation was four groups stacked in one 232px column as an
accordion: opening one closed another, and `section-memory` kept track of where
each had been left. That is a two level navigation crammed into one level, and
the accordion was the apology for it.

Two levels drawn as two columns needs no apology and nothing remembered. A 64px
rail of four marks, Overview, People, Gatherings and Church, with that area's
items in a second column beside it. The area follows the route, so it is a fact
about where the reader is rather than a preference they set, and pressing a
mark on the rail moves the second column without navigating: somebody can look
into Gatherings while standing on a member's record and go back by pressing
nothing.

The plan said `navFor(role)` already returned these four groups. It does not;
it returns one flat list, and the grouping was a table of route prefixes inside
the sidebar. The table stayed and gained an icon per area.

Settings, the person and signing out moved onto the rail, which is the half
that never shuts. The role moved into the avatar's tooltip rather than being
dropped.

The area being looked at is a tall rectangle carrying its own name down the
rail, reading upward so the first letter sits at the bottom, with the mark above
it. The others are marks alone. That is what makes a rail of icons readable
without hovering each one.

**An area holding one screen draws no column.** Overview is the Dashboard and
nothing else, and a column with a single row under a heading naming the same
thing is a list of one. Pressing that mark is the navigation, and no collapse
control is drawn because there is nothing to collapse.

**What the browser caught.** The first version put the reopen control floating
beside the rail. The sticky header is `z-30` and the control was `z-10`, so the
header swallowed the press: the column could be closed and then never reopened.
Shutting the column now belongs to the column, beside the church's name.
Opening it again cannot, so the rail carries that half and only that half, and
only while the column is shut.

## Phase A folds into the screens, October 2026

The plan split the pass in two: build a shared vocabulary in `packages/ui`
first (HRT-307 to HRT-318), apply it to screens second (HRT-321 onward). Two
stories in, that is the wrong order for this product.

HRT-307 and HRT-308 each ended with a component in the gallery and not one
screen a church uses looking any different. That is what Phase A was designed
to do, and it is still not what the pass is for. The reason the pass exists is
that the product's screens do not look good enough, and ten more stories of
gallery work is ten more weeks before anybody sees that change.

So HRT-309 to HRT-318 are dropped as separate stories. What they described
still gets built, inside the Phase C story that first needs it, against a real
screen with a church's real records in it. A tab with a count is built when
Members needs one; the stat tile is built when the dashboard needs one. The
gallery entry comes along with it, because the contrast audit and the three
densities still have to be checked somewhere, but it is the by-product rather
than the deliverable.

What HRT-307 and HRT-308 left behind is kept: `PageHeader`, `SortTh` and
`TableEmpty` are real and the screens adopt them from here.

The order is now the shell, then the areas: HRT-319, HRT-320, then HRT-321
onward.

## The phone follows the sidecar, October 2026

HRT-320. The bar across the bottom of a phone carried the first four entries
and put the other ten behind More. Which screens a phone could reach in one
press was therefore decided by the order a list happened to be built in, and
the phone and the desktop had nothing in common.

The four areas are the four tabs. Pressing one opens what is in it, which is
the sidecar's second column drawn as a sheet, because a phone has no room to
keep it standing. An area holding one screen opens that screen rather than a
sheet listing one thing, the same rule the rail follows.

Whatever no area claims sits in a last tab, which for most churches is Settings
on its own. One of them wears its own name and mark rather than saying More: a
tab called More that always opens the same single screen is a riddle with one
answer.

`Tab` said `aria-expanded` where it meant `aria-current`. The mark says which
area the reader is in, which is true whether or not a sheet is open.

**What the sidecar shook out of the tables.** `ResizableTable` pins its columns
in pixels and re-measured only on a window resize. Shutting the navigation
column widens the card without touching the window, so the table kept its old
total and left a band of empty card down the right, 112px of it on Members,
until the page was reloaded. It now watches the room around it with a
`ResizeObserver`.

Re-measuring was the wrong answer and was tried first: once the widths are
pinned, every heading reports the width it was pinned to, so a second
measurement returns the same set and changes nothing. The set already in hand
is scaled into the room there is now, through the same `fitted` and `squeezed`
the component already had, which also keeps whatever the reader had dragged.

## Lint has never run, October 2026

HRT-337. `pnpm lint` runs turbo's `lint` task in six packages and executes
nothing, because no package defines one and the repo has no ESLint config at
all. The `eslint-disable` comments in three files have therefore never
suppressed anything, and `react-hooks/rules-of-hooks` has never been checked.

What that cost, found by hand on 12 October: `SetupDock` called `useOverlay()`
after an early return, so the hook count changed between the first render and
the second. The dock threw on every render it reached, and because it sits in
the app shell the nearest error boundary is the screen's, so a brand-new
church met "That screen did not load" on the Website editor. The dock had
never once drawn since it was written.

A typecheck does not catch it, a unit test does not reach it, and nobody
notices until a church with unfinished setup opens a screen. One lint rule
catches the whole class.

Scope: an ESLint flat config at the root with `react-hooks` and
`@next/eslint-plugin-next`, a `lint` script in each package so turbo has
something to run, and a lint step in `ci.yml` beside typecheck. Fix whatever
the first run turns up before it is wired in, so the step lands green.

**What the first run found.** 1,002 problems, which came down to 131 once the
config stopped reading things that are not this repo's source: Hearth Stage is
checked out inside this directory and ignored by git, `out/` held its build
output, `docs/redesign` holds drawings, and `no-undef` reported `console` 698
times in files TypeScript already checks.

Six `react-hooks/rules-of-hooks` errors were left, in four files. Two were a
server action named `use` something, which the rule reads as a hook:
`useFormForEvent` and `useTemplate` are now `attachEventForm` and
`applyPlanTemplate`, which is what they do, and neither name misleads a reader
into expecting a hook. The other four were the real thing, and two of them were
live bugs nobody had reported:

- **`components/pages.tsx`**, the paginator every list on the platform uses,
  returned null for a single page and then called three hooks. A list growing
  past one page while it was mounted, which is a filter cleared or a search
  widened, changed the hook count and threw.
- **`forms/[id]/responses.tsx`** returned the empty state and then called
  `useId`, so a form taking its first response while somebody had it open threw.

The lint runs as one pass over the repo rather than six through turbo, because
the flat config already covers every package. The step is pinned with
`--max-warnings`, so the warnings cannot grow: 127 on the day it landed, 60
once HRT-340 had swept the unused ones out.

## The church prop nothing reads, October 2026

HRT-340. Wiring lint turned up 67 unused variables and about forty-five of them
are one thing: a `church` prop destructured in a component and never read. It
is threaded through screens across members, groups, events, forms, giving,
reports, schedule, services, settings and the shell.

Each one is harmless alone. Together they are a prop every new component copies
because the one beside it has it, and a reader cannot tell which screens
genuinely need the church and which inherited it.

It is a sweep, not a design decision: take the prop off the component, take it
off the call site, and let the typecheck find the rest. Its own story because
forty-five files in the lint commit would hide the six hook fixes that commit
is actually for.

**What it came to:** 92 files, 217 lines gone. 43 components stopped taking a
prop, and 57 attributes and 11 arguments came off the call sites. Seven server
actions took a `church` they never read: `clearGroupPhoto`, `dropFile`,
`saveDomain`, `clearPhoto`, `kindsICanWriteTo`, `whoToWriteTo` and
`dropPledge`. The shell lost it twice, from the sidebar and from the phone
tabs, and the member portal's tabs lost it too.

The first attempt matched the first occurrence of the name in each file rather
than the line the lint reported, and took a `viewing` that a second component
two hundred lines down was reading. It was reverted whole. The second pass
anchors on the reported line and brace-matches the type literal beside the
destructure, and TypeScript confirmed it: no "cannot find name" anywhere, and
27 screens checked in a browser afterwards.

`no-unused-vars` is now an error, and the ratchet in `ci.yml` came down from
127 warnings to 60.


## What a church can build with us, October 2026

HRT-338. Sign-up promises a church with no website that we will give it one.
Walking Fairview through that on 12 October, the page it ends up with is thin,
and the editor around it is thinner. What is actually wrong, from the walk:

- **No section for the church's own events or groups.** The seven kinds are
  hero, story, banner, image, video, services and contact. Meanwhile the embed
  flow hands a church an iframe of its what's-on page to paste into Wix. So we
  will put a church's events on somebody else's site and not on the one we
  built for it.
- **The page repeats itself.** On a freshly published homepage the church's
  name reads four times and "Sign in" and "Join this church" twice, once in
  the header and again in the hero, on a page with one screen of content.
- **Publishing is a checkbox.** "Publish website" is a tickbox beside Save,
  so putting a church on the internet reads like setting an option. It is the
  most consequential press on the screen and it looks like the least.
- **No phone preview.** The preview is the desktop width only, and most people
  who open a church's website are holding a phone.
- **The three starting designs differ by section list**, not by layout, so
  Gathering, Community and Classic produce the same stacked page.
- **Nothing says what a good page has.** A church is given an empty section
  list and no sense of what to put in it.

What it is not: the two parts that work are the brand hue carrying through to
the public page, and the empty states on the public pages, which read well
("Nothing coming up. Check back, or ask whoever runs the church."). The
rebuild keeps both.

This sits behind the Phase A vocabulary (HRT-307 to HRT-318), because a page
builder wants the shared header, tabs and empty state rather than its own.


## Website Builder 2.0, October 2026

HRT-338 was one row describing what is wrong. The rebuild is too large for one
row, so it becomes the umbrella over HRT-377 to HRT-383, built in that order.

**What is there today.** One table, `church_websites`, keyed by tenant: a
`published` boolean, one of three `layout` words, and a `sections` jsonb array
of at most twenty rows. `packages/db/src/repo/website-rules.ts` validates the
array and is the single guard on what a church can write. One React component,
`apps/web/components/church-website.tsx`, renders those sections twice over: as
the preview inside the editor and as the real page on the church's own address,
which `apps/web/app/page.tsx` serves when `churchFromHost()` names a church.
That single renderer is the best thing in the current design and the rebuild
keeps the idea: the editor and the published page share one set of components.

**What has to change, beyond the walk recorded above.**

- **One page only.** There is no page table, no slug, no navigation. A church
  gets a homepage and nothing else.
- **No draft.** `saveChurchWebsite` writes straight over the live row, so a
  church cannot work on its page without the congregation watching it happen.
  There is no revision to go back to either.
- **The section shape is one flat row for seven kinds.** `title`, `body`, one
  image, one video, one link. A ministry grid, an events list or a leadership
  row cannot be expressed in it, and widening that row for each new kind ends
  with thirty nullable fields. Sections need per-type content, validated per
  type, with a version on each so an old row can be migrated.
- **The published page cannot be cached, and pays to render.** Uploaded media is
  served through `createSignedUrls(keys, 3600)` on every request, so the page is
  `force-dynamic` by necessity and an hour-old HTML copy would serve dead image
  links. A church site wants a long-lived public URL for its own photographs.
  This is the one piece of infrastructure the rebuild has to add rather than
  reuse.
- **The theme is a single hue.** `brand_hue` carries through, which is why the
  current pages look related to the admin product rather than independent of
  it. A site wants its own palette, its own two fonts and its own button shape.

**Two things in the brief that the design system overrides.** The brief asks
for ConnectApp purple on selected states: there is no purple in
`packages/ui/tokens/color.json`, the product is ink and ember on warm stone, and
the editor uses `--color-primary` like every other screen. The brief also asks
for a stock image library; `docs/design-system.md` and the trust commitments
leave a church's own photographs as the only imagery on its page, with drawn
artwork where a photograph is missing.

**What the rebuild reuses.** The single renderer, the brand hue on the public
page, the public empty states, `storedFiles` and `/api/upload` with the
`website_media` purpose and its quota, the `f`, `g` and `e` public pages for
forms, groups and events, `withTenant` and RLS for every write, and
`canManageWebsite`.

**What was built, October 2026.** HRT-377 to HRT-383, in that order.

The keystone is that a section is a pure presentational component writing
`data-edit` through the kit, and the editor's canvas reads those attributes by
delegation. So the canvas is the page: there is no preview implementation, no
editor implementation, and adding a kind of section changes nothing about the
editor. Twenty-two kinds, about seventy layouts.

What the walk found in a browser that reading the code did not: the church's own
mark 404ed because the view context dropped its key; the storage policy still
asked the old flat homepage whether a picture was public, so every photograph on
a new site would have been refused to visitors; a page could carry two h1s once a
church added a second welcome; a bound section with nothing to show drew a
heading over a blank space on a live page; the starting designs were four
text-only pages, because a layout built around a picture draws nothing without
one; and a church's website was missing from its own data export, which the
table-walking export test caught.

Measured on a build, on the church's own host: 50 to 56ms to first byte for a
47KB home page, 7ms for a second page, with the document held under a tag
dropped on publish and the bound data held five minutes. The editor is 53.7KB of
its own JavaScript.

Three things that were listed as still open have since been closed, and one of
the three was never open. Cropping is now a drag-and-zoom box on the picture
itself (`builder/crop.tsx`), and the guide offers the website as a step
(HRT-385). The third was a mistake of mine, and the same mistake the note on
HRT-368 below already records: I repeated "nothing writes `service_times`" from
the older paragraph without reading the correction under it, and built a second
writer on Church profile before checking. `addService` has written the pattern
since services became one idea, which is the one place a church would look, so
the second writer came out again. A function with no callers is not a capability
with no screen.

## The pass against the reference, October 2026

HRT-307 to HRT-336. Seventeen screens from another church product were held up as the
standard to beat, and three surveys were run against our own: every route, every component,
every board convention. What they found is not a list of ugly screens. It is that the same
thing is built several ways.

Zero screens say where you are. Zero carry a count in a tab label. There are five tab
implementations, three stat tiles, three paginators, and one screen in the whole product
where the reader can choose how many rows a page. Sixteen screens hand-roll a table against
two that use the one in the design system. Eighteen have no empty state. The nav offers
somebody a link to `/directory`, which does not exist.

So the work is not a repaint. It is building each piece once and then using it, which is
what the design system was for. Phase A (HRT-307 to HRT-318) builds the vocabulary and a
church sees nothing change. Phase B (HRT-319, HRT-320) puts it in the shell. Phase C
(HRT-321 to HRT-332) applies it a screen at a time. Phase D (HRT-334 to HRT-336) adds the
few things the reference has that we do not.

**What is taken from the reference and what is not.** Taken: the structure. Counts in tabs,
relative dates, a page size the reader sets, colour chips with an overflow count, a record
that says how complete it is, numbers that carry their change, a feed of what happened.
Left: the money (payment columns, revenue, ticket sales), the messaging (a WhatsApp button
beside a birthday), the blue and its cool neutrals, and the plan meter, because that is a
paid tier and we are free. Our warm stone, ink, ember and the eight assigned hues stay.

**The sidecar.** The reference's left-most strip is a rail of icons that switches area, the
active one named down its side, with that area's items in a second column. We already have
its content in the wrong shape: four groups, Overview, People, Gatherings and Church, in one
232px column as an accordion where only one opens at a time. HRT-319 makes the four groups
the rail and their items the column. It is the navigation we already have, re-expressed:
`navFor(role)` returns exactly those groups, the phone's four tabs finally agree with the
desktop, a role that cannot see a group simply has no icon for it, and Hearth Stage and a
second church each have somewhere to go when they arrive.

**One rule changes.** HRT-307 carves a narrow exception into "no lede restating the
heading": a screen header may say what the screen is for. Hint text under a field,
reassurance under a banner title, and a sentence that repeats its heading stay banned.

**And one lesson is written into every test section below.** Each of these is checked in a
browser, signed in, before it reaches Resolved. Not a request that follows a redirect: a
press on the actual control. `/members/new` 404ed on a press for days, and three rounds of
reasoning about how the router behaves were wrong until somebody pointed a browser at it.

### HRT-307, how to test it

Phase A builds the piece and changes no screen a church sees, so this is tested in the
gallery at `/design/components`, under "Page header". Three are drawn. Confirm the first
shows a trail above its title, that each step before the last is a link and the last is
not, and that the chevrons sit between them. Confirm the second, which has nothing above
it, draws a title with no trail rather than a trail of one. Confirm the third draws a trail
and a title and nothing else, with no empty row where a lede or an action would go. Check
the three densities and both themes, and at phone width confirm the trail scrolls sideways
with no scrollbar drawn rather than wrapping to three lines.

The screens themselves adopt it in Phase C, one area per story, HRT-321 to HRT-332. It is
not applied to any screen here on purpose: the group record, for one, already draws its
name as a 36px line beside a banner, and rearranging that is HRT-322's work rather than a
change smuggled into the component's own story.

**What the survey undercounted.** The plan said three header mechanisms. There are five:
`TopBar` draws an h1 in the chrome, `PageTitle` draws another on the page, `SettingsHeading`
draws an h2 with its own lede and hairline, `BackLink` carries the way out of a record on
its action row, and several records name themselves in their own content with a `div` rather
than a heading, so the group record has no `h1` at all. `PageMeta` is a sixth if a line of
data under the chrome counts. Phase C replaces all of them.

### HRT-308, how to test it

Phase A, so this is tested in the gallery at `/design/components`, under "Table". The
screens adopt it in Phase C, HRT-321 to HRT-332.

Press the Person heading and confirm the rows reverse and the arrow turns over. Confirm the
Household heading carries a grey mark pointing both ways, because it can be sorted and is
not. Confirm one row starts ticked and the heading's tick shows a dash rather than a tick,
then press the heading's tick and confirm it takes the whole page and the count says three.
Press "Filter everything out" and confirm the headings stay standing and the line saying
nothing matched sits inside the table across all its columns, rather than the screen being
replaced. Check both themes and the three densities, where the row height should change and
the heading should not wrap.

**What was found.** There was not one `aria-sort` in the product, so none of the sixteen
tables of a church's own records could be sorted at all: they were read in whatever order
the query returned. Sorting is a link rather than a press wherever the caller can give one,
so the sorted view lives in the address and can be sent to somebody; `onSort` is there only
for a table whose rows never leave the browser.

**Not done here.** Column resizing. `ResizableTable` in `apps/web/components` already solves
it and the plan has it moving into the design system, but moving it is only worth doing
against a screen that uses it, so it rides with HRT-321.

### HRT-309, how to test it

Open Members and confirm the live and archived tabs carry their counts, that the counts are
the filtered counts rather than the totals, and that they do not shift the tab width as they
change. Confirm the same control is used by groups, by the form builder's two views, by the
plan's service strip and by the report window, and that all five look alike and answer the
keyboard the same way.

### HRT-310, how to test it

Open Members and set the page size to 10, then 50. Confirm the choice is in the address, so
a reload keeps it and the address can be sent. Confirm the footer reads how many are shown
and how many there are. Go to the last page, raise the page size, and confirm you land on a
page that exists rather than an empty one. Check Giving, which shows three paginated tables
on one screen, and confirm each pages independently.

### HRT-311, how to test it

Find a record edited minutes ago, one from last week, one from three months ago and one from
two years ago. Confirm each reads in the largest unit that makes sense and that none of them
says "304 days ago". Confirm the words come from the catalogue rather than the code, and that
the admin portal and the church app now say the same thing the same way. Hover one and
confirm the exact date is in the tooltip.

### HRT-312, how to test it

Give somebody six tags. Confirm the directory shows three chips and a count, that the count
names the rest on hover, and that the chips carry the hue the tag was given. Confirm the tag
editor, the celebrations screen and the follow-up panel draw the same chip, and that the
directory no longer has one of its own.

### HRT-313, how to test it

Open Groups and confirm a group with three leaders shows three faces overlapping, in a
stable order, with the count where there are more than fit. Confirm somebody with no
photograph shows their initials on their hue. Check the roles screen shows the same pile.
Confirm a screen reader reads the names rather than announcing three images.

### HRT-314, how to test it

Open the dashboard and confirm a tile can say a change in people as well as a percentage,
that a rise and a fall read differently without colour being the only difference, and that a
tile with no change to report simply omits it. Confirm the reports, the giving screen and
the campaign screen all draw the same tile, and that the one in the design system is the one
they draw.

### HRT-315, how to test it

Open the design gallery and confirm every chart renders there, in both themes and all three
densities, with its numbers in text as well as in paint. Confirm a gauge reads at a glance
and a sparkline sits inside a tile without an axis. Then open all eight reports and confirm
they look exactly as they did, since nothing about them should change except where the code
lives. Confirm a categorical series keeps its colour between two views of the same data.

### HRT-316, how to test it

Open a member record's history and confirm it reads as it did. Then open the dashboard feed
and confirm it is the same component with different entries. Confirm entries group under a
day heading, that the day headings say today and yesterday in words, and that a confidential
note is still withheld from a role that may not read one.

### HRT-317, how to test it

Open Members and change somebody's status from the row. Confirm the row updates without the
page reloading, that the change is written, and that a failure puts the old value back and
says why. Confirm a role that may not edit people sees the status as a plain pill with no
menu. Confirm the keyboard opens it, moves through it and closes it.

### HRT-318, how to test it

Open a record with a name and nothing else, and one filled in. Confirm each says how complete
it is in the same words and the same place, and that the mark says which it is without colour
alone. Confirm what counts as complete is written down in one place rather than decided on
each screen.

### HRT-319, how to test it

Sign in as an Owner and confirm four icons in the rail, named Overview, People, Gatherings
and Church, with the current one named down its side. Move between them and confirm the
second column changes and the content does not until an item is pressed. Confirm each area
remembers the screen it was last on. Sign in as a group leader and confirm only the areas
with something in them appear. Collapse the second column and confirm the rail stays. Check
both themes, and confirm the check-in station still shows no navigation at all.

### HRT-320, how to test it

At phone width confirm four tabs along the bottom, one per area, in the same order as the
rail. Confirm pressing one opens that area's items as a sheet rather than navigating
somewhere arbitrary. Confirm the active tab matches the active rail icon on the desktop for
the same screen.

### HRT-321, how to test it

Walk every screen under Members: the directory, a record, its edit form, new, duplicates,
celebrations, the mailer and the print sheets. Confirm each has one header, one table, one
paginator and one set of chips, and that nothing in the area draws its own. Confirm the
record window still opens over the list and still closes back to the filtered view.

Open a record and add an email, a phone and an address from the card itself, mark one of
them the main one, and take one off. Press a tag on and off, and name a new one. Each should
land where it was pressed. Reload and confirm all of it held.

Then type each of these addresses in rather than pressing for it: a member, their edit form,
new, celebrations, duplicates, import and the mailer. Each should give the directory with
the window standing over it, which is the same screen pressing for it gives. None of them
should give a screen of its own with a way back to Members at the top.

### HRT-322, how to test it

Open Groups as staff and as a member, and confirm the same screen in two shells now differs
only in what the viewer may do. Walk the list, a group, its edit form and the public finder.
Confirm the leaders show as a face pile and the meeting day and time as chips.

### HRT-323, how to test it

Walk Events: the list, an event, its edit form, the roster and the public pages. Confirm the
registration table is the shared one and pages with the shared paginator. Confirm the list
rows carry the date, the capacity and the status in the same shapes the rest of the product
uses.

### HRT-324, how to test it

Walk Forms: the list, the builder and the responses. Confirm the two-view switch is the
shared segmented control, that the responses table is the shared table, and that the
builder's own chrome is the only thing in the area that stays bespoke.

### HRT-325, how to test it

Open the dashboard and confirm the tiles carry their change, that the charts beside them are
the promoted ones, and that the setup checklist and the tile reordering both still work.
Confirm a church with no data yet sees an empty state rather than a row of zeroes.

### HRT-326, how to test it

Open all eight reports and the catalogue. Confirm the catalogue now looks like the reports
it links to. Confirm every table is the shared one, the window control is the shared
segmented control, and the download menu sits where the header's action sits everywhere
else. Confirm the connected report no longer draws its own table.

### HRT-327, how to test it

Walk all twenty-three settings screens. Confirm each has the shared header with its trail,
that the roles matrix and the accounts grid use the shared table, and that households now
pages. Confirm the section strip still says where you are and that the screens missing an
empty state have one.

### HRT-328, how to test it

Walk follow-ups, the calendar, incidents, the import wizard and the website editor. Confirm
each has the shared header. Confirm the import wizard uses the shared step indicator rather
than its own, and that the calendar and the follow-up board keep their own layouts, since a
week and a kanban are not tables.

### HRT-329, how to test it

Walk Giving: the gifts, the counts, the funds, campaigns, statements and payouts. Confirm
the three tables on the main screen are the shared one and page independently. Confirm the
campaign screen uses the shared tile rather than its own copy. Confirm nothing about what
any of it does has changed.

### HRT-330, how to test it

Open the check-in desk, the floor and the kiosk on a tablet at station density. Confirm
56px targets, 20px text and 7:1 contrast. Confirm no control is an icon alone. Confirm the
allergy banner is still unscrollable and above the fold, that the offline bar is still
persistent chrome, and that there is still no navigation of any kind. Then pull the network
and confirm check-in keeps working.

### HRT-331, how to test it

Open the public group finder, the what's-on, a public form, the giving page and the church's
own door, as somebody signed out. Confirm they share a header and a footer and look like one
product. Then sign in as a member and walk the portal. Confirm the portal and the staff app
now look like the same product at different densities.

### HRT-332, how to test it

Print each of the eleven sheets: the directory, the labels, the letters, the celebrations
cards, the class rosters, the check-in labels, the order of service, the deposit slip, the
statements, the event roster and a report. Confirm one paper style across all of them, that
the church's name and the date are in the same place on each, and that none of them carries
the app's chrome.

### HRT-334, how to test it

Open the directory and confirm the mark before the avatar says which records are incomplete,
and that filtering by it finds them. Open an incomplete record and confirm it names what is
missing rather than only saying that something is. Confirm what counts as complete is the
church's setting and not ours.

### HRT-335, how to test it

Make some changes as one account, then open the dashboard as another and confirm they are
listed, newest first, grouped by day, each naming who did it and linking the record. Confirm
a role that may not read a record does not see it named. Confirm nothing new is written to
the database, since the log already records all of it.

### HRT-336, how to test it

Sign in as a member and confirm the nav no longer offers a link to a screen that does not
exist. Confirm `app/groups/find` and `app/groups/find/[id]` are gone. Confirm every
component left in the tree is rendered by something, or deleted, and that the list of ten
things taken off the person screen is resolved either way.

The redesign that HRT-200 to HRT-208 carry out arrived as prototypes in October 2026. The
reconciliation, the token mapping, what is excluded and why, and the journeys held against what is
built are in [docs/redesign/README.md](docs/redesign/README.md). Giving, songs, the email mockups and
the multi-church overview are drawn in the design and are not being built. CLAUDE.md is the authority
and a design file does not move it.

### F1. Tenancy, roles and administration

| ID | Story | Req | State |
|---|---|---|---|
| HRT-7 | Supabase Postgres, 21 tables, row-level security on every one | R1.3, R21.1 | Closed |
| HRT-8 | Roles with field-level permissions enforced at the query layer | R1.4, R1.5, R21.2 | Closed |
| HRT-9 | Append-only audit log written by database trigger | R1.11, R21.5 | Closed |
| HRT-10 | Adversarial isolation suite, cross-tenant reads and writes on every table | R1.3 | Closed |
| HRT-11 | Sign-in, membership-verified sessions, invitations | R1.7 | Closed |
| HRT-12 | Database hardening: pinned search paths, no PostgREST reachability | R21.3, R21.x | Closed |
| HRT-111 | Campus and location on the record and in the UI where it shows | R1.2 | Closed |
| HRT-77 | Supabase advisors: the storage membership check off the REST API, covering indexes | R21.x | Closed |
| HRT-121 | Backups with point-in-time recovery, and a restore drill run and written down | R21.6 | Closed |
| HRT-122 | The no-training commitment where a church can read it, and nothing in the pipeline that breaks it | R21.12 | Closed |
| HRT-123 | Church-supplied provider credentials encrypted with their own key, never logged, never returned | R21.15 | Closed |
| HRT-306 | Say which pages may be framed, so sign-in cannot be put inside somebody else's page | R21.x | New |
| HRT-13 | TOTP multi-factor, mandatory for Owner, Admin and Finance | R1.8, R21.4 | Deferred to later in 0.1, product surface first |
| HRT-14 | Active session list with remote revoke | R1.10 | Cut |
| HRT-15 | Church profile settings: name, address, timezone, service times | R1.1 | Closed |
| HRT-43 | Brand colour on the member-facing and printed surfaces | R1.1 | Closed |
| HRT-45 | Settings behind the user's own name, with tabs for account, church, tags and fields | R22.x | Closed |
| HRT-109 | Creating an account, and a password somebody can set, change or recover | R1.7, R1.8, R22.1 | Closed |
| HRT-110 | Saved lists, static and rule-based | R1.14 | Closed. The repository and the actions only; nothing rendered a control, so no list could be made. Finished in HRT-255 |
| HRT-255 | The controls that make a saved list, and the ones that read it | R1.14, R2.14 | Closed |
| HRT-256 | Every press that goes to the server says so, on every screen | R24.6 | Closed |
| HRT-257 | The bell rings for all seven kinds, not the two that had writers | R24.6, R4.6, R5.3, R10.5 | Closed |
| HRT-258 | A church picks the colour a kind of group wears | R9.1, R24.4 | Closed |
| HRT-259 | A service that has gone takes nobody new onto its rota | R10.3 | Closed |
| HRT-260 | The member's home screen, the household screen, and which address is read | R17.1, R2.4, R24.4 | Closed |
| HRT-261 | A church's own colour, any colour, with the contrast rebuilt from it | R1.1, R24.4 | Closed |
| HRT-263 | My schedule redrawn, and a calendar that refuses a day already taken | R17.7, R10.4 | Closed |
| HRT-264 | A signed-in member's own details fill their first place at an event | R14.3 | Closed |
| HRT-265 | A member can take back a request to join a group | R9.5 | Closed |
| HRT-266 | A member reads an event and registers without leaving the portal | R14.2, R17.1 | Closed |
| HRT-262 | The household address: a screen that sets it, and the settings menu on a phone | R2.4, R24.6 | Closed |
| HRT-114 | Joining a church: its link and code, and claiming a person record | R1.7, R17.1, R22.1 | Closed |
| HRT-115 | A new church is provisional until a human has looked at it | R1.1, R21.x | Closed |
| HRT-339 | Enable the member portal address after church approval | R1.1, R17.1 | Closed |
| HRT-32 | Create a church and its first Owner from sign-up. A church is a `tenants` row. | R1.1, R22.1 | Closed |
| HRT-16 | Custom field definitions and values, in the UI | R1.12 | Closed |
| HRT-17 | Tag management, assignment, and merge, in the UI | R1.13 | Closed |
| HRT-34 | Tags on households, once households have a page of their own | R1.13 | New |
| HRT-35 | Audit trigger on every tenant table, found by query rather than a list | R1.11 | Closed |
| HRT-18 | Storage quota, enforced at upload, with the church logo as its first user | R1.1, R1.16 | Closed |
| HRT-284 | The church's legal details on its own record: legal name, EIN, registered address | R1.1, R13.1 | Closed |
| HRT-44 | Show usage against the quota, once a church can approach it | R1.16 | Deferred |
| HRT-36 | **Externalise every user-facing string.** | R22.8 | Closed |
| HRT-37 | CI: typecheck, the test suite, and the contrast and accessibility audit | R22.7, N7 | Closed |

### F2. People

| ID | Story | Req | State |
|---|---|---|---|
| HRT-19 | People and households, read-only directory | R2.1, R2.2 | Closed |
| HRT-20 | Notes in two classes, confidential ones encrypted and separately gated | R2.7 | Closed |
| HRT-21 | **Add, edit and archive a person. Households and contact methods.** | R2.1 to R2.3, R2.5, R2.13 | Closed |
| HRT-22 | Relationships, independent of household | R2.4 | Closed |
| HRT-23 | Milestones, with the extensible kind list | R2.6 | Closed |
| HRT-24 | Duplicate merge and review queue, reversible for 30 days | R2.8 | Closed |
| HRT-117 | A merge moves group memberships, pipeline entries and follow-ups | R2.8 | Closed |
| HRT-290 | The review queue is a person and every copy of them, not a list of pairs | R2.8 | Closed |
| HRT-118 | ~~Skills, interests and spiritual gifts as managed vocabularies~~ | R2.9 | **Cut** |
| HRT-210 | The status engine: a nightly pass, the thresholds as settings, and nothing it writes over a human | R2.16 | New |
| HRT-211 | Status history on a person, with who changed it and a one-press revert | R2.17 | New |
| HRT-212 | Staff as its own fact: flag, job title, start date, and a badge | R2.18 | New |
| HRT-119 | Search across names, emails, phones and addresses, under 300ms at 5,000 people | R2.14 | Closed |
| HRT-120 | The person timeline: attendance, groups, notes and milestones in one order | R2.15 | Closed |
| HRT-25 | Bulk edit across a selection: tag, status, archive | R2.12 | Closed |
| HRT-40 | Directory search, filtering, sorting and pagination | R2.1, R2.2 | Closed |
| HRT-42 | Date field and calendar of our own, replacing the browser's | R24.x | Closed |
| HRT-26 | Background check status and expiry tracking | R2.10, R21.11 | Closed |
| HRT-27 | Birthdays and anniversaries list, by month and week | R2.11 | Closed |
| HRT-304 | Refresh the Members list with clear live/archive views and grouped secondary actions | R2.14, R24.6 | Closed |
| HRT-305 | Open member records and the new-member form in a centered, sectioned window over the directory | R2.1, R2.4, R2.15, R24.6 | Resolved |

### HRT-305, how to test it

Open Members from a filtered or saved-list view and select a person. Their record opens in a centered
window above the directory. Confirm Personal details opens first, its fields stay in that section,
and the action toolbar stays at the top right as sections change. Check Address and contact,
Household, Church history, Tags, Groups and Serving teams. Confirm first visit, membership date and
campus sit in Church history. More appears last when the church has custom person fields, and its
fields show in the record. Edit and add a member, then verify the same sections, tags, custom fields
and pinned Save. Save each form and confirm the directory returns to the same filtered or saved-list
view. Test permissions, the unsaved-changes prompt, direct member URLs, and phone width.

This pass is implemented and awaits an authenticated visual check. Keep HRT-305 Active until that
check is complete.

### HRT-304, how to test it

Open Members as an Owner or Admin. Confirm the live and archived views are easy to switch between,
the labels are centered and have no counts, the search and filter controls remain available,
secondary tools are grouped under More, and a duplicate count appears on More when duplicates need
review. Export shows its working state, More comes before Add a member, and Add a member remains
the primary action. Check the list at desktop and phone widths, then open a member from both the
table and the mobile card.

### F19. Data portability

| ID | Story | Req | State |
|---|---|---|---|
| HRT-28 | Import wizard: column mapping, dry run, duplicate handling | R19.1 to R19.3 | Closed |
| HRT-38 | Excel (.xlsx) files, as well as CSV | R19.1 | Closed |
| HRT-29 | Import rollback, reversible for 30 days | R19.4 | Closed |
| HRT-30 | Complete export of every entity, open formats, no gate | R19.8 | Closed |
| HRT-39 | Stream the export instead of building it in memory, once a church outgrows it | R19.8 | New |
| HRT-102 | Planning Center, Breeze and ChurchTrac people and households, their own export formats | R19.5 | Closed |
| HRT-116 | Group membership import, for the same three systems | R19.5, R9.5 | Closed |
| HRT-31 | Sample data set, with its loader and tests | R19.7 | Closed |
| HRT-46 | A demo experience: somewhere to see the product full without signing up | R19.7, R22.1 | Closed |
| HRT-71 | The demo keeps pace with the product: every new owner screen is filled in it | R19.7, R22.1 | Closed |
| HRT-72 | Build the demo church faster than a visitor will wait | R22.1 | Closed |
| HRT-33 | Seed and gallery names to US names, since US churches come first | R19.7 | Closed |
| HRT-282 | The demo, revisited whole: a church standing before a visitor asks for it | R19.7, R22.1 | New |

---

## E2. Services and check-in (0.2)

The first release real churches run. Attendance, check-in, groups and follow-up.

Renamed from "Sunday core". Church is a Tuesday hospital visit and a Thursday small group as much as
a Sunday service, and a release name that says otherwise shapes what gets built.

### F7. Attendance

| ID | Story | Req | State |
|---|---|---|---|
| HRT-47 | Services, repeating or one-off, with cancellation | R7.1 | Closed |
| HRT-68 | Repeats: a frequency and an end date, rather than weekly forever | R7.1 | Closed |
| HRT-69 | A month at a time, rather than every service ever | R7.1 | Closed |
| HRT-70 | Three views of a month: list, calendar grid and tiles | R7.1 | Closed |
| HRT-48 | Headcount-only attendance, with a note per occurrence | R7.2, R7.8 | Closed |
| HRT-49 | Individual attendance from a roster, backdated and corrected | R7.3, R7.7 | Closed |
| HRT-50 | First-time and second-time visitor flagging from attendance history | R7.5 | Closed |
| HRT-51 | Absence detection against a configurable threshold | R7.6 | Closed |
| HRT-52 | Attendance against groups and events | R7.4 | Folded into HRT-85 |
| HRT-53 | Trends: week over week, year over year, rolling average | R7.9 | Moved to HRT-66 |

### F8. Check-in, safety-critical

**No story here starts until its acceptance criteria are written and agreed.** A defect here can
cause physical harm to a child. The design case is 09:58 on a Sunday, forty families queuing, the
wifi down, and a volunteer who has done this twice.

The criteria are written: [docs/checkin-acceptance.md](docs/checkin-acceptance.md). Read them before
starting any story below. They are the definition of done, ahead of anything the story says.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-54 | Kids classes with age ranges, capacity and volunteer ratios | R8.14 to R8.16 | Closed |
| HRT-55 | Station configuration and the four station modes | R8.1, R8.2 | Closed |
| HRT-73 | A screen for the modes a family drives itself, rather than the volunteer's | R8.1, R24.14 | Closed |
| HRT-56 | Family lookup, and several children checked in together | R8.3 to R8.5 | Closed |
| HRT-57 | Matching label pair with a unique per-visit security code | R8.6, R8.11 | Closed |
| HRT-58 | Allergies and medical notes on the label and on screen | R8.10 | Closed |
| HRT-59 | Checkout: the code, the authorised pickup list, the custody block, the override | R8.7 to R8.9 | Closed |
| HRT-74 | The station opens on the service that is actually happening now | R8.2 | Closed |
| HRT-75 | Station search is a directory lookup, by person, on name prefixes | R8.3, R8.4 | Closed |
| HRT-78 | A station is three questions: a name, who drives it, what prints | R8.1, R8.2 | Closed |
| HRT-60 | The station keeps working with no network | R8.20 to R8.24 | Closed |
| HRT-61 | Label printing: Brother QL, Dymo, and plain paper | R8.25, R8.26 | Closed |
| HRT-112 | The bag or stroller label, an optional third print | R8.12 | Closed |
| HRT-62 | Supervisor board and class rosters | R8.18, R8.19 | Closed |
| HRT-63 | Incident reports, restricted and permanently retained | R8.13 | Closed |

### F18. Insights, deferred to 1.0

Everything derived from the record, in one place: attendance trends, who is new, who has stopped
coming, growth and retention.

Two lists were briefly on the Services page and were wrong there twice over: they pushed the day's
work down the screen, and they were unbounded, so a church of two hundred got a wall. The queries
behind them are built and tested, and they sit in `@connectapp/db` until there is a page for them.

**Deferred at release planning, 30 September 2026.** F18 is a 1.0 domain (E5 Reporting). It was
pulled forward to house those two lists, which is a reason to have somewhere to put them, and not a
reason to build a reporting surface before a church can run a Sunday. E2 exists so a church can take
attendance and check children in. Reporting on a record the church cannot yet keep is the wrong
order.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-64 | An Insights page: the shape, the navigation, and what belongs on it | R18.1 | Deferred to 1.0 |
| HRT-65 | Who is new, and who has stopped coming, as bounded lists that link into the directory | R18.4, R7.5, R7.6 | Deferred to 1.0 |
| HRT-66 | Attendance trends: week over week, year over year, rolling four-week average | R18.2, R7.9 | Deferred to 1.0 |
| HRT-67 | Growth and retention, and the first-time-visitor conversion funnel | R18.3 | Deferred to 1.0 |

HRT-65 gives the directory a filter driven by those queries, so Insights links into a list that
already searches, sorts, pages, selects, bulk tags and exports. None of that gets rebuilt when it
comes back.

### F9. Groups and discipleship

Where the church happens between Sundays. The hard part is not the roster, it is getting a leader to
record anything at all, so every leader-facing flow is a phone and under sixty seconds.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-83 | Groups: types, the record, leaders and the roster | R9.1 to R9.4 | Closed |
| HRT-221 | Leaving a group: the member's own way out, and a leader keeping their roster | R9.4, R17.5 | Closed |
| HRT-84 | A leader sees their own group and nothing else | R9.3 | Closed |
| HRT-85 | Group attendance in under sixty seconds on a phone | R9.7, R7.4 | Closed |
| HRT-86 | The group finder, join requests, and a leader approving them | R9.5, R9.6 | Closed |
| HRT-87 | Messaging a group's roster through the church's own provider | R9.8 | New |
| HRT-88 | A picture on a group, with the storage quota behind it | R9.2, R5.3 | Closed |
| HRT-89 | A public group page a church can link to without signing in | R9.5 | Closed |
| HRT-90 | A group's own page: what it is, when it meets, who runs it | R9.2, R9.5 | Closed |
| HRT-91 | One groups screen: the finder is the groups page | R9.1, R9.5 | Closed |
| HRT-92 | The church's own email provider | R16.2 | Dropped |

Two things a church's existing finder does that ours does not yet. **HRT-88:** every group has a
picture, which is most of why a list of forty is readable at a glance. It needs the storage quota
and image transcoding behind it rather than a URL field. **HRT-89:** the finder is behind sign-in,
and a church links to its groups page from its website, so somebody who has never been needs to see
it. Both are real, and both are after the rest of F9.

### F5. Follow-up and assimilation (0.2)

| ID | Story | Req | State |
|---|---|---|---|
| HRT-93 | The six pipelines, their steps, and a person's follow-up | R5.1, R5.2, R5.4, R5.6 | Closed |
| HRT-94 | Entering a pipeline on its own: first visit, second visit, three absences | R5.3 | Closed |
| HRT-97 | Editing the six: names, steps, days, who they land on, off | R5.2 | Closed |
| HRT-95 | My follow-ups: the queue, overdue first | R5.5 | Closed |
| HRT-96 | The board: who is in each pipeline and what is late | R5.7 | Closed |

No workflow engine. Six pipelines, written down, and a configurable builder deferred to 1.x where
the PRD puts it (R5.8). **HRT-97** is the middle ground: a church renames a pipeline, rewrites a
step, changes how many days it gets, says who it lands on, and switches one off. What it cannot do
is invent a seventh or draw a branch. That is the line, and it is the line that keeps this usable. The engine is the single feature that makes Rock RMS unusable by the person
this product is for.

### F3. The member-facing directory (0.2)

| ID | Story | Req | State |
|---|---|---|---|
| HRT-98 | The member directory inside the product | R3.1 | Dropped |
| HRT-99 | Per-field visibility chosen by the member, and whole-record opt out | R3.2, R3.3 | Closed |
| HRT-100 | The printed directory, honouring every setting at generation | R3.5, R3.4 | Closed |
| HRT-101 | The admin view that shows every field, permission gated | R3.6 | Closed, built in F2 |

**Decision, October 2026: there is no directory of the congregation inside the product.** It was
built (HRT-98) and taken out the same day. A search box over everybody's households is a search box
over everybody's households however carefully the fields are gated, and looking the church up is not
something a member does.

What survives is the consent model (HRT-99) and its one reader, the **printed** directory (HRT-100).
A church handing out a book it printed is a different act from a search box, and the fields in that
book are still the member's to decide: the default is their name, a child never appears with contact
details, and anybody can be absent from it entirely.

R3.1 and R3.6 as the PRD writes them are superseded by this. The staff directory (F2) is the only
directory on a screen.

### F21. Safeguarding and minors, deferred to the children's ministry pass

| ID | Story | Req | State |
|---|---|---|---|
| HRT-103 | Minors: no contact details in the member directory, restricted export, consent recorded | R21.10 | Deferred to 0.9 |
| HRT-104 | Safeguarding records retained permanently with access restricted, audited end to end | R21.11 | Deferred to 0.9 |

**HRT-104** is partly built: incident reports are permanent and restricted (HRT-63). What is missing
is background checks (HRT-26) and training records (F10) under the same retention and the same gate,
and a test that walks all three.

**Why these moved.** Check-in already enforces what keeps a child safe on the day: matching label
pairs with a per-visit code, authorised pickup at checkout, allergies on screen and on the label,
incident reports that cannot be edited, and the whole thing working with no network. Those shipped
in 0.2 and are not touched by this. What is deferred is the paperwork around them, which no church
needs before it can run the product. It is gathered into one children's ministry pass (0.9), ahead
of money and after everything else.

### F22. Onboarding (0.2)

| ID | Story | Req | State |
|---|---|---|---|
| HRT-105 | The setup wizard: church, services, roles, import. Resumable and skippable | R22.1 | Closed |
| HRT-108 | Who can get in: the team, invitations, roles | R1.4, R1.7 | Closed |
| HRT-106 | In-context help on every screen | R22.2 | Closed |
| HRT-213 | Regional spelling, from one catalogue, by the church's country | R22.8 | Closed |
| HRT-107 | Time to value under sixty minutes, measured in the product | R22.3 | Closed |
| HRT-283 | What we can tell a church about its own domain before it changes anything | R22.2, R16.x | Closed |
| HRT-285 | A church publishes a configurable public homepage and sends signed-in members to their role's starting page | R1.1, R22.1 | Closed |
| HRT-288 | The address names the church: wildcard DNS, the certificate, and the slug out of the path | R1.1, R17.1 | Closed |
| HRT-292 | Leaving a church, and the one owner who cannot | R1.4 | Closed |
| HRT-293 | Closing an account, and handing a church to somebody else first | R1.4, R21.9 | New |
| HRT-294 | The church's website, asked once at sign-up | R22.1, R22.2 | Closed |
| HRT-295 | The fork at sign-up: does the church have a website | R22.1, R22.2 | Closed |
| HRT-296 | What's on: the church's events, in public and in a frame | R14.2, R9.5 | Closed |
| HRT-289 | Put a piece of ConnectApp on the church's own site, with the steps for the site they built it on | R9.5, R22.2 | Closed |
| HRT-291 | The church's own domain: members.church.org and give.church.org, with the screen to set one up | R1.1, R22.2 | New |
| HRT-367 | The setup guide walks beside the church, on every screen, and says what to press | R22.1, R22.2, R22.3 | Resolved |
| HRT-368 | A church writes down the times it meets | R22.1, R3.1 | Resolved. The premise was wrong: it already can |
| HRT-369 | A check-in dry run before the first service day | R8.x, R22.1 | New |
| HRT-404 | A volunteer's serving frequency has no writer | R10.x | New |
| HRT-405 | The portal's session cookie collides with the product's | R21.1, R1.7 | Resolved |
| HRT-406 | The quarterly restore drill has never been run | R21.6 | New |
| HRT-407 | HRT-283's domain reading was never wired to a screen | R22.2 | New |
| HRT-408 | An opened slot on the schedule never went back to Open | R10.3 | Resolved |
| HRT-409 | Every dialog and panel, opened in a browser | R24.6, R22.7, R20.1 | Resolved |
| HRT-410 | Development's Stripe sandbox had no webhook destination | R13.2, R21.3 | Resolved |
| HRT-411 | The schedule blamed the services when the church had no team | R10.3 | Resolved |
| HRT-412 | A gift over the cap was told to enter an amount | R13.2 | Resolved |
| HRT-413 | The platform says when Stripe has nowhere to report a gift | R13.2, R21.3 | Resolved |
| HRT-414 | A refund made in Stripe's own dashboard never reaches the gift | R13.15, R13.9 | Resolved |
| HRT-415 | The repeating gifts tile did not say the figure was a month | R13.3 | Resolved |
| HRT-416 | demo.connectapp.church, the whole product on invented records | R19.7, R22.1 | Resolved |
| HRT-417 | Every secret on Vercel is write only | R21.3 | Resolved |
| HRT-418 | The connected report's chosen band was unreadable | R22.7, R18.x | Resolved |
| HRT-419 | The editor's markdown cannot write an attribute | R21.2, R16.4 | Resolved |
| HRT-420 | The money and the children's data are not open to any member | R13.1, R8.8, R8.10, R21.2 | Resolved |
| HRT-421 | The two owner-connection paths that crossed the tenant boundary | R1.3, R1.7, R16.8 | Resolved |
| HRT-422 | The export stops handing over the amounts a screen refuses | R19.8, R21.2, R13.11 | Resolved |
| HRT-423 | A name of ours is not a church's to take, and a redirect is checked | R1.1, R1.4, R1.7, R17.1 | Resolved |
| HRT-424 | The platform's own tables, and the privileges a blanket grant undid | R21.1, R21.3 | Resolved |
| HRT-425 | The slug helpers name their tables, so they can pin an empty path | R21.1 | Open |
| HRT-426 | The pickup list is asked even when nobody says who is collecting | R8.8, R8.9 | Resolved, needs a service day |
| HRT-427 | The Resend handshake is bound to the browser that started it | R16.1, R21.15 | Resolved |
| HRT-428 | Smaller boundaries: TLS, constant time, a key's shape, an owner, a thread | R21.15, R10.5, R16.14 | Resolved |
| HRT-429 | A picker is a read of the directory, so it asks the same permission | R3.2, R3.4, R21.2 | Resolved |
| HRT-430 | Secrets out of the audit log, a recorded read, and a child called an adult | R1.11, R6.2, R3.4 | Resolved |
| HRT-431 | A limit on what an unauthenticated caller can make us do | R21.5, R13.2 | Resolved |
| HRT-432 | drizzle-orm to 0.45.x, behind the isolation suite | R21.1 | Open |
| HRT-433 | The development gate applies to the demo host too | R21.3, R19.7 | Resolved |
| HRT-434 | What an operator read, not only what they changed | R1.11, R21.3 | Open |
| HRT-435 | Append-only enforced in the database, not by the absence of a writer | R1.11, R8.x | Open |
| HRT-436 | The station forgets a church when it is signed out of | R8.20, R21.2 | Open |
| HRT-370 | The invitation reaches the person it names | R1.7, R16.4, R22.1 | Resolved |
| HRT-371 | A church can give a role on its first day, and only one it holds | R1.4, R1.6, R1.7 | Resolved |
| HRT-372 | An invitation is ConnectApp's own mail, so it sends on day one | R16.4, R22.1 | Resolved |
| HRT-373 | The invitation email looks like the product it is inviting somebody into | R16.4, R24.x | Resolved |
| HRT-374 | Rooms open on the rooms churches already have | R8.14, R22.1 | Resolved |
| HRT-375 | The guide walks a step's whole errand, screen by screen | R22.1, R22.3 | Resolved |
| HRT-376 | A Stripe account Stripe does not know is said, rather than thrown | R13.1 | Resolved |

R22.1 lists giving and messaging credentials as wizard steps, and both are now built, so both are
steps of the guide. The five-step wizard of 0.2 is replaced by HRT-367.

## E7. Children's ministry, the paperwork pass (0.9)

Everything that keeps a child safe on the day shipped in 0.2: matching label pairs with a per-visit
code, authorised pickup enforced at checkout, allergies on screen and on the label, incident reports
that cannot be edited, and the station working with no network. None of that moves.

What is gathered here is the records around it, which a church can run the product without:
**HRT-103** minors in the printed directory, **HRT-104** retention and the audit that proves it,
**HRT-81** the two-adult-rule alert, **HRT-82** background-check gating on a children's position.
R8.17 belongs here too.

It runs second to last, after 1.0 and before money.

## E3. Money (0.3, built last)

F13 Giving. Stripe Connect at a zero platform fee, batch entry with dual control, IRS Publication
1771 statements, QuickBooks export.

## E4. Service Ops (0.4)

F10 volunteers, then F11 service planning. F12 the song library is deferred.

### F10. Serving and volunteers

A volunteer serves across ministries: the same person runs the sound desk, teaches a class one
week in three, and drives the van. So serving is a person's schedule across the church rather than
a list held by each ministry, and the check-in board reads from it rather than keeping its own.

**A team is not a group.** A group is people who meet: a small group, a class, a committee. A team
is people who serve on a schedule: worship, production, welcome, kids. The difference is what each one
needs. A group needs a roster and a record of whether it met. A team needs positions, a schedule
against specific services, accept and decline, blockout dates, substitutes, and a background check
before anybody is scheduled with children. Building a team as a group with extra columns would mean
a schedule screen pretending to be a roster screen.

Where they meet: a person is on a team and may also be in a group, and both show on their record.
The **Ministry team** group type stays for a church that wants a list of who is on the sound desk
and nothing more. Turning such a group into a team is not built: a church that wants a team makes
one and adds the people, which takes a minute and needs no migration screen.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-79 | Teams, positions, and a person serving across several of them | R10.1, R10.2 | Closed |
| HRT-80 | The schedule plan: by service, blockout dates, how often, and where else somebody is | R10.3 to R10.5 | Closed |
| HRT-124 | Accept and decline from a link, with no sign-in | R10.6 | Closed |
| HRT-125 | ~~Substitute requests: the volunteer asks, the leader confirms~~ | R10.7 | **Cut** |
| HRT-126 | Reminders on publication, a week out and two days out, including the email that carries the answer link | R10.8 | Blocked on a messaging provider (R16.3) |
| HRT-81 | Who is serving in a kids class today, and the two-adult-rule alert on the board | R8.17, R10.12 | Deferred to 0.9 |
| HRT-82 | Background-check gating: no children's position without a valid check | R10.9 | Deferred to 0.9 |

### F11. Service planning

The order of service, which is the document a church actually runs a gathering from. It is one plan
per gathering, because two services on a day are two plans even where the order is the same.

Songs are deferred, so a song item is an item with a title. When F12 comes back, a song item points
at an arrangement and R11.4 lands on top of what is already here.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-127 | The plan: items in order, with types, durations, a running total and the end time | R11.1 to R11.3 | Closed |
| HRT-128 | Notes on an item, and notes addressed to a team or a position | R11.6 | Closed |
| HRT-129 | Attachments on an item: charts, PDFs, audio, images | R11.7 | Closed |
| HRT-130 | Templates, and duplicating last week's plan without its content | R11.8 | Closed |
| HRT-131 | Who serves, inline on the plan, writing through to the schedule | R11.9 | Closed |
| HRT-132 | The printed order of service, full for the team and short for the bulletin | R11.10 | Closed |
| HRT-133 | Live mode: current item, next item, elapsed against planned | R11.11 | Closed |
| HRT-134 | Plan history: who changed what, and when | R11.12 | Closed |
| HRT-135 | Scripture items with the reference, the translation and the resolved text | R11.5 | Blocked on HRT-198, the Bible lookup (R20.3) |
| HRT-136 | Song items carrying an arrangement, its key and its sequence | R11.4 | Deferred with the song library |

## E5. GA (1.0)

F4 Forms, F17 Portal, F6 Pastoral care, F15 Calendar, F14 Events, F18 Reporting, F20 API.

**F16 communication is deferred** and is not to be started again until it is asked for. HRT-87 group
messaging and HRT-126 serving reminders stay waiting on it.

**Anything that takes money is held back to 0.3.** Paid event registration, giving in the portal,
giving reports and the accounting export are listed here under the feature they belong to, each
marked for 0.3, so the shape of the feature is on the board while the money is built last.

### F16. Communication

**Live again, 12 October 2026.** The deferral was lifted by name. Bring your own messaging still
governs every row here: a church supplies its own credentials, we resell nothing, and the shared
email quota stays transactional.

HRT-287 is the way in, and it carries what HRT-137 was for: the connection, proved against the
church's own account before it is written down. Email is now built end to end. A church connects
its own Resend key or its own mail server, writes a message in the composer, and the queue sends
it, retries a soft failure and stops writing to an address that bounced, with a way out on every
send. SMS is the part that is not built: HRT-286 holds the wiring and waits on Twilio.

This paragraph said the opposite until 15 October 2026, which cost a day's reading of the board
and one wrong answer about what a pilot church can do.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-137 | The church's own email provider | R16.1, R21.15 | Folded into HRT-287 |
| HRT-138 | The shared transactional quota | R16.3 | **Removed, deferred** |
| HRT-286 | Connecting the church's own Twilio, and registering its carrier brand for it | R16.4, R16.13 | Wiring built. Blocked on the Twilio subaccount spike, see docs/messaging-architecture.md |
| HRT-287 | Connecting the church's own email, by its own mail server or by Resend | R16.1, R21.15 | Resolved |
| HRT-288 | Resend connects by a press and a yes, and the domain reading moves in with it | R16.1, R21.15, R22.2 | Resolved |
| HRT-289 | Getting the three settings in: the right page, the right words, and one press where it is offered | R16.1, R22.2 | Closed. The template is merged and the nine companies are asked. Vercel answers Domain Connect and 404s our template as of 16 October 2026, so a church there still types the records |
| HRT-290 | A church sends one message to itself, through whatever it connected | R16.1, R21.15 | Resolved |
| HRT-139 | The composer: write one message and send it to everyone, a list or a group | R16.4, R16.6 | Resolved |
| HRT-291 | Email templates a church writes once, kept in settings beside the service templates | R16.4 | Resolved |
| HRT-341 | Send email from the selection: the directory's button opens the composer with those people in it | R16.4, R2.14 | Closed |
| HRT-140 | Targeting a send | R16.5 | **Removed, deferred** |
| HRT-141 | The send queue, the progress on screen, and a send that waits for its hour | R16.6 | Closed |
| HRT-142 | A copy gets another go, and a dead address stops being written to | R16.7 | Closed |
| HRT-143 | Consent and unsubscribe | R16.8 | Resolved. Built with HRT-139, because a first send cannot be given a way out afterwards |
| HRT-144 | The church's own Twilio, and opt-in before any SMS | R16.2, R16.8 | Deferred |
| HRT-145 | Inbound replies into a shared inbox | R16.9 | Deferred |
| HRT-146 | Avery labels and envelopes | R16.12 | Closed. Mail-merge letters are HRT-267 |
| HRT-267 | Mail-merge letters, one page a household | R16.12 | Closed |
| HRT-268 | A mailer is kept, and saves itself as it is written | R16.12 | Closed |
| HRT-269 | In-app messages, and an inbox in the portal and on the platform | R16.9, R17.1 | Closed |
| HRT-271 | An inbox: who a message is for, drafts, and no reloading | R16.9, R17.1 | Closed |
| HRT-270 | Group and team threads, on the same tables | R16.9, R9.7 | Closed |
| HRT-272 | Reactions, and emoji in the message box | R16.9 | Closed |
| HRT-273 | Changing a line and taking one back | R16.9, R2.13 | Closed |
| HRT-274 | Answering one line in particular | R16.9 | Closed |
| HRT-275 | A push when a line arrives, and the office can say yes to one | R16.9, R16.10, R17.11 | Closed |
| HRT-276 | Writing to somebody from their own record, a group's or a team's | R16.9 | Closed |
| HRT-277 | The inbox in the gallery, on the keyboard and read aloud | R16.9, R24.11 | Closed |
| HRT-278 | A tick when a line lands, two when somebody has read it | R16.9 | Closed |
| HRT-280 | A message carries photographs and documents | R16.9, R16.14 | Closed |
| HRT-147 | Birthday and anniversary sends | R16.13 | Deferred |

### F4. Forms

A form is how a church gets data in without typing it. The whole value is R4.4: a submission becomes
a person record or attaches to one, using the duplicate logic already built in F2.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-148 | The builder: every field type, section headers, required fields and validation | R4.1, R4.9 | Closed |
| HRT-209 | The builder rebuilt to the redesign: tiles, inline questions, the preview beside them | R4.1, R24.6 | Closed |
| HRT-149 | Conditional logic, showing and hiding fields on earlier answers | R4.2 | Closed |
| HRT-150 | The public link and the snippet a church pastes into its own site | R4.3 | Closed |
| HRT-151 | A submission matching a person or creating one, writing custom field answers through | R4.4 | Closed |
| HRT-152 | An uncertain match writes its own record and says so, rather than a queue | R4.5 | Closed |
| HRT-216 | File questions on a form: how many, what kind, and a public upload path | R4.1 | Closed |
| HRT-217 | Every email, phone and address on a person, with which one leads | R2.4 | Closed |
| HRT-153 | Notification on submit, and a submission starting a pipeline | R4.6, R4.7 | New |
| HRT-154 | The prebuilt forms: connection card, prayer request, membership interest, volunteer application, child information, facility use | R4.8 | Closed |

### F17. Member and volunteer portal

The portal is the PWA a member installs. It is the same data behind a different door, so almost
every story here is a view over something already built.

**Where it stands.** The portal has its own frame: the church's mark and name across a 64px bar, the
tabs Home, Events, Groups, Serving and My household, the account on the right, and the church's
contact line at the foot. Home leads with the serving request waiting on them, then their dates,
what the church has on, their groups and their household. Serving carries the schedule, accept and
decline, and blackout dates on a calendar. Groups opens on the kinds, then a list, then a group they
can ask to join or leave. My household holds the people and the directory switches.

**Following a published group in.** A stranger reading a group on the church's website presses Join
and ends up in it: one address creates the account where they have none, puts them in the church
through the church's own join code, and asks the group's leader. It asks rather than adds, because
R9.6 gives a leader the say over who is in their group. The redesign's journey draws it as added
straight away; the requirement is the one that holds.

**On HRT-156.** The portal is installable and holds an offline shell: a manifest a church at a
time, so the icon on a phone carries the church's name and opens on that member's own screen, and a
network-first worker that answers from its cache when there is no signal.

Push is built and does not break the messaging deferral. A web push goes to the browser's own push
service, free, with no credential belonging to the church involved, so there is no send queue, no
composer, and nothing being resold. It carries the lines the bell already carries. One trigger is
wired, the one a member actually waits on: being put on the schedule. Turn it on from the account menu.
With no VAPID pair in the environment the product runs with no push at all and members read the
bell, which is a working church.

**HRT-161 is cut.** A form is something a church puts on its own website for whoever reads it, and
the public link already does that for everybody including members. A second way in, behind a
sign-in, is a second place to keep the same form working. R17.9 and R17.10 come back only if a
church asks for them, and R17.10 would need HRT-166 first, since a form submission carries no
privacy level a wall could read.

Their own record is edited on Profile, reached from the account menu, in the portal's frame. The
form was already there and was being read through the app's sidebar, which is a screen a member has
no business in.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-155 | Magic link sign-in, with a password as an option | R17.1 | Closed |
| HRT-156 | The installable PWA: offline shell, push notifications, and what a push is sent for | R17.11, R16.10 | Closed |
| HRT-157 | Profile and household self-service, honouring the privacy settings | R17.2, R17.3 | Closed |
| HRT-158 | My serving schedule, with accept, decline and blockout dates | R17.7 | Closed |
| HRT-159 | Browse groups, ask to join, see my groups | R17.5 | Closed |
| HRT-160 | Check my children in from my phone, generating the codes the station prints | R17.8 | Closed |
| HRT-161 | Submit a form or a prayer request, and the prayer wall for the ones marked public | R17.9, R17.10 | Cut |
| HRT-162 | The announcement feed | R16.11 | Closed |
| HRT-163 | Give, see my giving, manage a recurring gift, download a statement | R17.4 | Closed as HRT-239, HRT-243 and HRT-244 |

### F6. Pastoral care

The confidential tier is the point. A pastoral note is not an admin note, and R6.2 says every read
is recorded, which the notes table already does.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-164 | The care log: dated interactions, type, participants, summary, follow-up date | R6.1 | New |
| HRT-165 | Confidential counselling notes on their own permission tier, every read audited | R6.2 | New |
| HRT-166 | Prayer requests, member submitted or staff entered, with privacy levels | R6.3 | New |
| HRT-167 | Hospital and home visits, with admission and discharge, and a visit roster | R6.4 | New |
| HRT-168 | Care teams, assignment, and who is carrying how much | R6.5 | New |
| HRT-169 | Benevolence requests, reportable in aggregate without naming anybody | R6.6 | New |
| HRT-170 | A follow-up set from a care interaction, surfacing in the same queue as the rest | R6.7 | New |

### F15. Calendar and facilities

| ID | Story | Req | State |
|---|---|---|---|
| HRT-171 | The master calendar: services, events, group meetings and bookings in one view | R15.1 | New |
| HRT-172 | The public calendar and its subscription feed | R15.2, R20.5 | New |
| HRT-173 | Rooms, resources and equipment, with capacity and attributes | R15.4 | New |
| HRT-174 | Booking with conflict detection, including setup and teardown buffers | R15.5 | New |
| HRT-175 | Facility use requests: the approval step, and what an outside group has to supply | R15.6, R15.7 | New |
| HRT-176 | Printed monthly and weekly calendars, and the room schedule for the building | R15.8 | New |

### F14. Events and registrations

| ID | Story | Req | State |
|---|---|---|---|
| HRT-177 | The event record and the public event page | R14.1, R14.2 | Closed |
| HRT-178 | Free registration, capacity, and a waitlist that promotes when a place frees | R14.4 | Closed |
| HRT-179 | Custom questions per registrant, reusing the form logic | R14.5 | Closed |
| HRT-180 | Family registration in one flow, several household members and one submission | R14.6 | Closed |
| HRT-181 | Recurring events and event series | R14.9 | New |
| HRT-182 | Event check-in through the same station, with badges and rosters | R14.10 | New |
| HRT-183 | Attendee export, printed roster, and the emergency contact sheet | R14.12 | Closed |
| HRT-214 | Readable addresses for events, groups and forms, with ids still resolving | R24.6 | Closed |
| HRT-215 | Groups are drafted then published, with a preview of the public page | R9.5 | Closed |
| HRT-184 | Paid registration, add-ons, discount codes and refunds | R14.3, R14.7, R14.8, R14.11 | Held to 0.3 with money |

### F18. Reporting and analytics

No custom report builder, ever. Around twenty canned reports that answer the questions a small
church actually asks.

| ID | Story | Req | State |
|---|---|---|---|
| HRT-185 | The dashboard: attendance, new people, coverage gaps, overdue follow-ups | R18.1 | Closed |
| HRT-186 | Attendance reports: trend, year over year, by service, by demographic | R18.2 | Closed |
| HRT-187 | The first-time visitor funnel, with conversion rates and elapsed time at each step | R18.3 | Closed |
| HRT-188 | Growth and retention: new, returning, lapsed, net change by month | R18.4 | Closed |
| HRT-189 | Group participation and group health | R18.6 | Closed |
| HRT-190 | Volunteer coverage, serving frequency, and expiring checks and certifications | R18.7 | Closed |
| HRT-191 | Milestone and demographic lists | R18.8 | Closed |
| HRT-192 | The connectedness indicator: four booleans and a count | R18.9 | Closed |
| HRT-193 | CSV and PDF on every report | R18.10 | Closed |
| HRT-194 | Giving reports: by fund, by period, lapsed donors, first-time givers, pledge progress | R18.5 | Held to 0.3 with money |
| HRT-218 | Build a report: a fixed catalogue of subjects and fields, counted, saved and kept | R18.12 | Closed |
| HRT-219 | Members, not people: the word on screen, in the address and in the schema | R2.x, R24.6 | Closed |
| HRT-281 | What the rename and the new tables left behind: two triggers, two policies, a missing export | R1.11, R19.5, R21.1 | Closed |
| HRT-220 | The builder as a fields panel, shelves, a gallery and a drawn canvas | R18.12 | Closed |
| HRT-279 | A saved report belongs to whoever built it, until the church shares it | R18.12, R1.5 | Closed |

**On HRT-193.** A built report exports to CSV, to PowerPoint and to PDF. The PDF is the print view
the browser saves, which is how the directory, the run sheet and the room rosters already produce
one. The deck is built with `pptxgenjs` and carries real PowerPoint charts rather than pictures of
them, so the numbers are still numbers when a treasurer opens it. The three built-in reports have the
same menu now: `apps/web/app/reports/sheets.ts` is the one place each of them is read, and the
spreadsheet, the sheet of paper and the deck are three renderings of it. Giving is in the sheet too,
and `mayRead` asks the question each report's own permission answers, so a giving file is refused
without the permission to read amounts while the rest ask only to be allowed to read reports.

**On HRT-218 and the report builder.** A custom report builder is a non-goal in PRD section 18, and
it is named there as one of the things that make Rock RMS unusable for a church with one volunteer.
It was asked for by name, so it is built, and what holds the line is the shape of it. A church picks
a subject from three, a field from a list of about a dozen, and an operator that comes from the kind
of field. There is no table picker, no join, no expression box. Every key is checked against the
catalogue in `packages/db/src/repo/report-spec.ts` on the way into the database and again on the way
out, so nothing a church types ever reaches a query as SQL. Allergies, medical notes and pastoral
notes are deliberately absent from the catalogue: they are readable on the person and at check-in by
the people who need them, and an ad-hoc report that can list every child's medical note is a
safeguarding problem waiting to be exported to a laptop. Adding a subject means adding a row to that
catalogue and an expression to the compiler beside it.

### F20. Integrations and API

| ID | Story | Req | State |
|---|---|---|---|
| HRT-195 | Scoped API keys, rate limits, and a record of what each key did | R20.1, R1.13 | New |
| HRT-196 | The REST API over people, households, groups, attendance, events and plans | R20.1 | New |
| HRT-197 | Outbound webhooks on the events worth hearing about | R20.2 | New |
| HRT-198 | Bible lookup for scripture in plans, with translations. Unblocks HRT-135 | R20.3 | New |
| HRT-199 | QuickBooks and generic accounting CSV export | R20.4 | Held to 0.3 with money |

## E6. Hearth Stage (P2)

The presenter, specified in [PRD-STAGE.md](PRD-STAGE.md) and tracked on its own board,
[BACKLOG-STAGE.md](BACKLOG-STAGE.md), with `STG-n` story IDs. It is built in parallel and has its own
Active story.

**Stage runs standalone**, with its own song library and its own importers, so the first three Stage
releases need nothing from this board. One Stage release, S0.4, pairs with the platform and closes the
loop from plan to stage to attendance.

**That pairing is deferred.** The sync contract in
[docs/stage-sync-contract.md](docs/stage-sync-contract.md) still describes what the platform would
owe Stage: the song schema (R12.x), plans readable as data (R11.14), `change_seq` on every synced
table, the Stage device principal with pairing and revoke, the routes under `/api/stage/v1`, and the
idempotent `song_usage` insert. None of it is scheduled, and none of it gets a story until somebody
asks. See the note below.

**One correction is owed here.** PRD.md section 9.6 says Stage is "a client of a versioned sync API,
not a second application with a second database". Stage holds a library of its own, so that line needs
replacing. The wording is in PRD-STAGE.md section 2.

---

## R10.7 was cut, October 2026

The substitute request was a second way of saying what a decline already says. Somebody who cannot
make it presses no; the slot empties and the leader sees it on the schedule plan. Filling it is the
same picker that filled it the first time, carrying the same away and served-recently warnings.

What the separate object added was a volunteer-facing button nobody liked and a leader-facing inbox
that duplicated the plan. The table, the repository and both screens are gone.

## Songs and the Stage contract are deferred, October 2026

Hearth Stage is being built in its own repo, with its own song library and its own importers. So
this board owes it nothing: not the song schema (R12.x), not `/api/stage/v1`, not the `song_usage`
insert, not `packages/songs`. F12 has no stories and gets none until somebody asks for them.

0.4 is serving and service planning. A plan item that would have been a song is a plan item with a
title, which is what a church without a library has anyway.

The shape in PRD section 9.4 still stands for whenever songs return: lyrics as ordered labeled
sections, arrangement sequences as data, translations section-aligned.

## R2.9 was cut, October 2026

Skills, interests and spiritual gifts were built as three managed lists and taken out the same day.

A church management system holds what a church needs to run: who is here, who is in a group, who is
checked in, what has been given. A record of what every member is good at and what they feel called
to is a different kind of thing to hold about somebody, and holding it is not worth what it costs
them. It was also one more set of lists for a volunteer to maintain for a question most churches ask
by asking a person.

The requirement stays in the PRD marked cut, like R3.1. If serving in 0.4 needs to know who can do
something, a team records its own requirements against its own positions, which is a smaller claim
about a smaller number of people who volunteered for it.

## How somebody gets an account, decided October 2026

Sign-up sent everybody to create a church. A member arriving because their church asked them to was
offered a form for starting a church of their own, and `people.app_user_id`, the field that ties an
account to a record, was written by nothing in the product.

The order is church, then people, then accounts. A church is created first. People are records the
church makes, by import, by a form, at a check-in desk or by hand. An account **claims** one of those
records, and the proof is an address the church already wrote down. This is what Planning Center,
Breeze and Church Center all do, for the same reason: nobody lets a stranger into a congregation's
directory.

Three ways in.

| Door | Who | What happens |
|---|---|---|
| Invitation | Staff, leaders, and any member the church invites | Exists (HRT-108). The invitation now carries the person record, so accepting links the account to it. |
| The church's join link or code | A member the church pointed at it | The code is the gate. They sign up and they are a member. Their address is matched against the contacts on the church's records: a match claims that record, and anything else gets a visitor record written on arrival. |
| Creating a church | A pastor or administrator starting out | The church is created immediately and is provisional until a human has looked at it (HRT-115). |

A child's record is never claimable, and neither is one somebody else already holds. Both get a new
record instead, which the church merges (R2.8) if it turns out to be the same person.

An approval queue was built and taken out again on the same day. It put a task on a volunteer every
time a regular signed up, for a door the church had already chosen to open by handing out the code.

**Provisional** means the church works for the person who made it, capped: a small number of people,
no join link, no invitations, no outbound email. A real church is unblocked in an hour, which is what
the sixty-minute time-to-value metric needs. An abuser gets nothing worth having.

---

## The address a congregation types, October 2026

Members reach ConnectApp at `<name>.connectapp.church`. The church picks the
name, we own the domain and hold the certificate, and nothing is asked of the
church's own DNS. The name is checked against every chosen name and every slug,
because a name that shadowed another church's slug would take that church's
address away from it. The slug answers from the day a church signs up, so every
church has an address before it picks one.

Built and tested. **HRT-288** closed the last of it in October 2026, and that
part was not code. The domain is registered through Vercel and the project
holds both `connectapp.church` and `*.connectapp.church`, so the wildcard
record and the wildcard certificate are one setting rather than a step per
church. Proved against a subdomain that has never existed: it serves a
certificate issued for `*.connectapp.church` with no warning.

The deploy is `apps/web` alone. `vercel.json` builds from the repo root,
because the app depends on three workspace packages and a root directory of
`apps/web` would install none of them. `PLATFORM_HOST` and
`AUTH_COOKIE_DOMAIN` are what make a church's address and ours one session,
and neither can be exercised on localhost, where a cookie is host-only in both
directions whatever is set.

The slug came out of the public paths in October 2026. On a church's own
address `/give`, `/g`, `/g/<group>`, `/join` and `/give/thanks` answer, and the
longer forms that carry the slug go on working and redirect to them, because a
church has printed them on cards and put them on its own website. One route
means two things: `/g/<one segment>` is a group on a church's address and a
church on ours, decided by the host before the segment is read.

What a church is handed to print, the giving address and the QR code, is built
from the short form through one helper, so a card and a copied link cannot
disagree.

`?church=` came off every link and every screen in October 2026. It was how the
product named a church before churches had addresses, and it had reached 282
links across 148 screens. The church now comes from the host where one names it,
and from the chooser's record where our own host serves it. The record is a
cookie, which selects: the membership is still verified against `tenant_members`
on every request, so a cookie somebody edits by hand opens the chooser.

Signing in sends the reader to the church's own address. The session cookie is
written on the parent of every church's name, `AUTH_COOKIE_DOMAIN`, so it is
already there when they arrive.

On `localhost` it is not, and cannot be: a browser refuses a domain cookie on a
single-label host, so a cookie on `localhost` is never sent to
`riverside.localhost`. Signing in from `localhost:4488` therefore asks for a
password again on the church's address. Decided October 2026 to leave it: sign
in at the church's address when testing locally. Do not change the development
hostname to work around this.

It comes back when a church points its own domain at us (R1.1 `custom_domain`),
because `members.onefamily.org` can never share a cookie with us whatever we
set. That needs the session handed over explicitly rather than shared, and it
is not built.

The church's own domain (R1.1 `custom_domain`) still resolves in the data
layer and has no screen. It was on the Website page and was the cause of a long
afternoon: two cards both saying where members sign in. It comes back when a
church asks for it.

## One address in use, October 2026

A church answers at its slug from the day it signs up, and went on answering
there after picking a name of its own. Two live addresses for one church is two
links to hand out, two things in a search engine, and a card that can only show
one of them.

The slug now sends people on to the chosen name, keeping the path and the
query, so a link printed in a news sheet last year still lands in the right
place. Taking a name also moves the tab to it, because staying put left
somebody reading a name in the address bar they had just replaced.

## One person, however many copies of them, October 2026

HRT-290. The review queue was pairs, and the work is not pairs. A church that
took the same family's connection card at five services has five records of one
person, and five records make ten pairs. Ten decisions for one decision, and
merging any one of them took four other pairs off the list, so the count jumped
about while somebody worked through it.

The pairs are joined up before the screen sees them: two records that match are
the same person, and a third matching either belongs with both. Two records
still get the field-by-field read, because with two there is a column each and a
choice to make per row. Three or more is one decision, which record survives,
with any that turn out to be somebody else dropped out of the group first.

Each merge is still written down on its own, so a church that changes its mind
about one of the five puts that one back without unpicking the rest.

## Putting a piece of ConnectApp on a church's own site, October 2026

HRT-289. The Website screen hands out one snippet, for the group finder, and
leaves the church to work out where it goes. What it should be:

- **A list of the parts that can be embedded**, and the church picks. The group
  finder, giving, a form and an event page: all four are public already and all
  four are what a church wants on its own site.

  Two of them frame and two need care. The finder and a form have no session
  and frame fine. Signing in cannot ever be framed, because a session inside
  somebody else's page is a third-party cookie and Safari and Chrome both
  refuse those, so a framed sign-in works until it silently does not. Giving
  sits between them: the page itself has no session, but it holds Stripe's own
  embedded checkout, and whether that survives being nested one frame deeper
  has to be tried before it is offered.
- **The snippet for whichever it picked**, with what it is called on the page
  rather than what the route is.
- **The steps for the site they actually built it on.** Adding an embed is a
  different few presses at Wix, Squarespace, WordPress and Weebly, and "paste
  this into your website" is the instruction a volunteer gets stuck on.

Built in October 2026: giving as a button and the group finder as a frame, on
the Website screen, both on the short address through `publicLink`, so a
snippet and the route it points at cannot disagree.

Giving is a button rather than a frame, and that settles the question the
paragraph above left open. The giving page carries Stripe's own checkout, and
nesting a payment frame inside ours inside the church's page is three deep
before anybody has typed a card number. It is also what a church asks for: a
Give button on the home page, not a donation form halfway down it. Nothing had
to be tried, because the frame was the wrong shape for it either way.

A form and an event hand out their own snippet from their own screen, which is
where somebody is standing when they decide to embed that one. The Website
screen carries only what is church-wide.

`/g/embed` answers on a church's own address, a static segment beside
`/g/[slug]`, so a group named "embed" is unreachable at the short path. The
same trade `/e/[slug]/register` already carries.

The steps followed in October 2026. The church picks where its site is built,
from eight builders and "something else", and the snippet comes with the few
presses that put it on a page there. The answer is kept on the church's
record, so the next screen that needs it does not ask again.

The nameservers offer a guess, and only sometimes: `wixdns.net` and
`squarespacedns.com` name a builder outright, and `domaincontrol.com`, which
is the common case, names nothing at all. So it is a guess the church
confirms rather than an answer, and the reading only runs for a church that
has a website and has not already said.

Which means capturing the **site builder**, which is not always the DNS
provider: a church can buy the name at GoDaddy and build the site on Squarespace.
The nameservers say the second one often enough to offer a guess (`wixdns.net`
is Wix, `squarespacedns.com` is Squarespace) and the church confirms it. The
reading in HRT-283 already names the provider, so the guess costs nothing.

The account link came off this screen: the church's own address is the sign-in
and the sign-up both, so a second link to the same place was a second answer to
one question.

## Which pages may be framed, October 2026

HRT-306. Embedding is a feature here: HRT-289 hands a church an `<iframe>` for
its group finder, its events and its giving link, and those pages are meant to
sit inside the church's own site. Nothing says so, though. The app sends no
`frame-ancestors` and no `X-Frame-Options`, so **every** page can be framed,
sign-in included, and a page that frames our sign-in over its own chrome gets a
volunteer typing a password into what looks like somebody else's site.

The two rules the product already implies:

- The embeddable pages (`/g/embed`, `/e/embed`, the public group and event
  pages) may be framed by anyone, because that is what they are for.
- Everything else may be framed by nobody. Sign-in, the member portal and every
  staff screen set `frame-ancestors 'none'`.

So this is one CSP header with two cases, decided by path, plus a test that
walks the routes and fails when a new page lands in neither case. It is small,
and it is the kind of small that does not get done until it has a row.

## The church's own domain, October 2026

HRT-291. A church asks for `church.org/give`, and the answer has to start by
saying what DNS can and cannot do, because the obvious route to it does not
exist.

**DNS maps a hostname, never a path.** There is no record that sends
`church.org/give` to us and leaves the rest of `church.org` on the church's own
website. So `church.org/give` happens one of two ways: the church builds that
page on its own site and embeds ours inside it, which is HRT-289, or it is not
that address at all but `give.church.org`, which is one CNAME and which a
church can do.

What is already built, from HRT-283:

- `resolveTenantByHost` resolves a church by `custom_domain`, so the moment a
  domain is on the record it answers.
- The reading: MX, SPF, DMARC and nameservers at the apex, the CNAME at the
  name being asked about, the mail provider and the registrar by name across
  twenty-one consoles, and the records we would add.
- `isApex`, because telling a church to CNAME its apex is advice every provider
  refuses and which would take down its website and its Google Workspace mail.
  `suggestSubdomain` offers `members.church.org` instead.

The screen arrived in October 2026, at `/settings/domain`, its own entry
after Website rather than a second card on it: two cards both saying where
members sign in was what caused the long afternoon the first time. It reads
live on every load, because a church changes its email provider and a reading
kept from sign-up would then describe a domain that no longer exists.

It shows what is there and stops. `DomainReading` takes `plan={false}`, so the
records we would add are not drawn: they are for sending mail as the church,
nothing in the product sends mail, and a church reading a list of changes we
would make is a church being offered something it cannot have. The plan comes
back with HRT-287.

What is left:
- **The certificate.** A name we do not own needs one issued per church on
  demand, which is a different piece of work from the wildcard on our own
  domain and the reason this is not simply the same feature twice.
- **Proving it.** A church pointing a name at us before we can serve it gets a
  warning page, so the record has to be seen before the address is turned on.
- **The session.** `members.church.org` can never share a cookie with
  `connectapp.church`, whatever we set, so this needs the session handed over
  explicitly rather than shared. That is the same piece of work the localhost
  note above describes, and this is what makes it necessary rather than
  convenient.

## The church's website, asked once, October 2026

HRT-294. Sign-up asked a church for its name, its country and its timezone,
and nothing about what it is already on. So every screen downstream that
needed to know had to ask again, and HRT-283's reading of a church's domain,
built in September, had nowhere to be triggered from.

It is one field on `create-church`, optional, stored as the bare domain.
`cleanWebsite` does that in one place, so what sign-up writes and what the
Website settings screen writes are the same shape. Before this, settings would
have stored `https://www.church.org/` and sign-up `church.org`, which is one
column holding two spellings of one church.

HRT-295 then made it a fork. "Does your church have a website?" is asked
outright, the address is asked for only when the answer is yes, and a yes with
no address is refused, because the address is the whole of what the answer is
for.

`has_website` is a nullable boolean rather than an empty `website` column,
because a church that said no and a church nobody asked lead different ways:
one is owed a page of ours, the other is owed the question. Every church that
signed up before this holds null, and answering for them would offer a page to
churches that already have a site.

Only Path A has a destination. A church that says no is recorded, and after
approval the Website editor can publish its homepage. Sign-up records the
answer without promising publication before approval.

## What's on, in public, October 2026

HRT-296. A church could publish an event and hand out its address, and that
was all: there was no page saying what was coming up, so a church's own site
could link to one event at a time and nothing else. Groups had that page from
the start.

`/e` on a church's own address, the same screen as `/g`, with `/e/embed` for
the frame. Only what is still ahead, decided by the church's own date, so an
event running today is still listed at eleven at night three timezones away.

`/e/<one segment>` now carries two meanings decided by the host: an event on
the church's address, the church's what's-on page on ours. The host is read
before the segment, so the two can never collide. The same shape `/g/[slug]`
has carried since the slug came out of the public paths.

It is the fourth choice in the embedding flow.

## Leaving a church, and closing an account, October 2026

HRT-292. A member could be written into a church's records and never get out
again. There was no `leaveChurch`, nothing in settings, and the only way out
was an administrator taking the access away.

It is on the profile screen, in the card that already names the church and the
role, because that is where somebody reads which church they are in. The write
is the one an administrator already makes, with the same guard: the record the
church holds is left alone, and only the access ends. They come off every list.
Their record stays.

The one person who cannot leave is the last owner. A church with no owner is a
church nobody can administer, and the members it belongs to cannot fix it
themselves, so the button is dark and says what to do instead. That is the same
rule `setMemberRole` and `removeMember` already enforced, read out loud on the
screen rather than thrown at a press.

What found it: the door at `/join` ran the join on mount. Opening a church's
address while signed in to another church wrote a membership and a visitor
record with nothing pressed. Fixed in the same pass; joining is a press.

HRT-293. Closing an account is the question underneath, and it is not the same
question. GitHub's shape is the right one to borrow:

- **An account is not a church.** Closing one is about the person. The churches
  they belong to carry on.
- **A church with one owner blocks the close**, the way an organization does.
  The owner transfers it or ends it, and the screen says which churches are in
  the way before anything is confirmed.
- **Transfer is its own act**, to a named person who already has access, and
  both sides are told.
- **Ending a church is not deleting its data.** R21.9 retention and the DSAR
  path decide what actually goes, and the export has to be offered first,
  because a church that cannot get its records out is a church we have locked
  in.

Settled, October 2026:

- **Closing a church outright goes through us.** The product does not offer a
  button for it. A church that wants to end asks the ConnectApp team, which
  makes it a conversation with a person rather than a press somebody regrets
  on a Friday night. A member leaving and an owner closing their own account
  are still self-serve.
- **Records are held for a year** after a church ends, and the export is
  offered before anything is held rather than after.
- **Giving history is held for a year** on the same clock, because a treasurer
  needs January's statements whatever the church decided in August.

- **Asking is the whole of it.** Somebody writes to us and we take it from
  there. Nothing to prove on a form, nothing to upload.
- **A church whose only owner has gone** is the same path. Only an owner can
  make another owner, so when the one owner leaves, dies or stops answering
  email, the church is locked out of its own records and no screen it can
  reach will fix that. It is a conversation with us, like closing.

- **support@connectapp.church** is where somebody writes, for both.
- **We act in the admin portal**, which already exists for the platform's own
  work. Ending a church is a platform act rather than a church one, which is
  the whole reason the product has no button for it.

## Where the domain reading belongs, October 2026

HRT-283 reads a church's domain and names the mail provider, the domain
provider, the sender list and the forgery policy. It was put on the Website
screen beside the church's own member address, and that was wrong: the member
address is a name under the domain pointed at us with a CNAME, and the reading
is about the domain itself and about sending mail as the church. Two jobs on
one card, and neither read.

The reading is off that screen. Where it belongs:

- **At sign-up (R22.1).** A church gives its website, we read it once and keep
  what we found. Everything after prefills from it, and it is what tells us
  whether a provider's records can be written for them or have to be typed.
- **On the email setup screen (HRT-287).** What we would add, what stays
  untouched, and whether the domain has verified.

Neither screen exists. The reading, its tests and the provider consoles stay
where they are until one does.

## Setting a church up with its own providers, October 2026

A narrative of one church's first hour, an architecture sketch and a sending-domain blueprint were
put to the project. The reading is in [docs/onboarding-integrations.md](docs/onboarding-integrations.md).
HRT-283 through HRT-287 come from it and all five are New, pending a call on scope.

What it settles for now:

- **The position is sound.** The church owns every account and pays every bill, and we carry the
  forms. That sits inside the bring-your-own-credentials rule.
- **Act 2 is already a story.** HRT-251 (Stripe Accounts v2) is the in-product onboarding the
  narrative describes.
- **No Entri in v1.** $249 a month against a step each church performs once.
- **A curated homepage editor.** HRT-285 provides a dedicated, permission-gated Website area with
  designed layouts and structured content for one page. Church facts and service times come from
  existing records; photos and short clips can be uploaded, and secure media links are supported.
  Sections can link to a secure external address or a public ConnectApp form, group, or event.
  Public pages require approval and publication. Giving links remain deferred.
- **Twilio Connect returns a subaccount, and a Primary Business Profile cannot live on one.** That
  spike runs before HRT-286 is written.
- Messaging stays deferred. HRT-286 and HRT-287 wait with HRT-87, HRT-123 and HRT-126.

## Now

| | |
|---|---|
| **Last built** | **HRT-302**, the landing-page support form and footer links. |
| **0.2 still owed** | Nothing. R2.9 was cut. Safeguarding paperwork moved to the children's ministry pass (0.9). Blocked by later releases: R8.17 the two-adult rule waits on serving (0.4), R9.8 group messaging waits on a provider being set up with the church. R3.1 was cut. |
| **Audit, October 2026** | Every 0.1 and 0.2 requirement checked against the board, twice. The first pass found R1.14 (**HRT-110**, built), R8.12 (**HRT-112**, built), R1.2 (**HRT-111**, in the schema with no screen) and account creation (**HRT-109**, built). The second pass found that one wildcard tag, `R2.x` on HRT-40, was hiding four more: **R2.9**, **R2.11**, **R2.14** and **R2.15**, none of them built. `scripts/check-backlog.mjs` now fails CI when a 0.1 or 0.2 requirement has no story naming it, and a wildcard no longer counts. |
| **Was owed** | R19.5 the three importers and R22.1 to R22.3 onboarding, both built. R21.10 and R21.11 moved to the children's ministry pass. |
| **Waiting on a test** | **HRT-26** background checks, **HRT-62** the class board and rosters, **HRT-63** incident reports, **HRT-83** groups, **HRT-84** the leader scope, **HRT-85** group attendance, **HRT-86** the finder, **HRT-90** a group's page, **HRT-91** one groups screen, **HRT-93** follow-up pipelines, **HRT-94** the triggers, **HRT-95** the queue, **HRT-96** the board, **HRT-97** editing the six, **HRT-99** printed-directory consent, **HRT-100** the printed directory, **HRT-105** the setup wizard, **HRT-106** help, **HRT-107** time to value, **HRT-108** who can get in, **HRT-109** signing up, **HRT-110** saved lists, **HRT-112** the bag label, **HRT-113** the UI sweep, **HRT-114** joining a church, **HRT-119** search, **HRT-120** the person timeline, **HRT-27** birthdays, **HRT-79** teams and positions, **HRT-80** the schedule, **HRT-124** answering a serving request, **HRT-127** the order of service, **HRT-128** notes on an item, **HRT-129** files on an item |
| **Next** | **HRT-218** was asked for by name and is built. A report builder was a PRD non-goal, and the note under F18 says what was built instead and what guards it. Then **HRT-189** group participation, **HRT-190** volunteer coverage and expiring checks, **HRT-191** milestone and demographic lists, and R18.9 the connectedness indicator, which together finish F18. Then HRT-152's sibling **HRT-153** notification on submit. **HRT-202** navigation scoped to the role and **HRT-205** the palette are still owed from the redesign. Still waiting: **HRT-87** and **HRT-123** on messaging, **HRT-34** on households having a page, **HRT-39** on a church outgrowing the export. **HRT-123** is skipped: with messaging deferred there are no church-supplied credentials to encrypt. F16 messaging, finance and the children's paperwork stay deferred until asked for. | **HRT-126** waits on a church having a messaging provider set up, the same as HRT-87. R10.7 was cut. |
| **Order after that** | **1.0**: F4 forms, F17 portal, F6 pastoral care, F15 calendar, F14 events, F18 reporting, F20 API. Then **0.9** the children's ministry paperwork. Then **0.3** money, last, which also releases the stories held back from 1.0. Songs and the Stage contract are deferred until asked for. |
| **Waiting on somebody else** | **HRT-87** group messaging and **HRT-126** serving reminders both wait on a church having a messaging provider set up. **HRT-13** MFA stays deferred. |

### HRT-297, how to test it

Deploy the web app to Vercel, then open the project's Speed Insights dashboard. Visit a few
production pages and confirm page performance measurements begin appearing there.

### HRT-299, how to test it

Open `/design/type` and compare the same headline, staff list row and check-in label under Current,
Source, IBM Plex, Atkinson and System. The platform pages should keep their existing fonts.

### HRT-287, how to test it

Set `PROVIDER_CREDENTIAL_KEY` in `.env.local` to 32 base64 bytes from `openssl rand -base64 32`, and
run `pnpm db:migrate` so migration 0151 and the audit redaction are in place.

As Owner or Admin, open Settings, then Email under Your church. Nothing is connected, so two ways in
are offered. Press Connect your mail server and confirm Connect stays dark until the address, the
server, the port, the username and the password all carry something. Enter a server that will refuse
and confirm the screen shows what that server said rather than a sentence of ours. Enter one that
will accept and confirm the panel closes and the screen reads Sending through that host, with the
address mail goes out as beside it.

Press Disconnect and confirm our own dialog asks first, and that connecting again starts from the
same two choices.

Connect Resend with a real API key and an address on a domain that account can hold. Confirm the
panel says what a key that can create a sending domain can also do, before the press. After
connecting, confirm the three records Resend generated are listed with their names and values, each
copyable, and that the DKIM record is at the root while the sender policy and the return path are on
`send.`. Publish them at the registrar, press Check the records, and confirm the banner turns and
says when it last looked. Nothing on this screen asks for the credential again.

In the database, confirm `church_providers.credential` holds a sealed value rather than the password,
and that the `audit_entries` row for the connection carries no `credential` field at all.

### HRT-288, how to test it

Register an OAuth client with Resend for this environment and put the client id in
`RESEND_OAUTH_CLIENT_ID`. The call is in `.env.example`, it needs no account and no waiting, and the
redirect address in it has to be the one this environment answers on: the **parent**, so
`http://localhost:4488/api/providers/resend/callback` while working and
`https://connectapp.church/api/providers/resend/callback` in production, never a church's own name.

As Owner or Admin, open Settings, then Email. Press Connect Resend. The panel asks for the name and
address mail goes out as and nothing else: no key, no dashboard, no instructions. It says what
ConnectApp will be able to do on that Resend account, and that Resend is free to a hundred a day and
bills the church past it.

Press Continue to Resend. Confirm the browser lands on Resend's own consent screen, and that a
person with no Resend account can make one there. Approve it, and confirm the browser comes back to
the church's own address already connected, with the three settings listed, **without being asked to
sign in on the way**. Go through it again and press No at Resend, and confirm the screen says so and
nothing changed.

The settings name the company that answers for the domain and offer the page at that company where
they are typed. Publish them, press Check again, and confirm it turns.

Press Disconnect. In the Resend dashboard, under the team's settings, confirm ConnectApp's access is
gone rather than merely forgotten here.

Open `/settings/domain`. It lands on Email, where the reading of the church's domain is now a
section: its mail provider, its sender policy, its forgery policy and its registrar, read live.
Confirm Domain no longer has a name of its own in the settings menu.

### HRT-289, how to test it

As Owner or Admin with Resend connected and its settings outstanding, open Settings, then Email.
Under the line naming the company that answers for the domain, confirm there is a second line
saying what to press once you are there, in that company's own menu words: My Products and DNS at
GoDaddy, Domain List and Advanced DNS at Namecheap, Domains and the DNS Records tab at Vercel.
Change the church's website to a domain at a different company and confirm the words change with it.
A company we do not know gets the general shape rather than a blank.

There is nothing to press to find out whether the settings are in. Add them at the company, come
back to this tab, and confirm the screen moves to Ready to send on its own. A tab left open does the
same within half a minute. A tab in the background reads nothing.

The one-click is in [docs/domain-connect](docs/domain-connect/README.md): the template is
written, and the submission and the signing key are named there as work outside this repository.

Work item: HRT-289

### HRT-290, how to test it

As Owner or Admin with email connected and ready to send, open Settings, then Email. Press Send a
test email. The button goes busy, and a message arrives at the address you signed in with, from the
church's own address and under the name the church set. Look in the spam folder if it does not
arrive: a domain whose settings went in minutes ago has no sending history.

Take one of the three settings off at the domain provider and try again. The screen shows what the
provider said rather than a sentence of ours.

On Resend, press it twice. The second one must work: Resend rotates its refresh token on every use
and refuses one used twice, so a second press failing means the new token was not written down.

Work item: HRT-290

### HRT-139, how to test it

As Owner or Admin with email connected and ready to send, open the directory, then Email your church
from the menu. Choose who it goes to: everyone, one of the church's saved lists, or a group. The
line under it says how many people that reaches, and it changes when the audience does. Somebody
with no email address is not counted, and nor is anybody archived.

Choose recipients instead, type part of a name, and confirm only people with an email address are
offered. Type a whole address nobody on the list holds and confirm it is offered too, and that
sending to it works: a church writes to a roofer and a county office as well as to its members.
Follow the way out from one of those and confirm that address is refused on the next send. Pick two or three and confirm each becomes a chip that can be taken off again, and that the
count follows.

Write a subject and a message. Use `{first}` and `{name}` in either of them and confirm each person
gets their own. Press Send it, and confirm it names three of the addresses as well as the count
before it goes: the mistake worth catching is the right message going to the wrong list.

Afterwards the screen moves to Sent, where every send is listed with how many it reached.

Open the message that arrives and follow the link at the bottom. It takes you off the list with no
sign-in and no second question. Send the same thing again and confirm that person is no longer
counted and no longer receives it.

What you have sent lists each one with how many it reached and how many did not.

### HRT-141, how to test it

As Owner or Admin with email connected, open the directory, More, Email members. Write something and
send it to a group of a dozen or more. The press comes back at once saying it is sending, the screen
moves to Sent, and the row reads how many of them are done and climbs on its own without the page
being refreshed. Close the tab halfway through, open it again, and confirm the rest still arrived:
the copies were written down before the first one went, so there is nothing left for the browser to
do. The old five hundred cap is gone.

Turn on Send later, pick a date and a time, and send. The row names the day and the hour it will go,
written the way this church's country writes it, and nothing goes until then. Confirm no hour that
has already passed is offered for today.

Open that row and press Call off this send. It asks, and afterwards the row reads Called off and
nothing goes. Anything the provider had already taken is on its way and is counted as sent, because
nothing here can reach it.

Send to one person and confirm it still lands within a second or two: the press does the first pass
itself rather than leaving a message to three people waiting for the next minute.

`/api/email/drain` is the worker. It runs from `.github/workflows/drain.yml` every five minutes and
needs `CRON_SECRET` as a repository secret, because Vercel's Hobby plan runs a cron once a day and a
send queue drained once a day is not a send queue. Without the secret, a queued send waits for
whoever presses next.

### HRT-142, how to test it

As Owner or Admin with email connected, send to a handful of people including one address that
cannot exist, such as a misspelling of a real domain. Watch the Sent row: it closes with the others
delivered.

A minute or two later the provider reports back and the row changes. Open the send and the bad
address reads **Bounced** rather than sent, and the tally beside the subject drops by one. Open that
person's record and the address itself carries a red **Bounced** mark, with a line under the hover
saying what happened.

Send the same message again and confirm that person is not counted and is not written to. The
address stays on their record, visible, so the office can ask them for a new one; it is their record
rather than ours to correct.

A copy the provider merely refused is different. It is attempted again after thirty seconds, then
two minutes, then ten, and only then marked as not gone. A rate limit, a timeout or a provider
having a bad five minutes all heal by themselves. To see it, disconnect the account mid-send: the
copies go back to waiting rather than failing outright.

Somebody pressing "this is spam" in their mail program is a withdrawal, so confirm that person
appears under Unsubscribed afterwards and comes off every later send.

### HRT-291, how to test it

As Owner or Admin, open Settings, Church, Email templates. Add one: give it a name, a subject and a
message, using the same editor the composer has, marks and all. Save is dark until all three are
filled and something has been typed, and the panel comes in from the right like every other record.

Open it again and confirm the same three fields are there with what you wrote. Change the wording
and save.

Open the directory, More, Email members. The templates are offered as a row above the subject.
Press one on an empty form and the subject and message fill in. Press one over something already
written and it asks first, because that press is the only one on the screen that loses work.

Edit the message after starting from a template and confirm the template itself is unchanged: the
composer takes a copy, so this year's wording is not next year's.

Archive a template and confirm it comes off the row in the composer and sits behind the one link
under the list, which is also the way to bring it back.

### HRT-356, how to test it

Open any screen, then move to another part of the product and back. Nothing looks different. What
changed is that the frame around a screen is no longer rebuilt every time.

This was found by instrumenting the server rather than by reasoning about it, which is what the
earlier guesses should have been. The measured answer, per navigation:

| | before | after |
|---|---|---|
| the frame's data | 498ms, 508ms, 520ms | built once, then held |
| signing the mark and the face | one storage call each time | 0ms |
| resolving the session | 89ms | 85ms |

Two defects came out of it. `photoUrls` was wrapped in React's `cache`, which keys on the argument's
identity, and every caller passes a fresh array: it could never hit, not once, so the frame signed
the church's mark and the reader's face again on every navigation, and so did every list under it.
It holds each key for half an hour now, which is what the `heldPhotoUrls` beside it had been doing
for one screen. And the frame read the reader's whole person record, which gathers their custom
fields and tags with them, for the one photo column it puts in the corner.

The groups list signed its pictures one at a time in a loop, under a comment claiming one pass was
one round trip. A church with sixty groups made sixty storage calls, in turn, on the screen a
stranger follows from its website. Confirm the group photos still appear.

The frame's hold is twenty seconds, keyed on the reader's id, their church, their role and their
permissions. A role change produces a different key, so a permission can never be served from it.

What this does not fix: the frame is still rendered by every screen, so its markup is rebuilt and
sent on every navigation even though its data is now free. That is HRT-360, and it is the difference
between 65ms inside a layout and about 560ms across areas.

### HRT-366, how to test it

Open any screen. Its name is across the top of the product again, in IBM Plex Serif at 28px at the
weight it always had, and nothing says it twice. Click between People, Groups, Calendar, Check-in
and Settings without reloading: the word in the bar changes with the screen.

HRT-360 moved the name into the screen's own column, as a page header at 32px and semibold, because
the frame became a layout and a layout cannot be handed a name by the screen inside it. That was the
wrong trade. The name belongs where a reader looks to know where they are, and the weight was
nobody's decision.

So the bar reads the address itself, against the same navigation the sidebar draws, which is why the
lit row and the word in the bar always agree. The first attempt resolved it in the layout and was
wrong in a way worth writing down: a layout does not run again when the screen under it changes, so
the bar said Services while the reader was on the calendar until the next reload. It is a client
component reading the path, the same thing the sidebar does to light its row.

A screen the address cannot name still names itself, under the bar, at 22px: a service, a campaign,
a kind of group, Statements, Payouts, Labels, Incidents, and the eight reports, which have their own
heading and their way back to the catalogue again.

### HRT-364, how to test it

Open Giving and look at the foot of the gifts. It says "Showing 10 of 306" and now draws the pages
beside the arrows: 1, 2, an ellipsis, 31, with the page underfoot marked. Press 2, then 31, then the
first: each is a link, so the middle button opens a page in its own tab and the address can be sent
to somebody.

The directory and the composer already drew numbers, through a different control written for the
same job, and the two disagreed about what to draw. Both take the row from one place now, which is
`pageTokens` in the design system, under test: seven slots at most, the first and the last always
there, the current one and its neighbours, and a gap where a run is left out.

### HRT-365, how to test it

**Found while testing HRT-364, and not caused by it.** On five screens, a navigation from the screen
to itself with different parameters does nothing at all: the address does not change and the rows do
not move. Paging the gifts, narrowing the giving report, and anything else that keeps its state in
the address is dead on those screens until the page is reloaded.

To see it: open `/giving?gifts=2`, press 3 in the pager, and watch the address stay where it is.
Then open `/giving?gifts=3` directly and confirm the page itself is right, which it is: the server
answers correctly, and the client router drops the navigation.

Measured with the router directly, pushing a route to itself with a parameter:

| screen | what happens |
|---|---|
| Giving, Reports, the giving report, Check-in, Calendar | the push is dropped |
| People, Groups, Events, Forms, Services, Schedule, Follow-ups, Messages, Website, Campaigns, Statements, Duplicates, Settings | it navigates |

What is known: the RSC request goes out and answers 200, no history entry is written, nothing is
logged, and no redirect is involved. Pushing to a different screen works from the same page, and
pushing back into the stuck screen from elsewhere works. It is the same before every change in this
release, so it is older than them.

What is not known: what the five have in common. They do not share `useSearchParams`, a metadata
shape, a table, or a chart. The next step is to bisect one of them by taking its children out one at
a time, which is a story of its own rather than a line in another one.

### HRT-362, how to test it

Open the directory and narrow the window to about 950px, which is what a laptop with the developer
tools open gives the page. The table should scroll sideways, with every name, tag and address in its
own cell. Before this the headings ran into each other, a phone number was drawn across an email and
a name was cut to two letters.

What it was: the columns are pinned to measured widths so they can be dragged, and when the room ran
short every column was squeezed towards a floor of 56px. The screen's own `min-w-[720px]`, which is
the width at which the seven columns still fit, was overridden by the pinning. Under that width
nothing is pinned now: the table keeps the minimum its own markup asks for, the scroller it already
sits in does the rest, and widening the window measures it afresh.

Check it in both directions, narrowing and widening, and at a desk confirm dragging a column still
works and is still remembered.

### HRT-363, how to test it

Press Settings on the rail. The column that holds the area's screens should close, leaving the rail,
Settings' own sections across the top of the screen, and nothing in between. Overview already behaves
this way, because an area of one screen draws no column either.

It used to go on showing whichever area the reader came from: the rail said Settings and the column
beside it offered Giving, Forms, Website and Reports, which belong to a part of the product nobody
was in. Press an area mark afterwards and it opens that area at its first screen, as before.

### HRT-360, how to test it

Sign in and open the dashboard, then click between the top-level screens: People, Groups, Services,
Check-in, Reports, Giving, Settings. Each one should arrive the way Settings already did, with the
sidebar, the top bar, the bell and the church's mark standing still rather than being drawn again.
What was measured before this: 64ms to 101ms inside Settings, where the shell was already a layout,
against 733ms to 802ms between top-level screens, where every page returned the frame itself.

The screen's name has moved. It was an h1 in the top bar, which belongs to the frame and cannot
change with the screen once the frame is kept; it is now the page header at the top of the screen's
own column, the one HRT-307 built and nothing had used. So the bar carries the church's mark, the
bell and nothing else, and every screen opens with its name, its trail where it has one, and its one
action on that row. Check a record screen (a service, a campaign, a team's plan, the label layout):
the way back is a single link above the name rather than a second row drawn six different ways.

The eight reports now name themselves. Attendance says Attendance over a trail reading Reports, where
it used to say Reports in the bar and Attendance in a smaller heading underneath.

Addresses are unchanged. The screens moved into `app/(app)/`, which is a route group and draws no
segment, and the print sheets and the public previews moved to `app/(bare)/` so that nothing wraps
them in a frame they must not have. Confirm a few of those still print clean: the deposit slip,
a giving statement, the directory on paper, an event roster.

Two things changed on purpose. A member reads every one of these addresses in the portal's frame,
decided once in the layout rather than screen by screen, so confirm a member still gets the tabs and
the centred column on Home, Groups, Events, Giving and Settings. And somebody on staff who cannot
manage events or see giving amounts now meets those screens inside the staff sidebar rather than
being dropped into the member portal mid-errand.

What this unblocks: a `loading.tsx` can now sit inside the frame rather than replacing it, which is
what HRT-353 needs for every screen, and a loading boundary is what a dynamic route needs before
Next will prefetch it, which is HRT-359.

### HRT-361, how to test it

Open Giving as a church in the United States and download the gifts. The Method column now reads
Check, Cash, Card, Bank, In kind and Other, which is what the same gift says on the screen. It wrote
the stored value, `cheque`, for every church, so a treasurer reconciling the file against the screen
was handed a word their country does not write.

Change the church's country to the United Kingdom in Settings, Church, download again, and confirm
the same rows read Cheque. The spelling is resolved from the church's record, as everywhere else.

### HRT-356, what finished it

The frame and the signed links were done in the first pass. What was left is the host.

Every request asks which church an address names, before anything else can be read and before there
is a tenant context to read it in, so it is a query on the owner connection on every press and on
every public page a stranger opens. It is held for a minute now, keyed on the host, including the
answer that a host names nobody, so a crawler working through a hundred unknown names is one query
rather than a hundred.

A church changing its own address is the case that matters, and the three writers that can change it
clear the hold. The test that already covered turning the address off and on again is what holds that
in place: it sets a name, reads the host, turns the address off, and expects the host to name nobody,
which it only does if the hold was cleared.

### HRT-357, how to test it

Nothing on screen changes, which is the point: this is what happens when something else goes wrong.

Every statement on the application's connection now has fifteen seconds. A query that has run that
long is not going to answer a screen anybody is still looking at, and until it gives up it holds one
of ten connections: one of those is a slow screen, ten of them is a church that can do nothing at
all. The owner's connection is deliberately left without one, because it runs the migrations and an
index over a large table legitimately takes minutes.

Every call that leaves the building has a number on it, in `lib/budget.ts` rather than inherited from
whichever library it belongs to. Stripe's own client waits eighty seconds by default, which is not a
number anybody chose: a church pressing Give is not waiting eighty seconds to be told anything. It is
fifteen now, authentication is ten, and reading something a church pointed us at is eight. The DNS
lookups and the SMTP connection already had theirs.

To see the statement timeout work, open a psql against the app role and run
`select pg_sleep(20)`: Postgres ends it. The screens are unaffected, because nothing a church does
takes fifteen seconds.

### HRT-354, how to test it

Run the server and open any screen. Nothing shows on screen. In the server's own output, a
transaction that took longer than 400ms writes one line:

```
{"watch":"db","at":"/members","church":"4bbae21f-...","role":"admin","ms":544}
```

The address, the church, the role and the milliseconds. Set `OBSERVE_EVERY_QUERY=1` to see every
transaction rather than the slow ones, which is what a measuring run wants, and `SLOW_QUERY_MS` to
move the line.

Why it is this and not a tracing library: every story in this release was measured by hand, against a
seeded church, with the database on the same desk. That is how the two worst findings stayed hidden
for weeks. `photoUrls` was wrapped in a cache keyed on an argument nobody passes twice, so it never
hit once, and the frame was rebuilt on every press. Neither was visible by reading the code, and
neither shows in Vercel's own numbers, which say a page was slow and nothing about which church or
which read. A line of JSON goes wherever the logs already go, costs nothing when nothing is slow, and
cannot become the reason a church's write fails: anything the watcher throws is dropped.

What the line never carries: a name, an email, a note, a gift. A church's id and the address somebody
was on, which is what answers "what is slow, and for whom".

### HRT-355, how to test it

Queue a send to a handful of people from one church and another from a second church at the same
time, then let the tick run, or press send on both and watch the queue. Both move. Before this, the
second church's message waited for the whole of the first: a tick worked through the churches in
turn, and a church sending to four hundred people held the queue for forty seconds at a tenth of a
second a copy. With a thousand churches on one deployment that is a Saturday where the last church's
message goes out on Sunday.

Four churches are worked at once now. The pace inside one church is unchanged, because it belongs to
that church's own account and its provider's limit: Resend counts ten requests a second against a
team, and a team is a church. What runs alongside is another church, through another account, which
no limit anywhere counts together.

A tick also stops at four minutes of the five it is given, so it ends on its own terms with every
copy either sent or back in the queue, rather than being cut off mid-message for the reclaim to find.

Confirm, with two churches sending: neither message is held by the other, both arrive, and a church
whose provider refuses still gets its copies marked and retried rather than taking the tick down.

### HRT-352, how to test it

Open any screen and read it. Every word is where it was, which is the whole of what a church should
notice. What changed is that the browser is no longer handed the words it never shows.

The catalogue has two readers now. The server's holds all 4,729 keys, because most of what this
product writes is never on a screen: the emails, the giving statements, the printed sheets, the
importer's refusals, the words a job queue puts in a notification. The browser's holds the 3,234 its
own screens name. Which one a file gets is decided by the `react-server` condition in the package's
exports, so no screen imports anything different.

| | keys | raw | over the wire |
|---|---|---|---|
| before | 4,720 | 230KB | 65KB |
| after | 3,234 | 159KB | 47KB |

**The first attempt was wrong and the measurement is why.** A scan of the files marked "use client"
gave 2,878 keys and a screen that drew `lifecycle.visitor` where a status should be: a client form
reads those words through `lib/person-input.ts`, which carries no directive of its own. The generator
follows the imports now, which is what actually reaches a browser. Then the team picker drew
`teamLib.worship`, because `schedule/library.ts` holds its keys as data and resolves them later, so
any key-shaped string a reachable file writes down is taken too.

**And the condition was wrong, which CI caught.** Keyed on `react-server`, the split handed the
browser's share to anything that was not a React Server Component: the data layer builds its error
messages through `t` and runs under plain Node, so a church told its merge was too old to undo read
`merge.error.tooOld`. It is the `browser` condition now, which a bundler sets only for the bundle it
is building for a browser, and everything else reads the whole catalogue. A test holds it there.

Three things keep it honest: `pnpm catalogue` regenerates it, CI fails if the committed file is
stale, and a key a screen reads that the catalogue does not hold fails the generator outright. It was
checked by driving a browser over nineteen screens and five panels and failing on any catalogue key
rendered as itself.

`FieldHint` changed to take its words rather than the key they live under, because a component that
builds a key out of a prop makes it impossible to say what a screen needs, and the generator refuses
that shape rather than quietly shipping everything.

### HRT-350, how to test it

Open the directory. The chip saying how many possible duplicates there are says the same number it
said before. Open it, and the queue holds the same groups, in the same order, with the same reasons.
Merge one and confirm it comes off both.

What changed is underneath. The count and the queue both asked "who is a copy of somebody" by pulling
every member and every contact method into memory and matching them against each other, and the
directory ran that on every press for a number in a chip. Two members can only match on a key they
share, so the database now says which keys more than one member holds, and only those people are
read: a church with six hundred members and nine copies reads eighteen rows rather than two thousand.

The rules stay where they were. The database narrows; `findMatches` still decides what a match means
and still rules out two people with the same name and different birthdays. The normalising is the
same in both places, and a test holds the narrow read against a whole-church read and fails if they
ever find different pairs. Another names somebody twice, once with an accent and once without, which
is the case where a normalising written out twice would quietly drift apart.

Measured against a build, four runs: the duplicates screen 764ms to 776ms becomes 661ms to 737ms, and
the directory is unchanged within the noise. The seeded church is small and the database is on the
same desk, so this is the shape of the win rather than the size of it: what it stops is a church's
whole directory crossing the wire for a number.

### HRT-348, how to test it

Open the email composer, a service's plan, a form's record, an event's record and its edit panel, the
giving report, and four settings screens: Email, Online giving, Teams and Service template. Each
holds exactly what it held before. These ten awaited their independent reads one at a time, a round
trip each, and send them down the one connection together now. The groups list had already been done.

Three of them also stopped asking a question that was already answered. The service plan, the event's
edit panel, the giving report and the email settings each read the church again for a timezone or a
website; the frame has already read it, so it comes from there. Online giving read the Stripe account
twice to answer the same question, and reads it a second time now only when Stripe has been asked for
something newer.

Checked in a browser against a build, signed in, every screen clean: no console error, no failed
request, the right name in the tab. The wall clock locally, three runs a screen: Email settings 371ms
to 453ms becomes 327ms to 358ms, Service template 319ms to 358ms becomes 273ms to 297ms, and Teams,
Online giving, the giving report and the composer are unchanged within the noise.

**Which is the honest answer: against a database this close, a saved round trip is worth about 10ms.**
The change is right where the database is far, which is where the churches are and where this was
first measured, and it is worth nothing on a laptop beside a local instance. What it is not is a
regression, and it takes the last of this class out of the product.

Teams is the slowest screen in the product at about 1.2 seconds, and none of it is this: it reads
every team's roster, one read a team, and then signs every face on them. That is its own story rather
than this one.

### HRT-349, how to test it

This is the authorization path, so it is tested by trying to get past it rather than by a stopwatch.

Sign in as a member of one church. Their own screens open and hold their own rows. Then set the
`church` cookie by hand to a church you do not belong to, and to a church that does not exist, and
confirm both open the chooser saying `reason=denied` rather than opening anything. Those two must
stay indistinguishable: that is what stops a URL being used to find out which churches are on the
platform.

Every screen used to pay five round trips before it read a single row. Two of them asked the
database to find a church by its slug and then asked again whether this reader belonged to it, and
`membershipsForUser` is `verifyMembership`'s own query without the tenant filter: the same table, the
same joins, the same role and permission resolution, the same refusal of an archived church. So the
row was already in hand and both trips were spent on an answer the first read contained. The host
lookup and the Supabase Auth call are independent, a query against one database and an HTTPS call to
another, and they went one after the other.

`belongsTo` and `verifiedMembership`, which the public church pages use, answer out of the same
cached list now rather than making two reads each of their own.

### HRT-347, how to test it

Open the product and move between screens: the dashboard, the directory, giving, services, the
schedule, reports, settings. Everything looks the same and holds the same rows. What changed is that
the frame around a screen and the screen's own rows are now read at the same time rather than one
after the other.

Measured on a production build, signed in, three navigations a screen averaged, mean time to first
byte across ten screens: **867ms before, 635ms after**. Giving went 1,152ms to 719ms, the schedule
1,148ms to 742ms, services 929ms to 530ms, groups 810ms to 526ms.

Two screens did not move, and both for the right reason. The dashboard takes the church out of the
frame's data rather than reading it again, so it has to wait for the frame and there is nothing to
overlap. Settings sits under its own layout, and Next already renders a layout alongside its page.

A screen now asks for its session through `requireScreen`, which puts the frame's read in flight
before the screen reads anything. A server action and an API route keep `requireSession`, because
they draw no frame: there are 181 callers and only 37 are screens, so warming the frame in
`requireSession` would have added a transaction to every button press in the product. That is what
makes this 37 explicit changes rather than one clever one.

### HRT-346, how to test it

Open `/members`, tick everybody with the header checkbox, and apply a tag from the selection bar. It
returns in well under a second where it used to stand there for about eleven, and the count it
reports is the same. Measured against Riverside's 238 members: 11,161ms became 632ms.

Do the same with Add to group. That one was worse: five queries a person, the last of them reading
the group's whole roster back and throwing it away, so a directory of five hundred was roughly two
and a half thousand queries behind one press.

Three things to confirm it did not get looser while getting faster. Apply the same tag twice and
confirm nobody ends up with it twice and the count still reads correctly. Add a selection to a group
they are already in, with a different role, and confirm the roster does not double and their role
moved. Tick somebody archived and confirm they are passed over rather than added.

The other two bulk actions, archiving and setting a status, were already one statement and are
untouched.

### HRT-345, how to test it

Open `/giving/statements`, pick a year the church gave in, and print the whole set. The sheets are
the same: the same names, the same addresses, the same lines in date order, cash totalled, a gift in
kind listed and not valued, and the acknowledgment line on any sheet carrying a single gift of $250
or more. Print one person's statement from their own record too, which goes through a different
path, and confirm it still matches their sheet in the full set.

Each statement used to be read on its own: three queries a giver, five where the church statements
by household. Measured against Riverside's sixty givers, in one transaction, 8,424ms became 288ms.
At four hundred givers the old shape was about a minute, so the sheet never reached the printer. It
is five queries now, whatever the number of givers.

Set the church to statement by household and print again. Ann and Bob's gifts belong on one sheet
under the household's name, and Carl, who is in no household, is untouched by it.

The risk in this change is that the gifts are grouped in memory, which is where one giver's lines
could land on another's sheet. `packages/db/tests/statements.test.ts` reads each giver's own total
back out of the gifts table and compares, rather than writing a figure down, because the campaign
tests give to the same church and a fixed number would only have tested the order the file runs in.

### HRT-344, how to test it

Send to more than twenty-five people. The progress reaches the end and the send closes, which is the
bug: the worker claimed twenty-five at a time, marked them 'sending', then sent them one at a time,
and an invocation that ran out of time left the remainder marked 'sending' for ever. Nothing could
see those rows. The due-sends query counts only 'queued', so the send reported nothing waiting and
was never picked up again, while the progress the church was watching counted them as outstanding
and never finished. Every send larger than one batch stranded its remainder.

To see the recovery without waiting for a worker to die, take a send with copies still going and set
one row back by hand:

```sql
update email_recipients set state = 'sending', claimed_at = now() - interval '20 minutes'
 where id = '<some recipient id>';
```

The next pass of the worker puts it back in the queue and sends it. The log says how many it
recovered. A row claimed a minute ago is left alone, so a worker still working is never robbed of
what it holds.

The case that matters most is the opposite one. A row that already carries a `provider_ref` was
accepted by the provider, so it went. That row is marked sent rather than queued, because requeueing
it would put a second copy in somebody's inbox. Set `provider_ref` on a stuck row and confirm it
settles as sent and is not sent again.

The claim also stopped asking two questions per recipient. The person's name and their way out were
a query each, so a batch of twenty-five cost fifty round trips before the first message left; they
are joined into the claim now. `packages/db/tests/claim-reaper.test.ts` covers both halves, and the
test that matters is the one asserting Ada's copy carries Ada's token and not Bea's.

### HRT-343, how to test it

Open `/members/email`, choose Everyone, write something and send it. It behaves as before: the same
count, the same fine print, the same way out at the foot of the message that unsubscribes the person
who pressed it and nobody else.

What changed is underneath. Every recipient's token used to be minted with a round trip of its own,
so the work grew with the size of the church and sat in front of the first message leaving. Measured
against a church of 242 members, inside one transaction: 10.6 seconds for the reads alone, where a
first-time send also wrote a row each. It is now 469ms, and it is four statements whatever the size
of the audience.

A member's row is written and read in one statement whose conflict target is the unique index, so
two sends starting at once cannot mint two tokens for one person: the second finds the first's and
keeps it. An address with nobody behind it has no index to conflict on, because this table counts a
null member as distinct from every other null, so those are read and then the missing ones written.

`packages/db/tests/way-out.test.ts` holds the properties that matter: every member gets their own
token, no two people are handed the same one, asking twice returns the first answer, an address
written `Twice@Example.org` and `  twice@example.org ` is one person, and a consent row captured by
a form keeps its `granted` state when a send fills in its token.

### HRT-342, how to test it

Run `pnpm lint`. It reports 44 warnings and no errors, where it reported 60, and CI's ceiling has
come down to match, so the next warning anybody adds fails the build rather than being absorbed.
Four of the sixteen were a `useMemo` over a filter of about fifteen hardcoded items, which cost two
warnings each and saved nothing; three were a panel's reset-on-open effect, where listing the record
itself would re-run the reset on every render of the screen behind it and throw away whatever had
been typed, so those carry a comment saying why the record is left out.

Open the landing page and look at the four product shots. They are the same pictures. In the network
panel, each now arrives through `/_next/image` at the width its frame actually gives it: the first
shot is about 30KB where the file on disk is 658KB, and a phone is sent about 11KB of it. The member
shot renders 300px wide from a 1242px capture, which was the worst of the four. All four together
came to 2.3MB of PNG, which was roughly ten times the page's entire JavaScript.

`.env.example` now says which pooler port each connection takes and why they differ. The application
takes 6543, the transaction pooler, which is what the pool size in `packages/db/src/client.ts` is
written for; migrations stay on 5432 because advisory locks outlive a transaction. An application
left on 5432 reaches the fifteen-client ceiling at two or three serverless instances and then fails
every request with EMAXCONNSESSION. The file had both on 5432, which is how a deployment set up from
it would have been wrong.

### HRT-341, how to test it

Tick two or three people in the directory and press Message on the selection bar. The composer opens
over the list with Recipient already set to those people, each one a chip that can be taken off, and
the line underneath says how many it will reach. Tick somebody with no email address and confirm
they do not arrive as a chip: a recipient who cannot be written to is a choice that quietly does
nothing. Tick somebody who has unsubscribed and confirm the same. Write a message, send it, and
confirm it lands with the fine print and the way out that every other send carries.

The dialog that used to open here is gone. It was drawn while messaging was deferred, its Send was
dark, and it sent nothing.

### HRT-285, how to test it

As Owner or Admin, open Website from the left navigation and confirm the app sidebar and top bar
remain visible. For a new site, choose a design, then select a section in the preview and edit it.
Add sections from the editor menu, move them by dragging and by keyboard, upload a photo or short
video, and add a button linking to an external site or a public ConnectApp form, group, or event.
Save as a draft and check that the church address still opens the existing join screen. After approval,
publish the homepage and check its public address in a signed-out browser. Sign in as a member and
confirm the same address opens the member portal; sign in as staff and confirm it opens the staff
starting page. Grant `website.manage` to a custom role and confirm that role sees the editor; remove
the permission and confirm it no longer appears.

### HRT-303, how to test it

As Owner or Admin on a desktop, confirm the left navigation groups related pages under expandable
headings, opens the group containing the current page, and keeps Settings and your profile at the
bottom. Collapse the sidebar and confirm every page remains reachable by its icon and tooltip.
Check the mobile tab bar separately; it should keep its existing layout.

### HRT-300, how to test it

Open the web app and admin portal. Confirm headings use IBM Plex Serif, interface text uses IBM Plex
Sans, and codes use IBM Plex Mono. In `/design/type`, confirm IBM Plex is labeled as the current
system and the alternatives still render.

### HRT-301, how to test it

Open the public landing page with motion enabled. Confirm "for free" types first, then "always"
types after it clears, and the phrases keep alternating at a readable pace. Confirm the underline
follows each phrase, the blinking cursor tracks the last typed character, and the layout stays in
place. Turn on reduced motion and reload: "for free" appears immediately without animation.

### HRT-302, how to test it

Configure `SUPPORT_SMTP_USER`, `SUPPORT_SMTP_APP_PASSWORD`,
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.local` or the deployment
environment. Open the floating message button on the public landing page. Confirm the panel closes
when the page outside it is tapped. Enter a name and church name, which are optional, with an email
and message, then submit. Confirm a message arrives at `support@connectapp.church` with the entered
details, and replying reaches the visitor's address. Confirm repeated submissions are rate limited.
The footer support email is underlined, and "Support Our Work" opens its Stripe page in another tab.

### HRT-298, how to test it

Open the public landing page. Confirm the pilot banner links to church sign-up, the headline is
bold and underlined, and the updated copy appears in the "Why we built this" section.

### HRT-255, how to test it

Everything is on the Members screen.

1. **Keep a filtered view.** Narrow the directory, by a status, a tag, a group
   or a search. **Save as a list** appears beside Filter. Name it and you land
   on it. It answers itself: whoever matches is on it.
2. **Keep the people you ticked.** Tick a few members. **Add to a list** is on
   the bar along the bottom, offering the lists the church already keeps and a
   new one named there.
3. **Open one.** The **Lists** control beside Filter holds them all.
4. **Take somebody off.** While reading a picked list, tick them and press
   **Take off this list**. Their record is untouched. A list that answers
   itself has nobody to take off, so the control is not there.
5. Rename and Archive sit on the bar naming the list. An archived one is behind
   the link at the foot of the directory.

### HRT-254, how to test it

Every screen that can put a record away now reads the same way: the live list is
the whole screen, one quiet line under it says how many have been archived, and
that opens them with the way back at the top.

1. **Pick any of them.** Forms, events, members, groups, campaigns, reports,
   funds, rooms, stations, group types, service types, service templates, teams,
   households, follow-up stages, roles.
2. Put a record away. The line appears under the list: "1 archived fund".
3. Press it. The heading names the archived ones, there is a link back, and
   there is no link to the screen you are already on.
4. Put the record back from its row. The line goes when the last one is restored.
5. **Reports and saved lists** could be archived and then never seen again:
   nothing listed them and nothing brought one back. Both are reversible now.
6. **Roles are the one with a rule behind it.** Sign in as an Admin, put a role
   holding "see giving amounts" away, and try to bring it back: it is refused.
   The same for taking Finance off the shelf. An Owner may do both.

### HRT-253, how to test it

Everything below is at 390px, which is an iPhone 13. 360px and 768px were held to
the same bar.

1. **Every section is reachable.** The tab bar along the bottom carries four
   sections and **More**. More opens the whole list, so giving, reports, forms,
   events and settings can be opened on a phone, which they could not before.
2. **Settings.** Every screen in settings is on one row that scrolls sideways.
   The grouped menu that opens under a pointer is for 1024px and up, since a
   phone has no pointer to open it with.
3. **Nothing scrolls sideways.** On any screen, drag the page left. It should
   not move. A wide table scrolls inside its own frame; the page does not.
4. **The lists that were tables.** Giving's gifts and counting sessions, the
   directory, event registrations and form responses all stack into cards on a
   phone and go back to being tables on a desk. A refund still sits under the
   gift it came off.
5. **Paging.** Press the arrow at the foot of any list. It should bring you to
   the head of that list, not the top of the page.
6. **Targets.** A checkbox, a radio, a switch and the marks on a date or time
   field are all a finger wide, while the drawn control stays the size it was.
7. **The notch.** Install the member portal to a home screen and open it. The
   tab bar sits above the bar iOS draws at the bottom, and the header clears
   the notch.
8. **A church's public pages.** The giving page, an event and its registration,
   a form and the group finder are the links a church sends by text message.
   Open each one on a phone.
9. **Check-in.** Choose a station: the desk runs at 56px targets and 20px text.
   Nothing about check-in was weakened to make it fit.

### HRT-248, how to test it

1. On the giving page, a church with more than one fund offers **Split this gift**.
2. Put an amount against two funds. The line under them says what is left to place, and Give stays
   dead until the parts add up to the gift.
3. Stripe's page lists the funds one by one, so the giver sees what they chose.
4. Afterwards the Giving screen shows one gift a fund, and the fee sits on the first of them,
   because Stripe charged it once.
5. The same webhook delivered twice still writes one row a fund.
6. A split works on a monthly gift too: every collection divides the same way.

### HRT-247, how to test it

1. **Statements** carries the church's choice: One a person, or One a household.
2. With a household chosen, two people in one household who both gave appear once, under the
   household's name, and their gifts are on one sheet.
3. Somebody with no household stands on their own either way.
4. A member's own statement in the portal follows the same choice.

### HRT-246, how to test it

1. **Campaigns** on the Giving screen. Add one: a name, the fund its gifts go to, a target, a start
   and an optional end.
2. The card shows the bar, what has come in against the target, and what has been pledged.
3. Open it and **Add a commitment**: look somebody up, put an amount against them.
4. Record a gift to that fund inside the period and the commitment reads what they have given.
   Record it against their spouse instead and it still counts, because progress is read across the
   household.
5. A commitment that has been met wears **Kept**.
6. Closing a campaign asks first and moves it to Closed; Reopen puts it back.
7. Somebody who can see giving amounts but not manage reads all of it with no actions.

### HRT-244, how to test it

1. Sign in as a member who has a gift recorded. The portal home carries **My giving** with the
   year's total.
2. **See my giving** lists every gift with its fund and the way it came.
3. **Download my statement** prints their own statement, the same sheet the church prints.
4. A member always reads their own amounts, whatever their role says about anybody else's.
5. A church with no online giving and no recorded gift for that member draws no panel at all.

### HRT-243, how to test it

Needs Stripe and `stripe listen --forward-to localhost:4488/api/stripe/webhook`.

1. The giving page offers Once, Monthly and Weekly beside the amount. The button says what it is
   about to set up.
2. Monthly sends the giver to Stripe in subscription mode. Pay with 4242 4242 4242 4242.
3. The thank-you page says it will be collected again, and **Change or stop this gift** opens
   Stripe's billing portal for that giver. No account on our side, because the checkout session
   they were just handed is what proves it is them.
4. The Giving screen lists the repeating gifts with what is expected a month.
5. The first collection appears as an ordinary gift against the fund, with Stripe's fee on it.
   Trigger another with `stripe trigger invoice.paid` and a second gift appears; the same event
   twice still writes one row.
6. Cancel in the portal and the repeating gift reads Stopped.

### HRT-242, how to test it

1. **Reports** carries a Giving row for anybody whose role sees giving amounts, and does not for
   anybody else.
2. Three figures: what came in over the window, how many gave and what that averages, and how many
   have stopped.
3. Month by month, and a bar a fund with the restricted ones marked.
4. **Stopped giving** is somebody who gave at least twice in the year before the window and nothing
   inside it. One gift at a wedding collection does not put them on the list.
5. **First-time givers** is whoever's first gift ever landed inside the window.
6. Both lists open the person's record.

### HRT-241, how to test it

**This needs a CPA to read one before it ships.** The PRD makes that a release gate on 0.3, and
household roll-up (R13.18) and quid pro quo on paid registrations (R13.20) are still owed.

1. **Statements** on the Giving screen lists everybody who gave in the year, with their total.
   Three years are reachable from the row of years.
2. **Print** writes one statement a page: the church's legal name and address, every gift with its
   date, fund and amount, the total, and the sentence about goods and services.
3. A gift in kind is listed by its description under its own heading, with no value on it, and is
   left out of the total.
4. A giver with a single gift of $250 or more gets the line about keeping the acknowledgment.
5. Print one from a row when somebody rings up having lost theirs.
6. Both pages are refused to anybody without "See how much somebody gives".

### HRT-240, how to test it

1. On a count, **Deposit slip** opens a printable sheet: the cheques one by one with their numbers,
   the cash as one line, the total that has to match the paying-in slip, and two lines for the
   counters to sign.
2. The variance note, where there is one, prints under the total.
3. **Export** on a count writes that count's lines as CSV. Export on the Giving screen writes
   everything recorded.
4. Both are refused to anybody who cannot see giving amounts.

### HRT-239, how to test it

This needs `STRIPE_SECRET_KEY` and a connected account that Stripe will take a payment on.

1. **Settings, Money, Online giving** shows the giving address once Stripe says the account can
   take a payment. Open it: `/give/<church>`.
2. The page is the church's name and colour, an amount with four quick figures, the funds it keeps,
   a name and an email. No account, no sign-in.
3. Tick the fee line and the button's figure goes up by the fee, with the amount spelled out. It is
   never ticked for the giver.
4. Give lands on Stripe's own page. The card is typed there, never on ours.
5. Pay with 4242 4242 4242 4242 and Stripe returns to the thank-you page.
6. With the webhook running (`stripe listen --forward-to localhost:4488/api/stripe/webhook`), the
   gift appears on the Giving screen against the right fund, with Stripe's fee recorded. If the
   email matches one person in the directory, it lands on their record.
7. A church that has not connected Stripe, or is not approved, has no giving page at all.

### HRT-237 and HRT-238, how to test it

1. **Giving** is in the sidebar for Owner, Admin and anybody on a role carrying "Record gifts, keep
   the funds and connect the church's Stripe account". It is not there for anybody else.
2. **Settings, Money, Funds** starts with General. Add Building and mark it restricted. Archiving
   the last live fund is refused, because a gift has to go somewhere.
3. **Start a count** on the Giving screen: name it, date it, declare the total that is in the bag.
   It opens on its own screen.
4. **Record a gift** against the count. Save and add another keeps the panel open for the next
   envelope. Leave the giver empty and the gift is anonymous and still counts to the fund.
5. The two figures across the top are the declared total and what has been entered, with the
   difference said in words.
6. **Close the count** is refused until two counters are named, and refused on a difference until
   somebody writes down why. The note then reads on the count.
7. A closed count takes no more lines. Reopen puts it back.
8. A gift in kind takes a description and no amount, and stays out of the cash totals.
9. Somebody with "See how much somebody gives" but not the manage permission reads the screen with
   no actions on it. Somebody with neither is refused.
10. **Settings, Money, Online giving** says Not connected. With `STRIPE_SECRET_KEY` set, Connect
    Stripe creates the church's own Standard account and sends you to Stripe's onboarding. Without
    the key, the screen says the platform is not set up for it.
11. [docs/giving.md](docs/giving.md) is the money model: direct charges on the church's account,
    application fee zero, Stripe's fee off the church's balance.

### HRT-236, how to test it

1. **Settings, Services, Service type** lists the eight every church is signed up with.
2. Add a new type writes one of your own. Call it Testimony, and it appears on the type picker on a
   plan item and on a service template. Archive one of the eight and it comes back under Add a new
   type, where the library offers whatever the church is not keeping.
3. A type dropdown carries **Add a service type** under its options, which opens this screen.
3. Tap one of the eight and rename it. Every plan that already used it reads the new word, including
   the printed order of service, because a plan stores the kind rather than its name.
4. The archive in the panel's footer asks in a box of its own. The kind comes off the picker, and
   items already filed under it keep it. The last live kind cannot be archived.
5. Restore brings it back.
6. Only somebody whose role carries "Plan services, keep plan templates and record attendance" sees
   the screen.

### HRT-235, how to test it

1. **Settings, Services, Plan templates.** Create a new template opens on the shapes churches
   already run: a morning service, communion, a midweek gathering, carols. Picking one fills the
   name and the whole order of service, every line of it yours to rename, retime or throw away.
2. **Create your own** opens the same form empty. Add an item, choose its kind, name it, give it
   minutes. The handle drags a line up or down, and the running total reads under the list.
3. Save is dead until something has been changed, and closing a panel that has been typed in asks.
4. A blank name is refused, a template with nothing on it is refused, and a name another template
   already has is refused.
5. The bin in the panel's footer deletes it, after a confirmation. Plans already built from it keep
   their items.
6. **On a service plan, Create from template** lists the same templates. More than five of them and
   a search box appears over the list. Manage templates at the foot opens the settings screen.
7. Recent plans are gone from that dialog.
8. The screen is refused to anybody without "Plan services, keep plan templates and record
   attendance" on their role, and the Services section does not appear in Settings for them.

### HRT-16, how to test it

"Fields" is in the header. This is the answer to "can it track X", for any X.

1. **Define some.** Add one of each type. A choice field asks for its choices, one per line, and
   refuses to save with none. Blank and duplicate choices are dropped.
2. **Fill them in.** Add or edit a person. The fields appear under "More", in the order they were
   defined, each rendered for its type. They save with the rest of the form and show on the record.
3. **Bad input.** Type letters into a number field, or `01/05/2024` into a date field. Refused, with
   the message next to the field.
4. **Rename.** Rename a field. Values already recorded stay attached. The type cannot be changed,
   deliberately: turning a date into a number would leave every recorded value unreadable with no
   honest way to convert it.
5. **Delete.** Deleting says it removes everything recorded in the field, and it means it. That is
   the one thing here that is not reversible.
6. **Roles.** `staff` can fill fields in but cannot define them. `pastoral` and `member` can do
   neither.

### HRT-37, how to test it

Nothing to click. Open the Actions tab on GitHub after this push and watch three jobs run.

- **Types, catalogue, contrast.** Typecheck, the contrast audit, the externalised-strings scan, a
  check that the generated `tokens.css` matches its source, and a grep for em dashes.
- **Build.** The production build, with no database reachable.
- **Tenant isolation and authorization.** A real Postgres, migrated and seeded from scratch, then
  the adversarial suite. This is the 0.1 exit criterion running on every push.

The audit found four real defects the first time it ran, listed in the commit.

### HRT-28, how to test it

"Import" is in the header, and on the directory next to "Add someone".

1. **Export from anywhere.** An .xlsx workbook or a CSV, with a first name and a surname column.
   A birthday formatted as a date in Excel comes across as a date, not as the number 31514. Columns called
   "First Name", "DOB", "Membership Status", "Mobile Phone" and so on are matched for you. The guess
   is always shown and always editable.
2. **The preview writes nothing.** It lists what will be added, updated and left alone, with the
   rows that are not simply additions at the top, because those are the ones worth reading.
3. **Duplicates.** Import the same file twice. The second run leaves everyone alone and says why,
   naming the person it matched and how. Switch to "Update them from the file" and it fills in what
   the first file did not carry, without blanking anything.
4. **A file with a person on it twice** catches the second one and names the line.
5. **Bad data.** A row with no name, or a date like 13/04/1990, is reported against its own line
   number in your file rather than being imported wrong.
6. **Roles.** `staff` can import. `pastoral` and `member` cannot, and the server refuses even if the
   page is bypassed.
7. **Export everything.** On the directory toolbar, on the right. One click, a zip with a CSV per table,
   the whole thing as JSON, and a README. Open it in Excel. Sign in as `admin@riverside.example.org`
   and export again: the confidential note bodies are absent and the README says they were withheld.
   `staff` and `pastoral` cannot export at all.
8. **Undo it.** Past imports are listed under the wizard. "Undo this import" removes the people it
   added and puts back the ones it changed. Edit somebody the import created first, then undo: they
   are archived rather than removed, because that edit was not part of the mistake. Undoing is Owner
   and Admin only, since one press can remove hundreds of people.

### HRT-40 and HRT-25, how to test it

The directory now has a toolbar.

1. **Search.** One box. Type a first name, a surname, part of an email, or a phone number with no
   punctuation: `5557431` finds `(512) 555 7431`. It waits until you stop typing.
2. **Filter.** Status, tag, and whether there is an email or a phone. They combine, and they land in
   the URL, so "everyone with no email address" is a link you can send to someone.
3. **Sort.** Press a column heading. Press it again to reverse it.
4. **Select.** Tick rows, or the box in the heading. A bar appears above the table with add a tag,
   remove a tag, set status, and archive. Archive confirms and says how many.
5. **Pages.** Fifty at a time. Changing a filter or a sort returns you to page one, so narrowing
   the list while on page four cannot look like "no results". The selection clears when you move
   pages, because it only ever held what was on screen. An export still exports every matching
   person rather than the page you were on.
6. **Export.** With no filter it downloads the whole archive, the zip. With a filter it downloads
   just those people as one CSV, and the file matches exactly what is on screen because the server
   ran the same query the URL describes.
7. **Roles.** `staff` can select, tag and set status, and has no archive button.
   `pastoral` sees no checkboxes and no export.

### HRT-24, how to test it

1. **Pick two yourself.** Tick two people in the directory. A Merge button appears in the selection
   bar. The review screen opens with your pair at the top, badged "You picked these". This is the
   path for records the detector cannot spot, like Mike Bennett and Michael Bennett on two different
   email addresses.
2. **Or let it find them.** Add two people with the same email address, or import a file twice
   choosing "Add them again anyway". A banner appears on the directory linking to the queue, and the
   pair is marked by how sure the match is.
3. **Choose which survives.** Press either card. Where the two records disagree, you pick which
   value wins, field by field. Switching which record survives resets those choices rather than
   inverting them.
4. **Merge.** Contact details, notes, tags, milestones and history move across. The other record is
   archived and you have 30 days to undo.
5. **Undo it.** Past merges are listed underneath. Undo puts both records back, returns exactly the
   rows that moved, and restores any field that was written over. A note written *after* the merge
   stays with the surviving person, because it was never part of it.
6. **Roles.** Owner and Admin only. `staff` can edit people but cannot merge them, since one press
   moves every note off one record and onto another.

### HRT-22, how to test it

Open anyone's record. A Relationships card sits above Tags.

1. **Add one.** Choose a person and a relationship, then Add. Open the other person: the matching
   relationship is already there. Spouse pairs with spouse, parent pairs with child.
2. **One-way on purpose.** Guardian and emergency contact are recorded on one record only. Being
   someone's emergency contact does not make them yours.
3. **Do not contact.** Record it between two people. It appears in red, at the top of both records.
   Now try to add either as the other's emergency contact: refused.
4. **Order of entry does not matter.** Record Gregory as a child's emergency contact first, then
   record a do-not-contact order between them. The order is accepted and the emergency contact is
   removed, with a line saying so. A safeguarding instruction that waits for tidying up is an
   instruction that does not take effect.
5. **Who may lift it.** Anyone who can edit a person can record a do-not-contact order, since the
   person who hears about a custody arrangement on a Sunday is rarely the Owner. Lifting one asks
   for confirmation and is Owner and Admin only.
6. **Finding the person.** The picker is a combobox. Type any part of a name and the list narrows.
   Arrow keys move, Enter chooses, Escape puts back what was there.

Check-in enforcement of these orders is R8.9, in 0.2. This story records them.

### HRT-23, how to test it

Open anyone's record. A Milestones card sits above Relationships.

1. **Record one.** Choose a milestone, a date and an optional note. The list reads most recent
   first, which is the order somebody reads a life in.
2. **Dates that have passed only.** A date in the future is refused. It is a typo in the year every
   time.
3. **A death sets the status.** Record a death and the person's lifecycle status becomes Deceased,
   with a line saying so. A church that records a death and then sends the family a birthday email
   has been failed by its software.
4. **A first visit fills a blank date.** If the person has no first visit date, recording the
   milestone sets it. If they already have one, the milestone is recorded and the date is left
   alone, because someone corrected it on the record for a reason.
5. **Removing one leaves the person alone.** Deleting a death record does not decide that somebody
   is alive. Change the status on the record itself.

### HRT-15, how to test it

A Settings link appears in the header for Owner and Admin.

1. **The profile.** Name, legal name, address, phone, website, timezone and colour. The legal name
   is separate because it is what goes on a giving statement under IRS Pub. 1771 (R13.14), and it is
   rarely what the church calls itself.
2. **The timezone is searchable.** Type "Chicago" or "Denver". An invented zone is refused by the
   server as well as the form, because an unknown zone breaks every date in the product.
3. **Service times.** Add "First service", Sunday, 09:00. They list Sunday first, then by the clock.
   A separate record per service, because a church with a 09:00 and an 11:00 counts them
   separately and a free-text "Sundays 9 and 11" cannot be counted. Attendance in 0.2 reads these.
4. **Roles.** Owner and Admin. Staff edit people and do not rename the church. The link is hidden
   for everyone else, and the write is refused even if the URL is typed in.

The logo arrived with HRT-18. The brand colour is stored but no screen reads it, so the picker is
off the settings page until one does (HRT-43). Putting it back is one component and one line.

### HRT-42, how to test it

Every date on a person's record, a milestone and a custom field.

1. **It is ours now.** The panel uses the product's own colours, corners and type, in light and
   dark, and it looks the same in Safari, Chrome and Firefox.
2. **Type it.** A date of birth in 1954 is typed, not paged to. The field accepts 06/14/1954,
   6/14/54, 06-14-1954 and the ISO form. A typo puts back the date that was there rather than
   emptying the field.
3. **Or point at it.** Month and year are dropdowns, so a birthday is two presses and a date rather
   than eight hundred month presses.
4. **Keyboard.** Arrows move a day, PageUp and PageDown move a month, Home and End go to the ends of
   the week, Enter chooses, Escape closes. The grid is one tab stop.
5. **Limits.** A milestone cannot be given a future date, and those days are greyed and refuse the
   press.

### HRT-14, cut

The device list and remote revoke came out in October 2026. A church of this size has one admin and
one laptop, and a screen listing browser strings answered a question nobody was asking. R1.10 came
out of the PRD with it.

What a church still has: signing out ends the session on that device, and a password change
invalidates the refresh tokens everywhere. What it no longer has: ending a session on a device that
is not in front of them. If a laptop is lost, the answer is to change the password.

### HRT-45, how to test it

Press your name in the top right.

1. **The navigation is one item now.** Directory. Tags, Fields and Settings were beside it, which
   put the two things a volunteer touches every day next to two they touch twice a year.
2. **Five tabs, by role.** Account and Security for everyone. Church for Owner and Admin. Tags for
   anyone who can edit people. Fields for Owner and Admin. Sign in as staff and the Church and Fields tabs are
   absent, and typing the URL is still refused by the query layer.
3. **Each tab is a real page.** Reload on Tags and you stay on Tags. The links can be shared and
   opened in a new tab, which a widget that swaps panels cannot do.
4. **Your name, not your email.** The header shows the name on your account, falling back to the
   email address when there is none. The role badge came off: it is on the Account tab, and the
   header is not where somebody checks what they are allowed to do.
5. **Signing out moved** into the Account tab. It used to sit beside the name people aim for, which
   is a press somebody makes by accident.
6. **Devices are named.** Sign-in happens on the server, so Supabase was recording the Node fetch
   agent and every row read "Unknown device". The browser's own agent is passed through now.
   Sessions created before this change stay unknown, since the agent is recorded once.

### HRT-18, how to test it

Settings, the Storage card at the top.

1. **Add a logo.** A PNG, JPEG or WebP under 2 MB.
2. **Replace it.** Upload a different one. The old file is forgotten and removed from the bucket,
   so changing a logo ten times costs one logo.
3. **Things that are refused.** An SVG, an empty file, anything over 2 MB. Each says which rule it
   broke, and nothing is written.
4. **The quota is real, and out of sight.** It is checked in the query layer before the bytes are
   sent. Nine tests cover it, including the refusal that takes a church over the line. Nothing on
   screen reports usage until a church passes 80%, since a bar reading 282 kB of 2.1 GB only asks
   somebody to worry about a number that will never move. Showing usage properly is HRT-44.
5. **Roles.** Owner and Admin. The route refuses a staff upload even with the button hidden.

The bucket is private. The logo is served through a signed URL that lasts an hour, so a leaked path
expires. Writes are checked twice: our query layer for the quota and the rules, and a bucket policy
that reads membership from our own tables, so a user can only write into their own church's folder.

### HRT-47, how to test it

A Services tab sits beside Directory. One concept, one button.

1. **Add a service.** Name, date, time, and "Repeats every week". A church meeting at 09:00 and
   11:00 on a Sunday adds two, once, and never touches a calendar again.
2. **The repeat keeps itself going.** Six months of dates appear at once, and the horizon moves on
   its own each time the page is read. There is no calendar to fill and no button asking you to
   maintain one.
3. **Leave the box unticked** for a one-off: Carols by candlelight, Good Friday, a funeral.
4. **Cancel a week**, with a note like "Snow". It stays on the list, greyed, because a Sunday that
   vanished leaves a gap in the attendance record that reads as a collapse. Put it back with one
   press.
5. **Stop a repeat.** Future dates come off. Everything already recorded stays, because deciding to
   stop meeting on a Wednesday is not deciding that two years of Wednesdays did not happen.
6. **Roles.** Owner, Admin and Staff. Staff plan services, and cancelling one is not renaming the
   church.

An earlier build of this had three ideas (a weekly pattern in Settings, a Fill the calendar button,
and the services themselves) and two setup steps before any value. It is one idea now.

### HRT-68 and HRT-69, how to test them

1. **Repeats are a choice now.** Add a service and pick: does not repeat, every week, every two
   weeks, every month. Monthly means the same weekday of the month, so a second Tuesday stays a
   second Tuesday rather than drifting onto a Saturday.
2. **A month with no fifth Sunday simply has none.** Moving it to the fourth, or to the next month,
   would invent a service the church never said it holds.
3. **An end date.** A Lent course that runs six Wednesdays stops on its own. The end date only
   appears once something repeats, because an end date on a one-off asks about something that
   cannot happen. An end date before the first date is refused.
4. **Fortnightly counts from the first date**, however far ahead you look, so the parity never
   slips when you page forward a year.
5. **One month at a time.** Arrows move a month, and "This month" comes back. The list used to be
   every service the church had ever held or scheduled, which is fine in week one and thousands of
   rows in year three.

### HRT-51, how to test it

Two lists at the top of Services: **New lately** and **Not seen lately**.

1. **Tick somebody at three services, then stop.** After three held services without them, they
   appear in Not seen lately with how many they missed and when they were last there.
2. **Cancel one of those services.** They drop off, because a Sunday the church cancelled is not a
   Sunday anybody missed. A church that cancelled for snow must not accuse half its congregation of
   drifting the following week. This is R7.6's acceptance criterion.
3. **Somebody who has never attended is not in the list.** They have not stopped coming, and putting
   them there buries the people who have.
4. **Two services on one day count once**, the same as a visit does.
5. **The threshold is three** and lives on the church record, ready to be changed per church.

Both lists link straight to the person, and the pipelines in R5.3 will read the same two queries.

### HRT-50, how to test it

On a service's "Who was here" screen.

1. **Tick somebody who has never been.** A "First time" badge appears beside them, and a count of
   how many are new shows at the top.
2. **Tick them at the next service.** "Second time".
3. **Untick their first visit.** The badge on the second service becomes "First time". Nothing is
   stored on the person: the number is counted from the record every time it is asked, so a
   correction, a missed service added later, or a year of imported history all give the right
   answer. A flag written at the time would be wrong at all three.
4. **Two services on one Sunday count as one visit.** Somebody at the 09:00 and the 11:00 on their
   first Sunday is first-time at both. They turned up once.

The Monday morning list, and the pipelines in R5.3 that read it, use the same query.

### HRT-49, how to test it

On Services, a past service has a "Who was here" button.

1. **Tick names.** The tick appears the moment you press, and the write goes behind it. A press that
   fails puts the tick back and says so, because showing it saved when it did not is worse than
   being slow. No page reloads at any point.
2. **The acceptance criterion is 120 people in under three minutes on a tablet.** Rows are large,
   because this is done standing up by somebody holding a tablet in one hand.
3. **Search narrows the list**, and "Mark everyone shown" acts on what the search left. That is how
   a whole household or a whole surname goes in one press.
4. **Press the same name twice quickly.** Nothing breaks, because the write is idempotent in both
   directions.
5. **Untick to correct a mistake.** There is no absent record: absence is the lack of a record, so
   a correction is a delete and the audit log catches it like any other write.
6. **A cancelled service refuses ticks.**

Headcounts and named attendance are separate on purpose. A church that only ever counts heads is
finished at HRT-48 and is never asked for names.

### HRT-48, how to test it

On Services, a service that has already happened has a Count button.

1. **Count.** Adults, children, visitors, and a note. The total appears in the Attendance column.
2. **Leave a box empty.** Empty means nobody counted. Zero means nobody came. They are kept apart,
   because a year of attendance reports rests on the difference and a clipboard cannot tell them
   apart.
3. **A cancelled service has no count**, and the query layer refuses one if you reach for it.
4. **A service still to come has no Count button.** There is nothing to count yet.

Three numbers and a note is the whole of attendance for most churches this size, and the product
does not ask them for more.

### HRT-46, how to test it

It asks for nothing. No email, no password, no account, and no Supabase setting to turn on. A demo
that starts with a sign-up form is a demo for the people who were going to sign up anyway.

1. **Sign out.** On the landing page, press "See a demo" in the top right.
2. **A church of your own arrives**, named Fairview Church, with twenty-one people,
   households, tags, milestones and relationships. It takes a few seconds to build, and the button
   says so while it works.
3. **Every page says it is a demo**, in a strip above the header, with when it disappears and a way
   to create a real account.
4. **Press everything.** Archive people, merge them, remove the lot. It is your church and nobody
   else's, so nothing here can reach a real one.
5. **Press it twice**, from two browsers. Two separate churches, each with one member.
6. **The pass cannot be turned into a way in.** It is a signed cookie naming the throwaway church.
   Rewriting it fails the signature, and even a correctly signed pass naming a real church is
   refused, because the lookup takes only a church with a demo expiry in the future. Four tests
   cover that, including the expired case.
7. **It goes away.** Demo churches are swept when they run out, which happens on the way in to the
   next one, and a church without an expiry is never swept.

This is where the sample data lives now. It is reachable from nowhere inside a real church.

### HRT-31, what it is now

The data set and its loader exist, with five tests. **Nothing in the product calls them.**

A church that signs up has real records, and a button that pours twenty-one invented people into
their directory is one press away from a giving statement addressed to somebody who does not exist.
Fake data belongs somewhere obviously not theirs.

So the way in is HRT-46: a demo somebody can look at before they have an account at all. Until that
exists the loader is reachable only from a script.

### HRT-32, how to test it

Churches used to exist only because the seed script made them. Now anyone signed in can start one.

1. **From nothing.** Sign out. Sign in as `founder@newchurch.example.org` on the Password tab. You
   land on "Choose a church" with "Create a church account" as the main action.
2. **Create it.** Name it. The timezone is already filled in from your browser. You arrive in your
   own church as its owner, with an empty directory.
3. **The slug.** A church called "St. Mark's Riverside" becomes `st-marks-riverside` in the URL.
   Name a second one the same thing and it gets a `-2`. Call one "Settings" and it becomes
   `settings-church`, because route words are reserved.
4. **Isolation.** Add a person to the new church. Sign in as `pastor@riverside.example.org` and
   confirm they are nowhere in Riverside. Then try `?church=<your new slug>` as the Riverside
   pastor: refused, exactly like a church that does not exist.
5. **Existing members.** The same button is on the chooser for someone already in a church, as a
   secondary action rather than the main one.

### HRT-70, how to test it

Services, with a month showing.

1. **Three shapes.** The control beside the month name switches between list, calendar and tiles.
   The month arrows and "This month" keep whichever is showing, and so does a bookmark.
2. **The grid.** Every service is a chip on its day, coloured by state, and today has a ring.
   A chip opens the same buttons the list row has: the roster, the count, edit, cancel.
3. **A month with nothing in it.** The calendar still draws. The list and the tiles say so.
4. **Add a service.** Repeats starts at "Does not repeat", and the end date appears once it repeats.
5. **The time field.** It offers 9:00 AM rather than 09:00, opens near nine in the morning rather
   than midnight, and takes "9", "9am", "9.30pm" or "21:30" typed.
6. **The date field near the bottom of the screen.** Open the calendar with the dialog low in the
   window. It opens upward and stays on screen.
7. **The month and the year.** Press "September 2026" in the calendar header. A grid of months
   appears in the same panel, and pressing the year again gives twelve years at a time. Nothing
   opens an operating system menu, and nothing leaves the window.

### HRT-54, how to test it

Settings, then Rooms. Owner or Admin only.

1. **Create one.** Nursery, birth to 2 years, holds 12, one volunteer per 4. The age boxes take
   months or years, so a nursery can be written in months and a kids room in years.
2. **What it refuses.** An oldest age below the youngest. A capacity of zero. A second room called
   "nursery" when "Nursery" exists.
3. **What it allows.** A room with no ages, no capacity and no ratio. A church that has not decided
   is not made to.
4. **The colour.** It prints on the child's label and the guardian's, so a volunteer can send a
   parent to the right door by colour. Pick one per room and keep them apart.
5. **Order.** Move a room up and down. The station shows them in this order.
6. **Archive.** The room leaves the list and comes back with Restore. Nothing that points at it
   moves.

The suggestion itself has no screen yet, because there is no station yet. It is covered by tests:
inclusive at the youngest age, exclusive at the oldest, so 0 to 24 months and 24 to 48 months tile
with no month belonging to both rooms or to neither, and an overlap goes to the narrower room.

### HRT-55, how to test it

Settings, then Stations. Owner or Admin only.

1. **Create one for each device.** A foyer desk a volunteer runs, a kiosk families use themselves,
   a tablet carried around, and the family's own phone. There is one phone station a church, since
   there is one household flow and two configurations of it would be two answers to one question.
2. **What it may touch.** Tick rooms and services, or tick none, which is every room and every
   service. A church with one desk never has to think about it.
3. **The device.** Open Check-in in the header. The device asks which station it is, once, and
   remembers. It is stored on the device, so two tablets signed in as the same volunteer are two
   stations.
4. **Retire one.** Archive the station, then reload Check-in on the device pointed at it. It asks
   again rather than carrying on against a configuration nobody maintains.

The check-in flow itself is HRT-56 onward. This story is the configuration those read.

### HRT-72, how to test it

The landing page, then "See a demo".

1. **It opens.** The wait used to be the time it takes to build a church. Two are now built and
   waiting, so pressing the button is a lookup.
2. **Press it again in another browser.** A second visitor gets a second church, never the first
   visitor's.
3. **Press it a third time.** The pool is empty by then, so that one is built while you wait, which
   is the old behaviour and the reason the pool exists. The one after that is quick again.

### HRT-282, what it is for

The pool from HRT-72 holds two churches and is topped up on the way in, so in practice a visitor
still waits while one is built. The demo is to be taken as a whole: how a church gets there before
anybody asks for it, how many are kept standing, what fills them, and how they are swept.

The demo tests in `packages/db/tests/demo.test.ts` and `demo-church.test.ts` are skipped until then,
and come back against whatever this leaves.

### HRT-56, how to test it

Check-in in the header, with a station claimed and a service on today.

1. **Find a family.** Type a surname, a first name, what a child is called, or the last four digits
   of a phone number. Punctuation in the stored number makes no difference.
2. **The whole household comes back**, children first, youngest first, which is the order the desk
   works in. Typing a parent's number gets their children, because the children are what the
   station is for.
3. **Rooms are filled in** from each child's date of birth, and every one of them can be changed.
   An adult takes a name badge and no room.
4. **One press.** Everybody ticked goes in together. Press it again and nothing doubles: the room
   a child was sent to first stands, since somebody has already been told where to find them.
5. **Undo.** A child checked in by mistake comes off in one press, and the attendance mark goes
   with them.
6. **The room fills.** Set a room capacity of one in Settings, check two children into it, and the
   second shows the room as full.

The label, the security code and the checkout are HRT-57 and HRT-59. **This station cannot run a
real Sunday until those are in**, because no child should be released on anything weaker than a
code.

### HRT-57, how to test it

The desk, with a child checked in.

1. **Two labels a child.** One for the child, one for whoever collects them, carrying the same code.
   The code is the biggest thing on both, because it is what two people who have never met compare
   across a counter.
2. **The code is readable.** No O beside 0, no I or L beside 1, no S beside 5. Whatever is printed
   is what somebody types back.
3. **Codes do not count up.** Check in several children and compare. One code says nothing about the
   next, which matters because anybody in the queue can see a label.
4. **An adult gets no code.** A name badge is not a claim on a child.
5. **Press check in twice.** The child keeps the code they already have. Two codes for one child is
   two labels that do not match each other.
6. **Say the labels did not print.** The check-in goes back, because a child marked present with no
   label in a parent's hand cannot be proved to belong to whoever comes for them.

Brother QL and Dymo are HRT-61. This prints through the browser, which is every printer a church
already owns.

### HRT-73, how to test it

Settings, then Stations. Set a station's mode to "Families use it themselves", and open Check-in on
a device pointed at it.

1. **Everything is bigger.** Station density: thumb-sized targets and text readable at arm's length
   from a stand.
2. **Rooms are buttons, not a menu.** A parent reads four room names at once faster than they open a
   dropdown.
3. **Nothing a parent has no business touching.** No undo, no other household on screen once they
   have chosen theirs, no way further into the church's records.
4. **It clears itself.** Twenty seconds after a family finishes, the screen is empty again, so the
   last family's children are not left on a screen in the lobby.
5. **The counter desk is unchanged.** Set the mode back to "A volunteer runs it" and the desk
   returns.

### HRT-58, how to test it

A child's record, then the desk.

1. **Record one.** Open a child, Health, Allergies: "Peanuts". A medical note holds anything else a
   room needs, such as an inhaler.
2. **It is impossible to miss.** Check that child in. The allergy fills a red banner above the
   button, and the button does not work until somebody has pressed "I have read this". A volunteer
   finishing a check-in without having seen it is the failure the requirement exists to stop.
3. **It prints.** The child's label carries it.
4. **A child with nothing recorded shows nothing at all.** Silence means nobody has written anything
   down, and a screen saying "no allergies" would be claiming something the church was never told.
5. **The kiosk does the same**, because a parent checking their own child in reads it too.
6. **Editing it is audited**, like every other change to a person.

### HRT-59, how to test it

Check a child in, then find the family again.

1. **The code releases them.** Type what is on the guardian's label. Spacing and case are forgiven.
2. **A wrong code releases nobody.** So does an empty one.
3. **Who is collecting.** The list is anybody recorded as a guardian or emergency contact, plus
   anybody who lives in the household. A church that had to name every parent before a Sunday works
   would stop keeping the list, and a list nobody maintains protects nobody.
4. **Somebody not on the list is stopped**, holding the right code.
5. **A restriction stops the person it names**, code or no code, and it is asked about before the
   code so the conversation happens once rather than twice.
6. **Every stop can be passed**, and passing one costs a sentence saying why. The sentence, the
   child, what was passed and who decided are written down and cannot be edited afterwards.
7. **Twice is refused.**

Record a do-not-contact between a child and an adult in their household to see the custody case.
The product refuses to record that person as a guardian at all once the order exists, so the
household is the only way the two facts can sit together.

### HRT-74, how to test it

A day with two services on it, such as Riverside's 30 September.

1. **The dropdown says which is which.** Name and time, since two services called "First" and
   "Second" tell a volunteer nothing about which one is on.
2. **It opens on the one happening.** Before the first, the first. During it, that one. After the
   second has started, the second. A service that finished hours ago is let go of, and the nearest
   one is offered instead.
3. **A day with nothing on it** says so, and offers no way to check anybody in.

### HRT-75, how to test it

1. **Search by person.** Type three letters of a first name at the desk. The rows are people, with
   the household on a quiet second line. Tap a row and the whole family opens, the way it did.
2. **Surnames.** Type a surname. Every person who has it is a row of their own.
3. **The start of a name.** "hoa" finds no Ochoas. "och" finds them all.
4. **Speed.** Type a name, then backspace. The earlier answer is there at once.

### HRT-60, how to test it

Use a real tablet or a second browser window, and the browser's own offline switch (DevTools,
Network, Offline). The station has to be claimed and a service chosen while the network is up, so it
has something to carry.

1. **It says so.** Turn the network off. The bar appears and says there is no network.
2. **Search still works.** Type a name. It comes back from what the station pulled down.
3. **Check in.** Check a family in. The labels window opens and prints, with a code on each pair.
   The bar now says how many are waiting.
4. **Reload it.** Reload the page with the network still off. The station comes back rather than the
   browser's error page, and the waiting count is still right.
5. **Check out.** Collect one of them. The code is asked for and checked, the pickup list is the one
   the station pulled down, and a person not on it is still stopped.
6. **Reconnect.** Turn the network back on. Within a few seconds the waiting count goes to zero.
   Open the service on another device: every check-in is there, with the codes that were printed,
   and the times are when they happened rather than when the wifi came back.
7. **A conflict.** With the station offline, check a child in. On another device, check the same
   child into a different room. Reconnect. The station reports it and leaves the record alone.
8. **Codes.** Check in forty children offline. They all get codes, all different, and none of them
   collides with anything the online desk issued.

### HRT-61, how to test it

The station's **Labels** setting picks the stock, so set it before printing.

1. **Plain paper.** Leave it on plain paper, check a child in, and print. The pairs are tiled on the
   sheet with a dashed line to cut along. This is the answer for a church with no label printer, and
   it should look like one rather than like a fallback.
2. **Brother QL.** Set it to Brother QL and print to a PDF. Each label is its own page, 62mm by
   40mm, edge to edge with no margin. On a real QL with DK-22205 tape it comes out the width of the
   roll.
3. **Dymo.** Set it to Dymo and print to a PDF. 89mm by 28mm, and the code sits beside the name
   rather than under it, because 28mm is not tall enough for both.
4. **The code.** On all three, the code on the child's label matches the one on the guardian's, and
   it is the largest thing on the label.
5. **The allergy.** A child with an allergy recorded has it on their own label, and not on the
   guardian's.

### HRT-62, how to test it

**Kids classes** is in the header. It is the person walking the corridor, not the desk.

1. **Counts.** Check two children into a class from the desk. Its card shows two, and the
   outstanding count at the top matches.
2. **The roster.** Tap the card. It opens in front of the board, scrolling inside itself, so a
   class of thirty does not push every other class off the screen.
3. **Capacity.** Fill a class to its capacity: it says full. One more: over capacity.
4. **Print.** Print inside the roster opens that class's sheet and the printer dialog: names,
   codes, allergies, and who has been collected, for the wall.
5. **It keeps up.** Leave it open and check a child in from another device. Within twenty seconds
   the board moves on its own.

### HRT-63, how to test it

**Incidents** is in the header for Owner, Admin and Pastoral, and for nobody else.

1. **File one.** Open Kids classes, tap a class, and press Report an incident against a child. Write
   what happened and what was done. It says, once, that a report cannot be edited or deleted.
2. **Who can write one.** Sign in as a check-in volunteer and file one from the station. It saves.
3. **Who can read them.** As that same volunteer, there is no Incidents link, and going to the URL
   says to ask an admin. A report names other volunteers and sits beside other children's, so
   writing one and reading them are different permissions.
4. **The guardian.** A new report shows Guardian not told. Press the button on the Incidents screen
   and it records the moment. Pressing again does not move it.
5. **It is kept.** There is no edit and no delete anywhere, deliberately, including for an Owner.
6. **It is audited.** The report appears in the audit log like every other write.

### HRT-83, how to test it

**Groups** is in the header.

1. **Types.** A church starts with five: small group, ministry team, class, committee, other. They
   are what the Type picker offers.
2. **Create one.** Name, what it is for, type, day, time, how often, where, and how many it holds.
   Everything except the name is optional, so a group with no pattern saves.
3. **Open it.** Tapping a group opens it with its roster in front of the list.
4. **The roster.** Search a name the way you do at check-in, choose leader, co-leader or member, and
   add them. Leaders sort to the top of the roster and their names show on the card.
5. **Adding twice.** Adding somebody already in the group moves their role rather than listing them
   twice.
6. **Removing.** Remove somebody. They come off the roster. The record of their time in the group
   stays, which is what makes a year of discipleship readable later.
7. **Archive.** Archiving takes it off the list and keeps its roster. Restore brings it back.
8. **Roles.** A member cannot create or change a group.

### HRT-84, how to test it

This one is a boundary, so test it by trying to get past it. You need a person record linked to a
signed-in account, and that account given the group_leader role.

1. **The directory.** As a group leader, Directory shows the people in the groups you lead and
   nobody else. The count under it matches what is listed.
2. **By URL.** Open a person who is not in your group by their id. It says not found, rather than
   showing them.
3. **By export.** Press export with a filter. The CSV contains your group and nobody else.
4. **Following the roster.** Remove somebody from your group. They leave your directory. Add them
   back and they return.
5. **Leading nothing.** A group leader who leads no group sees only themselves.
6. **Everybody else.** An owner, admin, staff, pastoral or check-in volunteer sees the whole church,
   exactly as before.

### HRT-85, how to test it

Open a group and press **Attendance**. Use a phone if you have one to hand, since that is what it is
built for.

1. **The day.** It opens on the group's own meeting day counting back from today, so recording on
   Wednesday offers Tuesday. Change the day and it loads that meeting.
2. **The default.** Everybody on the roster starts present. Tap the two or three who were not there
   and press save. That is the whole interaction: for twelve people with four missing it is four
   taps and a submit.
3. **Coming back to it.** Reopen the same day. It shows what was recorded rather than everybody
   ticked again, so fixing one name does not re-tick the room.
4. **It did not meet.** Press it, then save. The meeting is recorded as not held and the names are
   cleared, because a group that was cancelled and a leader who forgot should not look the same.
5. **The history.** Under the sheet, the last eight meetings with how many came.
6. **Who can.** A group leader can record for their own group and is refused on anybody else's. A
   member cannot record at all.

### HRT-86, how to test it

**Find a group** is on the Groups page.

1. **Browse.** Every listed group, with the day, time and place. An unlisted group is not there.
2. **Filter.** Type, day and where. "hall" finds The Hall, since people type what they say.
3. **Ask.** Press ask to join. The card changes to Asked. Pressing again does not make a second
   request.
4. **Browsing by kind.** The groups sit under their kind, each with the church's own words for it
   and how many are open. Filter by day, who it is for, online, children welcome, or type in the
   box: it searches the name, the description and the place.
5. **A closed group.** A group that is not taking requests says so instead of offering the button,
   and it is still listed, because somebody looking for a Tuesday group should see the church has
   one. Untick "include closed and full" to drop them.
6. **Answer it.** As the leader of that group, the request is at the top of the same screen. Approve
   puts them on the roster in the same press. Check the group's roster to see it.
7. **Decline.** The answer is kept, and the person sees it on the finder.
8. **Somebody else's group.** A leader is only offered the requests for groups they lead.

**Not built yet:** the email telling them either way. Messaging runs on the church's own provider
(R9.8, HRT-87), so until that lands the finder is where they see the answer. The queue of answers
nobody has sent is already a query, so sending them is the only part left.

### HRT-90, how to test it

From **Groups**, tap a group's name.

1. **The page.** Its kind in the breadcrumb, the name, and a bar saying whether it is open with the
   way to ask beside it.
2. **About.** The group's own description, in full, rather than the three lines the card shows.
3. **Categories.** Day, kind, who it is for, online, children welcome, and where, as chips.
4. **Schedule.** "Meets weekly on Tuesdays, 7:30pm to 9:00pm", written the way somebody says it.
5. **Next meetings.** The next three dates, worked out from the pattern. A fortnightly group skips a
   week. A monthly group stays on the same weekday rather than the same date, because "the first
   Tuesday" is what monthly means to a church.
6. **Last met.** The meetings that were actually recorded, with how many came. A group whose leader
   has recorded nothing shows nothing here, which is the honest answer.
7. **Where.** Tuesday night has an address: it shows, with a directions link that opens a map.
   Welcome team has one too. Membership class has none, and that section is simply absent.
8. **Asking.** Ask to join from this page. The bar changes to Asked, and the request reaches the
   leader on the finder.

### HRT-201, how to test it

The shell. Every staff screen now sits in it, so the thing to look for is a screen that looks wrong
rather than a feature to try.

1. **The sidebar** is down the left on a desktop. The entry for the screen you are on is white with a
   hairline shadow; the rest are grey.
2. **Collapse it** with the button beside the ConnectApp mark. It becomes a 64px rail of icons. Hover any
   icon and its words appear. Reload: it is still collapsed, because the width is in a cookie and the
   server renders it that way with no flicker.
3. **The top bar** carries the page title and one filled button, the one that belongs to that page.
   On People it is Add person. Import, Celebrations and Print moved down onto the page.
4. **Narrow the window under 768px.** The sidebar goes and five tabs appear along the bottom. The
   page keeps room underneath so its last control is reachable.
5. **Your name and role** sit at the bottom of the sidebar and open Settings. Sign out is underneath
   rather than beside it.
6. **Check-in**: pick a station and the screen goes full screen with no navigation, light palette,
   station density. "Change" brings the shell back.
7. **The member home** (sign in as a member, or open `/home`) runs at portal density inside the same
   shell, with the church's colour under the top bar.
8. **Names match the design.** Directory is now **People**. Add someone is **Add person**. Possible
   duplicates is **Duplicates**. Order of service is **Service plan**. Incident reports is
   **Incidents**. Birthdays and anniversaries is **Celebrations**. Kids classes is **Room rosters**.
   Live is **Live service**. The full table is in docs/redesign/README.md.
9. **Deep screens** still work: a person, a group, a service plan, a team's schedule, a follow-up
   pipeline, a form builder. Each shows its own name in the top bar.

### HRT-149, how to test it

Conditional logic. One condition per question: an earlier answer, a test, a value.

1. On a form, add **Are you new here?** as **Choose one** with the choices Yes and No. Then add
   **How did you hear about us?** and set **Show it when** to that question, **is**, **Yes**.
2. **As it will be read** is answerable now. Pick No: the follow-up is not there. Pick Yes: it
   appears. Switch back to No and it goes again.
3. The row in the builder says **Shown when Are you new here? is Yes** under the question.
4. Put a third question under the second one, waiting on the second one's answer. In the preview it
   appears only when its parent is both shown and answered the right way, so a branch under a branch
   behaves.
5. The tests offered are **is**, **is not**, **is answered** and **is blank**. The last two ask only
   whether anything was put in, so they need no value.
6. **Show it when** only lists questions above this one, and never a heading.
7. A choose-one question's condition offers its choices as a dropdown rather than free text.
8. Move a question above the one it waits on. The row turns red, the banner at the top says a
   question is waiting on an answer nobody has given yet, and **Open it** is refused. Move it back
   and the form opens.
9. Remove the question a condition waited on. The condition comes off and the follow-up is simply
   always shown.
10. A required question inside a hidden branch is not required of somebody who never saw it. Leave
    the branch closed and the form still sends.

### HRT-148, how to test it

The public link is HRT-150 and submissions are HRT-151. This is the writing.

1. **Forms** is in the main navigation for Owner and Admin. **New form** asks for a name and opens
   the builder.
2. **Add a question** offers all nine kinds: short answer, long answer, number, date, choose one,
   choose several, yes or no, a file, and a heading.
3. **As it will be read** underneath shows the form the way its reader will meet it, updating as you
   write. A required question carries the red asterisk there too.
4. A heading can never be required. Tick the box on one and it saves as not required.
5. **Choose one** and **Choose several** ask for choices, one per line. Paste a messy list: blanks
   and duplicates are dropped and the order is kept.
6. **Open it** is refused while the form asks nothing, or while a choice question has no choices. The
   banner says which.
7. Up and down reorder a question. Removing one asks first.
8. **Close it after this many** takes a number, and refuses zero.
9. **Archive it** closes the form as well as archiving it, and it leaves the list. Bringing it back
   restores it as a draft rather than silently reopening.
10. Only Owner and Admin see any of it.

### HRT-89, how to test it

Sign out first, or use a private window. The whole point is that it works with no account.

1. **/g/<your church slug>**, for example `/g/riverside`. The church's groups, with its own colour
   across the top.
2. Only groups marked listed appear. Unlist one in the app and reload: it is gone. Archive one: gone.
3. A card opens **/g/<slug>/<group id>**, which a church can link to directly from its own site.
4. What is published: the name, what it is, when and where, who it is for, roughly how big it is, and
   whether it is taking people. No leader names and no roster. Naming a volunteer on the open web is
   a different act from naming them inside the church, and not one a church asked for.
5. A church nobody has looked at yet publishes nothing at all, the same rule as its join link. A slug
   that names nothing is a 404, and so is a demo church.
6. The picture from HRT-88 shows here too, through a link signed for an hour.

### HRT-88, how to test it

1. Open a group. **Add a picture** takes PNG, JPEG or WebP up to 5 MB, through the same upload path
   as everything else, so the type, the size and the quota are all checked before a byte is written.
2. The picture sits across the top of the card in the group finder, which is what it is for: a
   photograph of eight people round a table says what a paragraph cannot.
3. **Settings → Church** shows the storage bar move.
4. Replace the picture four times. The bar does not move four times: the old file is forgotten from
   the ledger and deleted from the bucket, so four tries cost one picture.
5. **Remove** takes it off the group and out of the bucket.
6. A PDF is refused, and so is anything over 5 MB.
7. Only whoever can change the groups sees the buttons. Everybody else sees the picture.
8. The bucket is private, so every picture is served through a link signed for an hour.

### HRT-43, how to test it

Change the colour in **Settings → Church** first. Twelve hues, matched for lightness and chroma, so
one can be swapped for another without anybody rechecking contrast.

1. A rule in that colour across the top of the surfaces a church hands something out on: the
   member's home, the printed directory, the printed order of service, the printed room roster, and
   the page a volunteer opens from a serving request.
2. Not on the admin screens. There the person is working in the software rather than receiving
   something from the church, and a repainted interface would be decoration.
3. Open a serving request link signed out. It carries the church's colour, which is the one branded
   surface with no session behind it.
4. Change the colour and reload. Everything follows, including the link already sent out.
5. The printed rule survives printing: it is sized in millimetres for the sheet.

Also fixed here: the team colour dot on the order of service referred to `--hue-teal`, which is not
a token. The shades are `-100`, `-500`, `-700`, `-900`. It was showing nothing.

### HRT-122, how to test it

1. **/trust** opens signed out, linked from the foot of the landing page. A church decides whether to
   trust us before it has an account, so a page behind a sign-in cannot answer the question.
2. Five promises, each saying what holds us to it rather than asserting it: the licence, an export we
   depend on ourselves, a test that fails the build, ninety days of notice, giving that never passes
   through us.
3. **Who else touches your records** names Supabase, Vercel and Stripe, and what each does.
4. The structural half has no screen. `packages/db/tests/no-model-training.test.ts` fails the build
   if any package whose purpose is calling a model appears in any manifest, or if any model endpoint
   appears anywhere in the source. Add `openai` to a package.json and watch it fail, then take it out.
5. It also checks the promise is still on the trust page, so the page cannot quietly drift from the
   rule the test enforces.

### HRT-121, how to test it

The deliverable is the drill, not the backup setting: an untested backup is not a backup. The
runbook is [docs/backup-and-restore.md](docs/backup-and-restore.md).

1. `pnpm --filter @connectapp/db census riverside` counts every row of every table that church holds,
   biggest first.
2. `--out before.json` writes it. `--against before.json` compares a fresh census with it, exits 0
   when every table matches and 1 when it does not, naming the table.
3. Change one thing and run it again. It says which table and whether the count or the rows
   themselves differ: the digest catches the right number of the wrong rows.
4. Tables are found by looking for a `tenant_id`, so a table added next quarter is in the next drill
   without anybody remembering it.
5. The runbook has the restore steps, the drill log, and the two things it does not cover.

Nothing writes while a census runs, including the test suite. Several suites mutate the seeded
development churches, so a census taken during a test run will disagree with itself.

**Point-in-time recovery is a paid Supabase add-on** and is not on yet. That is the one call here
that costs money and is yours to make. The runbook argues for keeping it on and says why.

### HRT-115, how to test it

Create a church from the sign-up form. Every church that existed before this story was approved when
the migration ran, so your own church is unaffected.

1. A new church carries a banner on every page saying it is being checked, with how many of its 25
   people it holds.
2. It works completely otherwise: add people, services, groups, teams, run a check-in.
3. **Settings → Team**: the join link is refused, and so is inviting anybody. Both say the same
   thing, that it opens once somebody has looked at it.
4. Add people up to 25. The twenty-sixth is refused, and an import that would go past it in one go
   is refused as a whole rather than half-landing.
5. `pnpm --filter @connectapp/db approve` lists what is waiting: the church, who made it, how many
   people, how old it is.
6. `pnpm --filter @connectapp/db approve <slug> <your name>` approves it. Reload: the banner is gone, the
   cap is gone, the join link works and invitations send.
7. `pnpm --filter @connectapp/db approve --revoke <slug>` puts it back, and the join code already handed
   out stops working.

### HRT-111, how to test it

The UI is single-campus on purpose. There is no campus picker anywhere, and there should not be.

1. **Settings → Church** has **Where you meet**: the campus name, and the places inside it.
2. Rename the campus. It saves when the field loses focus and carries the red asterisk.
3. **Add a place** names one: "The Hall", "The Annexe". Extra spaces are collapsed, a duplicate name
   is refused, and the pencil renames one.
4. **Delete** asks first and says that anything recorded as meeting there keeps its own words.
5. Only Owner and Admin see the buttons. Anybody else sees the list.
6. The part with no screen: add a person, a service or a group, and the record carries the campus
   without anybody choosing one. A database trigger fills it, so the importer and the seed script
   get it too. Records written before this story were backfilled when the migration ran.

### HRT-134, how to test it

1. **History** sits at the foot of the order of service, newest first.
2. Add an item. It reads "Added <title>". Take one off and it still names it.
3. Change an item's length and it reads "Changed the length on <title>", naming only what moved.
4. Fill in the series and the theme and it reads against the plan itself.
5. Add a note and it is listed by the note's first words.
6. Each line carries who did it and when. A church member with no name on their account shows their
   role instead.
7. Run the gathering through live mode, then reload. The history is the same length it was, because
   advancing through twenty items would otherwise bury every real change.

### HRT-133, how to test it

Open it on two devices, signed in as the leader on one and as a member on the other.

1. **Live mode** is on the service's More menu in the calendar, and at the top of the order of
   service.
2. **Start** puts the gathering on the first item. The leader sees Back, Next and End. The member
   sees the same screen with no buttons.
3. The current item is the largest thing on the screen, the next one under it, with the item clock
   counting up and the whole gathering's drift beside it. Running past an item's planned length
   turns the clock red, and running late turns the drift red.
4. **Next** on the leader's device moves the member's device within a few seconds.
5. Pressing an item in the list below jumps straight to it, for when the order changes on the floor.
   A member pressing it does nothing.
6. **Back** at the first item stays there. **Next** at the last item ends the gathering.
7. **End** clears it. Reopening reads Not started, and the plan still has every item on it.
8. Starting a plan with nothing on it is refused.

### HRT-132, how to test it

1. **Print** on the order of service offers two versions, each opening in a new tab on the printer
   dialog.
2. **The full order** is what the team runs from: the clock down the left, the kind and the
   description under each title, the notes with who they are for, the minutes down the right, the
   time it ends, and Who serves at the foot with each position and who is in it.
3. A declined request is left off the printed roster, because the sheet is a list of who is there.
4. **For the bulletin** is the titles in order, under the service name, the date, the series and the
   theme. No times, no minutes, no notes, no roster.
5. Both come out with no browser header or footer across the page, so there is no URL printed on the
   sheet handed out.
6. Print is disabled while the plan is empty, and the pages are refused to anybody below Staff.

### HRT-131, how to test it

1. **Who serves** sits under the order of service, listing each team that has a position to fill,
   with the team's colour beside its name.
2. Each position reads filled of needed, in red while it is short, and the card header counts how
   many are still wanted across the whole gathering.
3. The plus against a position offers the team's roster, whoever plays that position first, with
   away and due-a-break warnings the same as the serving screen.
4. Somebody put down here shows as Pending and appears on their own serving list. The chain icon
   copies the same answer link.
5. Open that link and accept. The plan reads Accepted. Decline instead, and the position reads
   short again while the declined name stays, so the leader knows it was asked and answered.
6. Taking somebody off here takes them off the serving schedule too.

### HRT-130, how to test it

Have a plan with a few items on an earlier service first, so there is something to copy.

1. **Start from** on the order of service lists earlier plans, newest first, with the number of
   items and the minutes beside each. Picking one adds its items to this plan.
2. What comes over is the kind, the title, the length and the order. The description, the notes and
   the files stay with the week they were written for.
3. The plan copied from is untouched. Its notes and files are still on it.
4. Copying again adds another set after the first, so nothing already on the plan is lost.
5. **Save as a template** names this plan's shape. It then appears under Templates in the same
   **Start from** menu, and applying it does the same thing.
6. Saving again under a name already used replaces that template rather than making a second one.
7. The dialog lists the saved templates, each with a pencil to rename and a bin to delete. Deleting
   leaves the plans built from it alone.
8. A blank template name is refused, and so is saving an empty plan as a template.
9. Only Owner, Admin and Staff see any of it.

### HRT-129, how to test it

1. The paperclip against an item attaches a file. PDFs, images, mp3, m4a, ogg, wav and plain text.
2. It appears as a chip under the item. Pressing it opens the file in a new tab through a link
   signed for an hour, because the bucket is private.
3. Video is refused, and so is anything over 10 MB. Settings → Church shows the storage bar moving.
4. The x on a chip removes the file from the item, from the ledger and from the bucket, so a church
   is not paying quota for something nothing points at.
5. Attaching the same file twice to one item is refused.
6. Only Owner, Admin and Staff can attach.

### HRT-128, how to test it

Schedule a few people onto the service first. The audience for a note is read from the schedule, so
a position nobody is filling is not offered.

1. On the order of service, the speech-bubble icon against an item writes a note.
2. **Who it is for** offers Everybody, each team on the schedule, each position being filled, and
   each person scheduled, with what they are doing beside their name.
3. The note appears under the item, with the audience in bold ahead of it.
4. A note addressed to a position carries its team too, so the drummer's note is also worship's.
5. Swap who is playing drums. The note follows the position, so it is the new drummer's.
6. A blank note is refused, and the field carries the asterisk.
7. The x against a note takes it off.

### HRT-127, how to test it

On **Services**, press **More** against any service and choose **Order of service**. A past service
also has it on its own page, beside the roster.

1. The plan is created when you open it. A service you never open has none, which keeps a year of
   generated services out of every list and every export.
2. **Add an item**: a kind, how many minutes, what it is, and a description.
3. Every item shows the clock time it starts at, counted from the service's own start. The heading
   says what time the plan ends and how many minutes it runs.
4. Change the sermon from 25 to 35 minutes. Everything below it moves, and the end time moves with
   it.
5. The arrows move an item up and down, and the clock follows. They are disabled at the ends.
6. An item can be 0 minutes, for a line on the page that takes no time.
7. **Series** and **Theme** save when you leave the field.
8. A plan that runs past midnight reads 00:30 rather than 24:30.
9. Only Owner, Admin and Staff can open it. Anyone else lands back on the service.

### HRT-124, how to test it

1. On a schedule plan, each person down for a position has a link icon beside their name. Press it
   and the answer link is on your clipboard.
2. Open that link in a private window. It needs no sign-in: the church's name, the service, the team
   and the position, and two buttons.
3. **Yes, I can** records it, and the schedule plan shows an **Accepted** badge. An unanswered
   person reads **Pending**, and the Serving list counts accepted, pending and declined per team.
4. **No, I cannot** asks why and does not insist. The schedule plan shows **Declined**.
5. **Change my answer** goes back to the two buttons, because somebody who said yes on Monday and is
   ill on Thursday has to be able to say so.
6. Change a character in the link: "That link is not valid any more". It says nothing about the
   church or the person.
7. A link for a service that has already happened says so and takes no answer.

### HRT-80, how to test it

Open a team and press **Schedule plan**. Generate a service calendar first if there is none.

1. A **Service** dropdown holds the next six services from today, and the soonest is chosen. Pick
   one and the page plans that one. The choice is in the URL, so the link can be sent on.
2. The chosen service lists the team's positions with "0 of 2" against them, red until the position
   is full.
3. Press **+** on a position. It lists the team's roster, with whoever is marked as playing that
   position first, and a **Plays this** badge against them.
4. Put somebody down. The count goes up and their name sits against the position.
5. Put the same person on another team at the same gathering. It goes through. The dialog says
   "Also on Worship, Keys" under their name, because a leader wants to know where somebody is, and
   serving in two places at one hour is a thing small churches do.
6. That note only appears for a gathering at the same hour on the same day.
7. On a person's record, the **Serving** card now carries **Coming up**, **How often they serve**
   and **Days away**. Add days away covering a gathering, then open the schedule for it: that person
   carries "Away" in the dialog.
8. Set how often they serve to monthly, put them on a gathering, then open a gathering a week later.
   They carry "Served 2027-03-07, asked for Monthly". Set it to weekly and the warning is gone.
9. **Take off** empties the slot and the count drops.
10. A team leader can build the schedule of the team they lead, and gets the same warnings.

### HRT-79, how to test it

**Serving** is in the header. Your church already has five teams, because they came with it.

1. Worship, Production, Welcome, Ushers and Children, each with the positions it schedules. The
   Children card says a background check is required; Production's does not.
2. Open **Children**. Room leader and Helper are marked as working with children and asking for a
   check. Check-in desk is marked as neither.
3. Add a position. Tick **Works with children** and the check box ticks itself. You can untick it,
   which is the church's call.
4. A position name has to be new on that team. "Keys" is taken on Worship and free on Production.
5. Under **Who serves**, type two letters of a name and press the person. They go on the team.
   Press **Positions** against them and tick what they play.
6. **Take off the team** removes them from the list. The row they left behind keeps the date, so
   who was on the sound desk last year stays answerable.
7. Archive a position you added. It comes off the team and off everybody who played it.
8. Open that person's record. A **Serving** card sits above Lists, naming every team they are on,
   the ones they lead, and the positions they play.
9. **Sign in as a team leader** whose record is linked to an account and who is marked Leader on
   one team. They get a Serving link, see only that team, can change its roster, and cannot create
   a team or touch another one. Opening another team's page sends them back to the list.
10. The directory a team leader sees is their own team, the same way a group leader sees their own
    group.

### HRT-27, how to test it

**Birthdays** is a button at the top of the directory, beside Import.

1. It opens on this month. Two tiles count the birthdays and the anniversaries in it.
2. The arrows move a month at a time. **Week** switches to seven days and the arrows move a week at
   a time. **This month** and **This week** come back to today.
3. The age is the one they reach on the day, so somebody born in 1984 reads 42 in October 2026 and
   47 when you page forward to October 2031.
4. An anniversary comes off the marriage milestone. Record one on a husband and the same date on his
   wife, with a spouse relationship between them, and they appear on one row, as "Hana and Idris".
   Record one on somebody whose spouse the church has no record of and they appear alone.
5. Put a birthday on 29 February. In a leap year it reads 29 February. In any other year it reads
   28 February, so the person is still on February's list.
6. Page to a week that crosses new year, such as 28 December. A birthday on 30 December and one on
   2 January are both on it, dated in their own years.
7. Archive somebody with a birthday this month. They come off the list.
8. The whole window is in the URL, so the October list can be sent to whoever writes the cards.

### HRT-120, how to test it

Open anybody's record. **History** sits above Notes.

1. Everything in one order, newest first: added to the church, services they were at, classes a
   child was checked into, groups joined and left, milestones, notes, pipelines entered and
   finished, follow-ups answered, background checks.
2. Joining a group and leaving it are two entries on their own days.
3. The dot carries the colour the group or pipeline already has elsewhere.
4. **Sign in as staff.** The confidential note is gone from the list rather than greyed out: a
   greyed row still tells the office that a confidential note about this person exists. Background
   checks are gone too.
5. Opening the history as Owner or Pastoral writes an audit entry for each confidential note read,
   the same as opening the note itself does.

Giving, serving and communications are not built yet. Each is another block in `timeline.ts` when
it lands.

### HRT-119, how to test it

Directory, the search box. One box, so type whatever you remember.

1. **Part of a surname**, part of an email, or the digits of a phone number with the punctuation
   left out: "5550148" finds "(512) 555-0148".
2. **A street, a town or a postcode** now finds the people who live there, including everybody in
   the household the address belongs to. That is new.
3. **A first name and surname typed together** still works.
4. Nothing matching returns nothing, as quickly.

The budget is the database's own time on the query, measured with EXPLAIN ANALYZE against a church
of five thousand people. It was 1,871ms and is 105ms.

### HRT-117, how to test it

Directory, tick two people, **Merge**.

1. Put one of them in a group first. After the merge the survivor is on the roster with the role the
   other one held, and the archived record is off it.
2. Enter one of them into a pipeline and write a task about them. Both end up on the survivor.
3. Where both were already live in the same group, one row survives rather than two.
4. Where the survivor had left that group before, the other one's membership still moves.
5. Undo the merge from the merge list. Everything goes back to who had it.

### HRT-112, how to test it

At the check-in desk, open a household and tick a child. A **Bag label** box appears beside their
class, and only while they are being checked in, because a bag label with no child to match it
against is a label nobody wants.

1. **Tick it and check them in.** Three labels print for that child rather than two: theirs, the
   pickup one, and the bag, all carrying the same code.
2. **The bag label has no allergy on it.** A bag gets left in a corridor, on a pew and in a car, and
   a child's medical note should not be in any of those places. The child's own label still carries
   it.
3. **Reprint the labels.** The bag label comes back, because the choice is on the visit rather than
   decided at print time.
4. **An adult never gets one**, even if something asks for it: a badge says who somebody is and
   makes no claim on a child, so there is nothing to match a bag against.
5. **Offline.** Pull the network, check a child in with the box ticked, and the bag label prints from
   what the station is holding. It reconciles with the choice intact.

The kiosk does not ask. It is one more decision in a queue of forty families, and the volunteer at
the desk is the one who prints it when a bag actually turns up.

### HRT-110, how to test it

Two kinds, and the difference is the point. A picked list stays exactly who was picked. A rule list
is the directory's filters, stored, and answers itself next month.

1. **A list that answers itself.** In the directory, filter down to visitors with no email. "Save as
   a list" appears under the filters. Name it. It opens, and it is in the sidebar under Lists.
2. **It moves.** Give one of those people an email address and open the list again. They are gone,
   with nobody maintaining anything.
3. **A list somebody picked.** Tick four people and use "Add to a list" in the selection bar. Make a
   new one, or add them to one you already have.
4. **It does not move.** Change one of their statuses and open the list. They are still on it.
5. **Taking somebody off** appears in the selection bar only while a picked list is open, and it
   leaves their record alone.
6. **Rename and archive** are on the bar at the top of an open list. Archiving takes the list off the
   sidebar and touches nobody on it.
7. **Export.** With a list open, the export button gives you that list, not the whole church.
8. **A person's record** shows the picked lists they are on, each one a link back.

A rule list offers no way to put somebody on it by hand, and no count in the sidebar, because the
answer is read when it is opened.

### HRT-116, how to test it

`groups-sample.csv` is in the scratchpad. Import `planning-center-sample.csv` first so the people
exist, then import the group file through the same three steps.

1. **It knows what it is.** The matching step says Group memberships, matches the columns against
   group fields, and the question about duplicates is gone, because a membership row joins a group
   or it does not.
2. **The check** says how many people will be added and which groups will be created, by name.
3. **It creates Tuesday Night and Welcome Team**, puts Maria in as leader, Carlos as a member, Dave
   as a co-leader, and keeps the date each of them joined.
4. **The row for somebody not in the directory fails** and says so, rather than making a person up.
   Two people of one name with no address between them fails the same way: the wrong Sarah in a
   small group is a mistake a church will not notice and cannot see.
5. **Undo it** from the import history. The people come back out of their groups, and the groups it
   created are removed. Join one of them yourself first and that group is kept.

### HRT-102, how to test it

Three sample files are in the scratchpad: `planning-center-sample.csv`, `breeze-sample.csv`,
`churchtrac-sample.csv`. Import, choose one, and the matching step says which system it came from
and has every column already matched.

1. **Planning Center.** Membership becomes the status, and Status is left out, because Status is
   active or inactive and reading it as lifecycle turns every inactive person into a visitor. Mobile
   Phone is taken, Home Phone is left, Created At is dropped.
2. **Breeze.** Family and Family Role become the household and the role in it, Joined Date becomes
   the membership date, and Breeze ID is dropped.
3. **ChurchTrac.** Headers with no spaces at all, so FamilyPosition has to land on the household
   role.
4. **A spreadsheet somebody typed** gets no badge and the ordinary guess, as before.
5. **A column none of them know about** stays unmapped rather than being guessed into a field.

Giving history is R19.6 and belongs to 0.3. Group membership files are HRT-116.

### HRT-114, how to test it

Each church on this machine has a code. Riverside's is **8MWT-P8VE**, at `/join/8MWTP8VE`.
Settings, Team shows it, with the link, a new code, and a switch to turn it off.

1. **Anybody holding the link is in.** Open it in a private window, create an account with any
   address, and you land on the member home. Nobody approves anything: the code is the gate.
2. **An address the church already has** claims that record, so they arrive as themselves with their
   household and groups already attached.
3. **Any other address** gets a visitor record written there and then, named from what they typed,
   with their email on it. The church merges it later (R2.8) if it turns out to be somebody it
   already had.
4. **A child's record is never claimed**, and neither is one somebody else already holds. Both get
   their own new record.
5. **An address that already has an account** is sent to sign in, with the address filled in, the
   password tab open and the way back in underneath it.
6. **The code.** Take a new code and the old link stops working. Turn joining off and it stops for
   everybody.

### HRT-109, how to test it

Sign out. From the front page, **Start a church**.

1. **Create your account.** Name, email, password of at least ten characters. Nothing exists until
   the link in the email is opened: an invitation is matched to a verified address, and a church's
   first owner is granted to one, so the address has to be proved before it is worth anything.
2. **Then the church.** The link lands on creating a church, and you are its owner.
3. **I have forgotten my password**, on the password tab. The answer is the same whether or not the
   address has an account, so it cannot be used to find out who has one.
4. **Choosing a new one** happens on a screen the link opens, and sends you back to sign in with it.
5. **Settings, Security.** Changing a password asks for the current one, and checks it by signing in
   with it. Supabase will change a password on an open session without asking, and an open session
   on a shared church laptop is the case this has to refuse.
6. **Somebody who has only ever used email links** has no current password to give, so they ask for
   a link instead.

### HRT-107, how to test it

`pnpm --filter @connectapp/db metrics`, against the real database.

1. **Every church, and how long it took** from signing up to a directory somebody can use: a
   committed import, or twenty-five people entered by hand, whichever came first.
2. **Twenty-five** because a church of fifty to five hundred with twenty-five people in it has
   stopped evaluating and started using it. One person typed in while looking around has not.
3. **It is derived.** Roll an import back and the church stops being counted as having got there.
   Nothing is written at the moment it happens by code that might not run.
4. **The median and the share inside the hour**, which is the number the sixty-minute target is
   actually about. The average would be moved by one church that signed up and came back in March.

### HRT-106, how to test it

The **?** beside your name, on any screen.

1. **It opens on where you are.** Check-in explains check-in, Kids classes explains the classes, and
   everything else is under it.
2. **Search** across all of it.
3. **It is behind a button.** A product that explains itself on the page shouts at the ninety-nine
   people who already knew, which is why there is no hint text under any field in ConnectApp.
4. **The articles are in the catalogue** like every other string, so they are translated with the
   product rather than left in a wiki somebody forgets.

### HRT-367, how to test it

The guide is a rail down the right of every screen, for an owner or an administrator.

1. **Twelve steps in three phases**, four at a time, so a church is never handed a list of twelve.
   The first hour, then before your first service day, then when you are ready. A phase opens when
   the one before it is settled.
2. **It knows where you are.** Open the screen a step points at and that step rises to the top of
   the rail and says which control to press on this screen. Everywhere else the rail carries the
   phase and the next step.
3. **It points at the thing.** A step whose work happens in one card on a settings screen rings
   that card on arrival.
4. **Nothing is stored about your progress**, which is HRT-105's rule and it still holds. Each step
   is answered by reading the church's own records. Undo the work and the step opens again.
5. **Skip**, and the step settles without pretending it was done, from the same button that undoes
   it. **Collapse** leaves a tab on the edge carrying how far through you are, and it is remembered
   for you rather than for the church. **Hide for good** is one confirm, and Settings then Setup
   guide brings it back.
6. **Help on this screen** sits at the foot of the rail, which is where R22.2 has been waiting for
   somewhere to live since the redesign took the button out of the top bar.

**The basics, and where the first service went.** The opening phase was called The first hour,
after R22.3's sixty-minute target, and a church reading it is not thinking about our target. It is
The basics: the church's people, who helps run it, and its own details. Creating the first service
moved out of it and into Before your first service, where the rooms, the station and the portal
address already are, because a service is something a church sets up for a service day rather than
part of writing the church down.

**Sixteen, not twelve, and why.** Four were added on 15 October after walking a church that had just
been written down: volunteer teams, the order of service template, this week's plan, and the kinds
of group it runs. A new church is given eight plan item kinds and two funds and nothing else, so it
starts with no teams, no template, no group types and no follow-up stages. Without a group type it
cannot write down a single group; without a team there is nobody to put on a rota. Planning the
week's service is the one step in that phase a church repeats, and it is there because doing one is
how a church finds out whether its template is the right shape.
7. **On a phone** the rail is a pill above the tab bar and opens as a panel.

What came out: `/setup`, the corner dock, and the checklist across the dashboard. Three drawings of
one list of five, none of which said what to press on arrival.

### HRT-371, how to test it

**Settings**, then **Invite team member**, as an Owner.

1. **The list is not empty.** All nine roles are offered on a church's first day. The eight
   built-ins that sit archived on the roles screen are still offerable, because that shelf is where
   a church takes one up rather than a list of roles it threw away. Before this, a new church had an
   empty box and could invite nobody at all, which stopped the setup guide dead on its third step.
2. **Owner is one of them.** A church with two pastors says so by inviting the second as an Owner,
   rather than handing the church over.
3. **Role carries the red asterisk**, because the form refuses a blank.
4. **Sign in as an Admin and open the same panel.** Owner, Finance and Pastoral are gone: each
   holds a permission an Admin does not. Six remain.
5. **The rule is on the server.** It was in the panel alone, so posting the id of the Finance role
   would have read the giving on the next sign-in. `invite` now asks `withinReach` the same question
   the roles screen asks, and answers "That role can do more than you can."

### HRT-370, what it is for

Send invite writes a row and sends nothing. A church invites its pastor, watches the row appear
under Invited, and nothing reaches him: somebody has to be told out of band to go to sign-up and
use that exact address. The joining itself is sound, by address, on sign-up, sign-in or the
confirmation callback, and it links or writes the person's record.

What was missing was a way to send. HRT-287 shipped on 13 October, so a church now connects its own
Resend account or its own mail server and the queue is built. The invitation becomes a message like
any other: who it is from, which church, what role, and a link to sign up with that address, with
the fourteen days the row already carries.

Bring your own messaging governs it. The church's own account sends it, we resell nothing, and a
church that has not connected one yet is told so on the invite panel rather than finding out from
somebody who never heard from them.

### HRT-370, how to test it

Signed in as an owner or an administrator, with Settings then Email connected to a Resend account or
a mail server.

1. Open `/settings/manage-accesses` and press **Invite team member**.
2. Type an address you can read, choose a role, and press **Send invite**.
3. The panel closes, the address appears under **Invited**, and the message arrives from the
   church's own address. It says who invited them, which church, the role, and the day the
   invitation runs out.
4. Press the link in it. The sign-up screen opens on the church's own address with that address
   already in the box. Set a password, confirm, and you land in the church on the role you were
   given.
5. Back on `/settings/manage-accesses`, press the paper plane on a row under **Invited**. The
   message goes again, to the same address, with the same role and the same expiry.
6. Now disconnect the account in Settings then Email, and invite somebody else. The invitation is
   written down, the row appears under **Invited**, and a box says no email account is connected,
   with **Connect an email account** on it.
7. `pnpm --filter @connectapp/db exec vitest run tests/invitation-send.test.ts` covers the day it
   runs out, the role's name, and the three states a row under Invited can no longer be sent from:
   withdrawn, expired, and belonging to another church.

### HRT-371, two things wrong on the same screen

**A church cannot give a role on its first day.** Eight of the nine built-ins are written archived,
because the roles screen is where a church takes one up. The invite panel offers roles that are
neither Owner nor archived, which on a new church is none of them: the dropdown is empty, Send
invite stays dark, and step three of the setup guide cannot be finished at all.

**And the role somebody may give is checked only in the browser.** `invite` guards
`canManageChurch` and nothing else, so the filtering that stops an Admin handing out Finance lives
in the panel's own `reachable`. A filter in a screen is a convenience, never a control.

Also here: Role carries no red asterisk though the form refuses a blank, and an Owner cannot invite
another Owner, only hand the church over, which is not the same thing for a church with two pastors.

### HRT-371, the first fix was the wrong one

Offering the shelf in the invite panel was wrong, and a church caught it on the day: the dropdown
listed Admin, Staff, Finance, Pastoral, Group leader and Team leader while its own Roles screen
listed Owner and nothing else. Handing somebody a role the church has never looked at, cannot find,
and has not read the permissions of, is worse than the empty list it replaced.

The shelf is the model working, and the gap was never in the invite panel: a church is written down
with Owner live and the other eight archived, so **taking a role up is a step of setting up** and
nothing said so. The guide now has it, in the basics, between adding members and inviting the team,
and it settles when a live role past Owner exists. Seventeen steps.

Both the panel and the server guard are back to live roles only, so what can be given is exactly
what the Roles screen shows.

### HRT-372, whose mail an invitation is

An invitation went out through the church's own email account, which meant a church could not get
its second administrator in until it had connected Resend or its own mail server: three steps
further down the guide than inviting somebody, and the first thing a church does after importing
its people. The dialog that said so read as a configuration problem the church had caused.

It is our mail. It says somebody has an account on ConnectApp, it links to our sign-in, and it goes
to an address that is nobody's member yet. "The shared email quota is transactional only" is for
exactly this, and the platform account the support form already sends through is the one it uses.

Mail a church writes to its congregation is unchanged: that goes through the church's own account,
which is what `sendAsChurch` stays for. `sendAsPlatform` is the new one beside it, and the only
thing it sends today is an invitation.

What the unsent dialog means changed with it. It is no longer "connect an account": it is our end
failing, so it says the invitation is saved, the email did not go, and send it again from the list.

### HRT-373, what the invitation looks like when it arrives

It arrived as four lines of text and two raw query strings, which is what a password reset from a
badly run forum looks like. The first thing anybody sees of ConnectApp was that.

ConnectApp is the brand on the envelope, because the address it comes from is ours, and the church
is what the message is about, so the church carries the headline. One button, a worded sign-in link
for an account that already exists, and the addresses themselves only in the plain text, where a
reader has nothing to press.

**The mark is drawn rather than linked.** There is no raster logo in the repo, and an image would
be the wrong answer even if there were: every mail program of consequence blocks remote images
until somebody asks for them, so the brand would be missing at the one moment it is working. Three
table cells with a background colour and a radius draw the same three rising embers, and the one
engine that ignores a radius draws three squares, which is still the mark. The colours are the
`ink` ramp written out as hex, because oklch reaches no mail client.

Nothing in the acceptance path changed, because nothing needed to: the address in the link grants
nothing. An invitation is matched on a Supabase-verified address, against a row that is unaccepted,
unrevoked and unexpired, and `accepted_at` is written as it is taken up, so it cannot be used twice.

### HRT-374, the one panel that still opened on nothing

Tags, group types, funds, service types, service templates, email templates, teams, forms and
follow-ups all open on the ones churches keep. Rooms and stations did not, and rooms is the panel
where it matters most, because a room carries a number: a church knows what it calls its nursery
and hesitates over whether the toddlers' room starts at eighteen months or two.

Ten rooms, five of them children's with the usual bands, five of them the spaces a church meets in.
Picking one fills the same form somebody would have typed, ages included, and every field is still
typed over. The list leaves out what the church already has.

Stations are the remaining one, and a station is a device rather than a record, so the shape that
fits it is a different question.

### HRT-375, the guide walks the whole errand

Pointing once and stopping was half a guide. A church pressed Not planned yet, landed on an empty
plan, and the instruction that had brought it there was still describing the press it had already
made. Finishing a step is rarely one control.

A step may now name the controls in the order they appear, and the coachmark shows the deepest one
that is on the screen. Nothing is stored and nothing advances: the screen says where somebody has
got to, so closing a box puts the card back on the press before it, and pressing Escape cannot
leave the guide believing something the screen disagrees with.

Every step walks now. Most are two: the control that opens the panel, then the press that writes
the record. Members is three, because an import is a file, a check and a commit. The plan is four,
because the template is chosen in a box over the screen.

`FormActions` takes a `guide` name, so the two screens that commit through it, the church profile
and a person's own profile, can be walked without their Save being rebuilt.

### HRT-368, and the hole that was not there

Written on the belief that **nothing writes `service_times`**, the weekly pattern the website reads
and a check-in station binds to. That was wrong, and it was wrong because a grep stopped at the
first answer it found.

`addServiceTime` in `repo/church.ts` really is only reached by the demo loader and the tests. But
it is not the writer. `addService` in `repo/services.ts` is: give Create a service a repeat and it
inserts the pattern and generates the calendar from it. Checked on 15 October by opening the panel
on a real church, choosing Every week, and reading the table afterwards: one `service_times` row,
27 occurrences, every one of them linked to it.

So a church can already write down the times it meets, in the one place it would look. What was
actually dead is `addService` and `removeService` in `settings/actions.ts`, two server actions
superseded when services became one idea instead of three and left behind with nothing importing
them. Those are gone.

HRT-367's services step stays on dated services rather than the pattern, which is right for a
different reason than the one given: a church whose first service is a one-off has still had its
first service, and the step should settle.

**What to take from it.** A function with no callers is not the same as a capability with no
screen. The check that would have caught it is the one that was eventually run: open the screen and
do the thing.

### HRT-409, every dialog and panel, opened in a browser

Phase 4.12 of the October 2026 overhaul listed Dialogs and Panels for review in a browser, and the
pass that was done read their wording in the catalogue instead. Forty-two overlays were opened on a
running app, with axe run against each one while it was open. Six defects, and a wording pass across
what the opening showed.

**The form panel listed its keys to the church.** `template.connection`, `template.prayer` and four
more, where the names should have been. `FORM_TEMPLATES` lives in `@connectapp/db`, and
`build-client-catalogue.mjs` follows this app's own files rather than a package's, so a name read off
the table with `t(one.name)` was never in the browser's catalogue. Every other library in the
product keeps its labels beside the screen, which is why this was the only group affected. The names
are written down in `new-form.tsx` now, and `client-catalogue.test.ts` reads
`form-templates.ts` and fails if one is left out. Proved by reverting the fix: the test names the
missing key and the file to name it in.

**Every administrator read "Area.members" on the role panel.** `AREAS` in `manage-accesses/team.tsx`
was typed `[string, string[]]` and resolved with `t(key as never)`, so `area.members`, which the
catalogue has never held, typechecked and reached the screen. The key is `area.people`, the table is
typed `MessageKey`, and the cast is gone.

**The group panel's capacity field had no name at all.** It sat in a `Side`, which draws a span, so
there was no `label for` and no `aria-label`: axe critical, and the one control in that section was
nameless to a screen reader. The events panel and the rooms panel both use `Field` for the same
number. It is a `Field` now.

**fg-subtle on sunken failed AA at 4.31:1.** The pair was never audited, though `fg-subtle on canvas`
and `on surface` both were, and sunken is where every pill and chip in the product sits. Found on the
household member rows. The pair is in `contrast.mjs` now and light `fg-subtle` moved from L 0.540 to
0.525, which clears all three surfaces: 4.84 on canvas, 5.41 on surface, 4.59 on sunken.

**Four panels threw away unsaved work without asking.** Rooms, tags, custom fields and follow-up
stages closed on Escape with a form typed into them. `usePanelGuard` existed and nine other panels
used it. All four hold now, and Save waits for a change as well as for the required fields. Email
templates had written the same question out again in its own words, "Leave without saving?" against
the shared "You have unsaved changes", so the product asked it two ways; it uses the shared hook, and
the shared title is the question.

**Signing out from the collapsed rail asked nothing.** `SignOutButton` opens a confirmation, for the
reason written on it: on a shared church computer this is the press that ends somebody else's
afternoon of data entry. The rail's own square posted straight to `/auth/sign-out`, one place below
the avatar a member aims for. `SignOutButton` takes an `icon` form and the rail uses it.

**Wording.** Five controls said "Add a new X", which says new twice, and seven panel titles did not
match the trigger that opened them. docs/ux-writing.md asks a button to lead with the verb and to use
the fewest unambiguous words, so a trigger and its panel now say the same thing: Add a role, Add a
fund, Add a group type, Add a service type, Add a service template, Add a stage, Write an
announcement, Create group. The setup guide names four of those controls in its instructions, so
those four strings moved with them and the guide was walked again on each screen.

**What to take from it.** Reading the words in the catalogue is not reading the words on the screen.
Four of the six defects are invisible in `en.ts`: the key that is never shipped to the browser, the
key that does not exist, the field with no label, the panel that closes. The sixth, the token pair,
was invisible in the audit that exists to catch exactly it.

### HRT-410, development took money and recorded nothing

A test gift given on development reached Stripe, showed on the Payouts screen, and never appeared in
Giving. The Payouts screen reads Stripe live, so it was telling the truth; Giving reads our own
records, and a gift is written there by the webhook and by nothing else.

The development sandbox had **no webhook destinations at all**, so no gift given there since the
sandbox was made was ever recorded. `/api/stripe/webhook` refuses an unsigned request, and without
`STRIPE_WEBHOOK_SECRET` on Vercel Preview every delivery would have been refused anyway. Neither was
set.

docs/environments.md did say to make the two destinations, as a sentence at the end of
`set-dev-stripe.sh` telling somebody to go and do it in the dashboard. A step a person has to
remember is a step that gets skipped. `scripts/set-dev-stripe-webhooks.mjs` makes both, reads their
signing secrets, and writes them into `.env.local` and Vercel Preview. It is idempotent, and it
replaces a destination whose secret nobody holds, because a secret is readable only at creation and
an endpoint that cannot be verified against rejects every delivery.

This was never wrong in production, which has both secrets set.

**What to take from it.** A screen that reads a third party live and a screen that reads our own
records will disagree when the pipe between them is broken, and the one reading live looks right.
HRT-413 is the check that now says so: the Status screen asks Stripe whether anything points at this
environment and whether this environment holds the secret to verify it, because the Stripe probe
beside it only ever asked whether the key worked.

### HRT-411, the schedule blamed the services

A church with four services and no team opened the Schedule and read "Nothing to fill yet. The
schedule is built from your service times. Create a service", under a button that went to Services.
It had created its services. One empty state was answering three different questions, because the
board is drawn only when there is a team, a chosen team, and a service in the month being viewed.

The screen now says which: no team sends the reader to Settings, Teams; no service in this month
says so and keeps the month's own arrows on screen, which it did not before, so a church that
landed on an empty month had no way to reach one that had something in it.

### HRT-412, a $36,348 gift was told to enter an amount

`MOST` is 2,000,000 cents, so a church takes at most $20,000 in one gift and a typo cannot create a
$90,000 charge. Over it, under the $1 minimum, and not a whole number of cents all answered
"Enter an amount.", so somebody who typed $36,348 was told to enter the amount they had just
entered, with nothing to say a cap existed or what it was. Three messages now, each naming the
figure it is about.

**The cap was then raised to $100,000**, on 17 October. It was $20,000, which nothing in the PRD
asked for: it arrived with the giving page on 7 October justified only by an inline comment about a
typo creating a $90,000 charge. A guard against a typo is worth keeping; $20,000 was low enough to
refuse gifts churches receive, and a building campaign gift or a bequest is the transaction a church
least wants bounced.

### HRT-414, a refund made outside the product is never recorded

Found while proving HRT-410: a refund issued through Stripe's API against a gift the product had
recorded left the gift showing as given in full.

`markRefund` only moves a row that already carries the refund's id and is marked pending, and the
only thing that writes those is `refundGift`, which runs when a treasurer refunds from the Giving
screen. A refund made in Stripe's own dashboard, which is where a treasurer with a Stripe login will
go, matches nothing. Stripe sends `refund.created` and `charge.refunded` for it and the endpoint
subscribes to neither.

It matters beyond the screen looking wrong: a giving statement is built from these rows, so a church
would issue a tax statement overstating what somebody gave, and the deposit would not reconcile.

**Decided on 17 October: yes, it reduces the gift**, because the statement has to be right.

The care it needed was not double-subtracting, and the answer is to stop adding up at all. The
endpoint now reads the charge back and writes `refunded_cents` to the charge's own `amount_refunded`,
which is the total rather than a delta. That is the same answer however many of the four event types
arrive, in whatever order, however often Stripe redelivers, and it falls back on its own when a
refund fails. `refund.created` and `charge.refunded` are subscribed to as well, which is what a
dashboard refund actually raises.

Five tests in `giving.test.ts` hold it: a refund the product never issued, four deliveries of one
refund leaving the total at one refund, a second refund followed by one the bank refused, a figure
larger than the gift, and another church's account.

### The October 2026 security review, HRT-419 to HRT-436

A systematic review of the whole platform, run on 17 and 18 October 2026. Thirty
findings, one critical, ten high. The record is
[docs/security-audit.md](docs/security-audit.md); the conventions that came out
of it are [docs/security-hardening.md](docs/security-hardening.md).

**The one that mattered most was HRT-426**, and it was not a cross-church leak
or anything to do with money. `releaseBlock` asked the authorised pickup list
and any do-not-contact order only when the volunteer had named who was
collecting, and the checkout dialog opens with nobody named and offers "someone
else", which maps to nobody. So the ordinary path through the screen released a
child on the code alone, with no list consulted, no reason asked for and no
override row written. R8.8 says the pickup list is enforced at checkout, and it
was enforced only when somebody volunteered their name.

**The shape most of the rest shared.** The documented design puts the permission
check in the repository function, and that is right for writes. Repository
readers take no actor: row-level security supplies the tenant and nothing
supplies the role. So the writes were refused correctly everywhere, and
twenty-odd reads were refused nowhere. A member could read the staff directory,
the church's mailing history, any past send's body, every child's medical note
and pickup list, and the live security code of every child checked in. That last
group is the whole of what a desk asks for before releasing a child, which is
why HRT-420 and HRT-426 are the same story told twice.

**Two crossed the tenant boundary**, which is the class the isolation suite
exists to catch and did not, because both ran on the owner connection where the
policies do not apply. `revokeInvitation` took an id and no church.
The send worker joined consent with no tenant predicate, so one church's message
could carry another church's unsubscribe link.

**One suite had the finding written down as an expectation.**
`isolation.test.ts` required a tenant policy on every table carrying a
`tenant_id`, which includes `platform_events`, so it was requiring the policy
that let a church read the operator notes about itself and passing because it
was there. `hardening.test.ts` filtered `pg_proc` by the same four names it then
asserted the result equalled, so it could only fail if one of four went missing
and could never notice the six that were failing its next two assertions. Both
read the catalogue now.

**`apps/web` had no tests at all**, which is why several pure functions on
security boundaries had never been run: the markdown-to-HTML escaper, the
redirect allowlist, the dev-gate pass, the frame policy. It has a harness now
and CI runs it. Every fix in this run has a test, and every test was run with
its fix reverted to confirm it fails; two of them caught bugs in the fixes
themselves, including one that would have made the development deployment answer
nothing at all.

**Measured rather than assumed.** The check-in change reads both lists on every
child checkout instead of only when a collector is named, as two indexed reads
by member id inside the transaction that was already open, issued together; the
named path is a round trip cheaper than before. The headers add nothing: the
policy is a pure function of the path.

**Left open, with reasons on the board:** HRT-425, HRT-432, HRT-434, HRT-435 and
HRT-436. Three findings need `pnpm db:migrate` run against each environment
before they take effect, because they live in `sql/security.sql`, and CI verifies
that file against a throwaway Postgres on every push. HRT-426 needs walking
through a real service before it ships, because it changes the desk flow at the
busiest minute of the week.

### HRT-417, secrets that could be read back

Vercel marks an environment variable holding a secret as needing attention when
it is stored encrypted rather than sensitive: encrypted means the deployment can
read it and so can anybody with access to the project, in the dashboard or
through the API. Forty-four of them were, across the two projects, including
both database URLs, the Stripe secret key, the webhook signing secrets, the note
and provider encryption keys, and the cron and dev gate secrets.

They are sensitive now, which is write only. The values were not changed, so
nothing needed redeploying and nothing broke; every value was read out to a
local backup first, because a sensitive value cannot be read back afterwards.

What is still readable is what is not a secret: publishable keys, the Supabase
URL, hostnames, the Resend OAuth client id, the from address, the VAPID public
half.

**Not rotated.** Vercel's prompt offers rotation at the source, which means
issuing a new key at Stripe or Supabase. That is the answer when a value may
have been seen by the wrong person. None of these has been, and rotating for its
own sake buys nothing and risks an outage.

### HRT-416, the demo becomes a place rather than a button

Asked for on 17 October 2026, to replace the way demo works today: its own address, the whole
product rather than a gated corner of it, and fast to open from either environment.

**What already existed.** The per-visitor model was already built under HRT-282: `createDemoChurch`
hands each visitor a church of their own from a pool built in advance, claimed on arrival, carrying
a signed cookie instead of an account, and swept after 24 hours. Writes are the visitor's alone and
go when the church does. Everybody starts from the same seeded church, which is the "shared" half of
what was asked for.

**What was missing: approval.** `buildDemoChurch` created a tenant and never set `approved_at`, so
every demo church was provisional. That is the gate on a church nobody has looked at yet, and it is
right for a stranger's sign-up: twenty-five members, no join link, no invitations. A visitor sent to
see the product met the restrictions instead. Demo churches are approved on creation now. It opens
nothing that could reach a person: a demo church has no messaging credentials and no Stripe account,
so an invitation sends nowhere and a gift cannot be taken.

**The number that decides the rest.** Building one demo church takes **37.8 seconds**, measured on
17 October against the development database, for a church holding **872 rows across 27 tables**.
That is 43ms a row, because the loader inserts one at a time through the repo layer with audit
triggers firing on each. Which is the right way to build it: the demo uses the same functions the
product uses, so it cannot drift into showing something the product does not do.

It is the wrong way to answer a visitor. The pool holds two, so two people arriving together drain
it and the third waits 38 seconds at a blank page, and a seed rich enough to show giving, messaging,
follow-ups, forms, events and a website would take minutes rather than seconds.

**So the two are separated.** The loader builds a template church once, offline. A visitor gets a
copy made with SQL, which for 872 rows is a handful of statements and milliseconds. The seed can
then grow as rich as the product is without a visitor ever waiting for it.

The risk is a clone that quietly misses a table, which would show a visitor a church with no groups
and no sign that anything was wrong. The table list is derived from the schema, every table carrying
a `tenant_id` and there are 99 of them, rather than written out by hand, and a test clones a church
and compares row counts table by table so a table added later cannot be forgotten.

**Decided with the user, 17 October.** Open with no sign-in. One seeded church that everybody starts
from, with each visitor's writes their own and cleared when their copy is swept. Deployed from
`production`, so a church sent there sees what churches are actually running.

**What it took, in the end.**

`cloneTenant` reads the tables, their columns and the keys between them from the catalogue on every
run. 99 tables carry a `tenant_id`; a demo church fills 35 of them. Three are deliberately left
behind: the audit log, which is append only and describes the loader rather than the visitor, the
old loader's `demo_records`, and `tenant_members`, because the visitor is the only member a copy
should have. `clone.test.ts` copies a church and compares row counts table by table, and fails if a
scoped table is neither copied nor named as left behind, so a table added next year cannot be
quietly missed.

The first version took 11 seconds, which was not the 872 rows but the waiting: two hundred
statements to a database that is not on the same machine. Asking which tables hold anything, mapping
every id in one statement and sending all the inserts together brought it to 850ms locally and about
a second on the deployment.

**Three things the browser found that nothing else would have.** A redirect built from `nextUrl`
lost the host the visitor typed, so the pass they had just been given was not sent and they met the
sign-in screen. The seeded events were left as drafts, so the diary showed two tiles saying DRAFT.
And the seed counted its dates in UTC while every screen reads the church's own timezone, so a
template built after seven in the evening in Chicago gave the demo a service "today" that check-in
read as tomorrow: a visitor met "Nothing on today" on a church whose whole point is a service
running.

**Live on 18 October.** `production` moved forward 19 commits, the wildcard already pointed at it,
and the template was built through `/api/demo/refresh`. Measured on production: 0.38s for the
redirect, 0.99s for the door, which is the copy and the pass, and 0.97s for the dashboard, so about
four seconds from typing the address to an interactive screen. The sweep came out of that path
afterwards, since the nightly rebuild does it.

**Left for the visitor to press:** the website, because the builder's own gallery shows the feature
better than a site made in the data layer, and messaging, which needs credentials a demo church
deliberately does not have.

The suites skipped under HRT-282 are still skipped. They were written against the pool, which no
longer exists; what replaced them is `clone.test.ts` and the standing test above.

### HRT-415, a monthly figure that did not say so

The Giving board's repeating tile read "Repeating gifts, $86,666.66, 1 repeating gift", which reads
as the total of what repeats. It is not: `recurringMonthly` brings every schedule to a month, so one
$20,000 weekly gift is $20,000 times 52 over 12. The label says "Expected a month" now.

The count under each figure went with it, here and on the two other screens drawing the same tile: a
member's own giving and the giving report. "2 gifts" under $22,041.50 repeats what the list below
already shows, and `Figure` takes `sub` as optional now, because a figure that needs no qualifying
line should not carry one for the shape of it. The giving export keeps its count, where it is a
column a treasurer asked for rather than decoration.

### HRT-407, the domain reading was built and never wired up

Found during the October 2026 repository audit, and confirmed by the deletion
that followed it.

HRT-283 is marked Closed: "what we can tell a church about its own domain before
it changes anything". The work was built. `DomainReading` rendered the findings
and `DomainHelp` explained SPF and DMARC in a church's own words, with around
twenty-five catalogue keys behind it, including the paragraph explaining why
domain settings matter at all.

Neither component was ever imported by a screen. `settings/church/page.tsx`
renders `ChurchSections`, which does not use them, so nothing a church can open
reaches either one. Both files were removed in the approved cleanup, because
code nothing can reach is not a feature.

The catalogue keys are still there, and so is `packages/db/src/domain/preflight.ts`,
which does the actual DNS reading and is used by the email setup screen.

**What this story is:** decide whether a church should be shown its domain's
current state before it changes anything, as HRT-283 intended. If yes, wire the
reading into the church profile screen, rebuilding the two components from git
history. If no, close HRT-283 honestly and remove the orphaned `domain.help.*`
and `domain.reading` keys.

**What it says about the board:** a story can be marked Closed on the strength
of the code existing. Nothing checked that a person could reach it.

**Cloudflare raised the stakes on 17 October.** Reviewing our Domain Connect template, they pointed
out that Cloudflare ignores `txtConflictMatchingMode`, so a TXT record only conflicts with an
identical one: where a church already has a different key at `resend._domainkey`, both records stay
and DKIM verification becomes unreliable. That is exactly what `dkimTaken` in
`packages/db/src/domain/preflight.ts` detects and what `warningsFor` already builds a warning for,
and no screen reads either. So the answer to this story's question is yes, and the one-press flow we
are asking DNS companies to adopt is what makes it urgent: a church that presses the button on a
domain already carrying somebody else's DKIM key gets mail that sometimes authenticates and
sometimes does not, with nothing having told it.

### HRT-406, the restore drill has never been run

Found during the October 2026 repository audit.

HRT-121 is Closed and `docs/backup-and-restore.md` describes the runbook, the
census tool and a drill to be run and written down every quarter. `drills/`
holds its README and no census files, so no drill has been recorded. The README
itself says that keeping the files there "is what makes docs/backup-and-restore.md
a record rather than a plan", and today it is a plan.

R21.6 is marked shipped on the board on the strength of the tooling existing.
What is missing is the evidence that a restore works.

**What this story is:** run one drill end to end against the development
project, take the census before and after, compare it row for row, commit the
files to `drills/`, and write the date in the drill log. Then decide whether the
quarterly cadence is enforced by a calendar entry or by a check in CI.

This matters before a pilot church, not after. An untested backup is the one
failure a church cannot recover from, and it is the only R21 requirement whose
acceptance cannot be demonstrated from the code.

### HRT-405, the portal signed people out on a tab press

Reported in production on 17 October 2026: signing in to the portal worked, and
pressing any tab other than Overview returned to the sign-in screen.

**Cause.** The portal and the product run on the same Supabase project in each
environment, so `@supabase/ssr` names both sessions `sb-<project-ref>-auth-token`
by default. The product writes its cookie on the parent domain on purpose, because
every church reaches the product at a name underneath it, and the portal is a
subdomain of that same parent. So on `admin.connectapp.church` the browser holds
two different cookies under one name: the portal's own, host-only, and the
product's, domain-wide. Both are sent on every request and which one is read is
undefined. Reading the product's returns an account that is not on the platform
team, or a token the other app has already rotated, and the gate sends them to the
door.

It needs somebody signed in to both, which is why it appeared in production and
never in development.

**Fix.** The portal's session cookie is named `connectapp-admin-auth`, in
`apps/admin/lib/supabase/cookie-name.ts`, used by both the server client and the
middleware. The product keeps its domain-wide cookie unchanged.

**Proved both ways**, locally, by injecting a cookie under the default Supabase
name alongside the portal's own. Without the fix the first tab press returns to
the sign-in screen. With it, Churches, Status, Delivery, Log, Team and Overview
all hold the session.

**Everybody on the team signs in to the portal once more** after this ships,
because the old cookie is no longer the one it reads.

### HRT-404, serving frequency has no writer

Found while deleting dead code in October 2026, and the same shape as HRT-368.

`tenant_members.serving_frequency` is read by the scheduler: `plan.warning.tooSoon` warns
"Served {day}, asked for {frequency}" when somebody is put on a service sooner than their
preference allows. Nothing in the product can set it. The only writer was `setServingPreference`,
reached through `saveFrequency` in `app/(app)/schedule/actions.ts`, which was called only from
`app/(app)/members/availability.tsx`, and that screen had no route and no importer.

So the field is always null, the warning can never fire, and the deletion of the dead screen does
not cause that: it was already true, because the screen was unreachable.

Blockout dates are fine and are not part of this. Members set their own at `/home/schedule`
through `away.tsx`, using `addAway` and `removeAway`, which are live and working.

What this story is: decide where a serving frequency is set. The candidates are the member's own
schedule screen beside their blackout dates, or the team roster where a leader manages the people
on a team. Then wire it, or drop `serving_frequency` and `plan.warning.tooSoon` with it.

### HRT-369, what it is for

A church should meet check-in on a Tuesday rather than with forty families queuing. Both the desk
and the supervisor board need a service occurrence dated today, which is what HRT-253 records, so a
dry run is a feature of its own: a practice service that prints a real label pair and then leaves
nothing behind.

### HRT-105 and HRT-108, how to test them

**Settings**, then **Set up**. On the staff directory there is a line at the top until it is done or
archived.

1. **Five steps**, each linking to the screen that does it rather than wrapping that screen in a
   wizard. A church that adds a service time here and another next March is in the same place both
   times, and learning where things are is most of what the first hour is for.
2. **Nothing is stored about your progress.** Add a service time and the step is done. Remove it and
   the step is open again. A wizard that keeps its own tally congratulates a church on importing
   nobody.
3. **Not for us.** A church with no kids' classes says so, and the step settles without pretending
   it was done. It is undone from the same button.
4. **Put this away** hides the line on the directory. Settings brings it back.
5. **Who can get in** is a new screen, Settings then that name. Invite somebody by the address they
   will sign in with, choose what they may do, withdraw an invitation, change somebody's role, or
   take their access away. Their person record in the church is untouched by any of it.
6. **The last owner** cannot be demoted or removed, by this screen or any other path. A church with
   no owner is a church nobody can administer.

### HRT-99 and HRT-100, how to test them

**Settings**, then **Printed directory**, is what the church may print about you. On the staff
**Directory**, **Print the directory** opens the book.

**A member has one screen and no section bar.** Signing in as `member@riverside.example.org` lands
on it: hello, and the groups they are in with a way to find another. Staff keep the sections they
work in. A row of links to screens somebody cannot open is how a church ends up
with a product nobody opens, and the portal in 1.0 (R17) grows from this screen rather than from a
cut-down copy of the staff app.

1. **The default is your name.** Everybody is listed, and nothing else of anybody appears. A church
   that imported two hundred phone numbers has been given permission by none of those two hundred
   people, so the absence of a choice means the safest answer.
2. **Turn a field on.** Your email, your phone, your address, your birthday. It appears in the
   directory for everybody and the fields you left off do not.
3. **The acceptance criterion.** Hide your address. You still see it on your own record, and it is
   nowhere in the directory. It will be nowhere in the printed one either, because both read the
   same rule.
4. **Take yourself out.** One tick, and you are absent from the directory and still in the church's
   records.
5. **Children.** A child never appears until the head of their household ticks "Our children, by
   name", and never appears with contact details even then. Tick everything on the parent's record
   and the child still has no email, no phone and no birthday against them.
6. **Somebody rings up and asks.** Owner, admin and staff can change somebody's setting for them.
   Another member cannot.
7. **Search.** By a person or by a household: "Bennett" finds the Bennetts.

Photos are in the model and nowhere on the screen, because a person's photo cannot be uploaded yet.
That is R2.x and the quota work behind it.

### HRT-26, how to test it

Open anybody in the **Directory**. **Background check** is in the right column, for owner, admin and
pastoral only. Sign in as staff and the card is not there.

1. **Record one.** Who did it, what it said, the day it was completed, the day it runs out.
2. **Where they stand** is worked out rather than stored: Clear, Running out, Run out, Flagged,
   Waiting, Not checked. Run out and Not checked are deliberately different answers, because
   "nobody has checked her" and "hers lapsed in March" are two different conversations.
3. **Running out** starts sixty days before the date, and the volunteer keeps serving through it. A
   church that stops somebody eight weeks early has lost a volunteer and gained nothing.
4. **Record another.** The new one decides. The old one stays on the list. There is no edit and no
   delete anywhere on this card: what the church knew in 2024 has to stay answerable in 2030.
5. **A flagged check** stands until a later check supersedes it, and never quietly expires into
   "not checked".
6. **What is not kept.** No report, no finding, no notes. The provider holds that. A test asserts
   the table has only the eight columns it should have.

The gate itself, where somebody without a check cannot be scheduled with children, is R10.9 in 0.4.
The rule it will call is written and tested here.

### HRT-97, how to test it

**Settings**, then **Follow-ups**. Owner and admin, because this is the process rather than the work.

1. **Rename one.** Call Serving "Getting involved" and say what it is for in your own words. The
   finder, the queue and the board all say it.
2. **Rewrite the steps.** Change what a step says, change how many days it gets, add one, remove
   one. The order you leave them in is the order they are written out in.
3. **Lands on.** Choose who new follow-ups from this pipeline go to. A trigger that fires at
   midnight then has somebody's name against it rather than nobody's.
4. **People already in it are untouched.** Somebody halfway through keeps the steps written out for
   them. A church that rewords a step should not lose the three people it is already calling.
5. **Turn one off.** Nobody new enters it, by hand or by a trigger. The people in it stay.
6. **What you cannot do.** Make a seventh. Draw a branch. Add a condition. That is R5.8, deferred
   to 1.x, and it is the feature that makes the free competition unusable by a volunteer.

### HRT-96, how to test it

**Follow-ups**, then **Across the church**.

1. **A tile per pipeline**, in its own colour, with how many are in it as the number. Late shows in
   red beside it, and the longest wait underneath. Three numbers, because a pastor looking at this
   is asking where the church is dropping people.
2. **Open a tile.** Who is in it, longest wait first, with their next step and the day it is due.
   The number is only useful if it opens into names: somebody has been in First visit for five
   weeks, and that is a person rather than a statistic.
3. **Late in red**, there too.
4. **A name** goes to their record.

### HRT-95, how to test it

**Follow-ups** in the header, for owner, admin, staff and pastoral.

1. **Three groups, no filters.** Late, This week, Later. Somebody opening this on a Monday morning
   wants to know what they have already missed, and a dropdown does not answer that.
2. **Late is red** and sits at the top.
3. **The row** names the person, links to their record, and carries the pipeline in its own colour,
   so working a queue of twenty does not mean guessing which is which.
4. **Done** asks what happened, from here, without opening the person.
5. **Nobody has these.** A step raised by a trigger and given to no one. Take it and it moves into
   your queue, which is how a volunteer picks work up.
6. **A pastoral account lands here** after signing in. It is the one role whose job is the
   follow-ups rather than the records.

### HRT-94, how to test it

Nothing to press. Record attendance and the follow-ups raise themselves.

1. **A first visit.** Mark a **visitor** present on a service. Open their record: First visit is
   open, dated the day they came, with the first step due two days later. That is the acceptance
   criterion, and the sweep runs off the back of the attendance write.
2. **Members are left alone.** Mark a member present and nothing happens. A church of two hundred
   that starts using ConnectApp on a Sunday is not two hundred first-time visitors. The record began
   that day; they did not.
3. **A second visit.** Mark the same visitor present on a later service. Second visit opens
   alongside, dated that Sunday.
4. **Twice is still once.** Mark attendance again. Nothing new appears, today or tomorrow.
5. **Closed stays closed.** Close First visit and record more attendance. It does not come back.
6. **Three missed.** Somebody who was coming and has missed three held services in a row raises Not
   seen for a while. Cancelled services do not count, so a Sunday called off for snow does not
   accuse half the church of drifting. The number is the church's own (Settings, absence threshold).
7. **One spell, one follow-up.** It is raised once however long they stay away. If they come back
   and drift again, it raises again.
8. **A milestone.** Add a **Baptism** milestone and the Baptism pipeline opens with its steps. A
   membership class does the same. A marriage does not: there is no pipeline behind it.

The sweep runs at most once a minute per church, off the attendance write. When the job queue lands
it moves there unchanged.

### HRT-93, how to test it

Open anybody in the **Directory**. There is a **Follow-up** card under their details, for owner,
admin, staff and pastoral.

1. **Start one.** Choose **First visit** and press Start. Three steps appear, dated: say thank you
   in two days, call them in a week, invite them to something in three. The dates are worked out
   from the day you started, so nobody types a date.
2. **The six.** First visit, Second visit, Not seen for a while, Baptism, Membership, Serving. That
   is the list, deliberately. A church cannot invent a seventh, which is what keeps this usable.
3. **Answer a step.** Done asks what happened, and that sentence stays on the record. Six months
   later "we called her and she is coming to the Tuesday group" is the thing worth having.
4. **Overdue.** A step past its day shows its date in red.
5. **Undo.** Ticking the wrong line is undone, and the pipeline opens again if it had closed.
6. **The last step closes it.** Answer all three and the whole thing drops to Closed, marked Done.
7. **Close it early.** Close asks why, and keeps the reason. "Where did the eleven people in this
   stage go" is the question this answers.
8. **Twice.** Start First visit again on the same person while it is open. Nothing happens, by
   design: somebody who visits twice in a fortnight is one visitor.
9. **A task on its own.** Add a task writes a thing to do with a due date and no pipeline.

Nothing enters a pipeline by itself yet. That is HRT-94: first attendance, second attendance, and
three absences in a row.

### HRT-91, how to test it

**Groups** in the header. There is one groups screen now, where there were two.

1. **The list.** The church's groups, under their kinds, with the filters: a box to type in, the
   kind, the night, who it is for, online, children welcome. What used to be behind "Find a group".
2. **Create a group.** Still the first thing on the screen, for an owner, admin or staff. A member
   browsing does not see it.
3. **Unlisted.** Tick off "Listed for members" on a group. It stays on your screen with an Unlisted
   chip against it, and it is gone from a member's.
4. **Archived.** Archive a group from its page. It drops to the Archived line at the bottom of the
   list, with Restore.
5. **The group.** Tap a name. The page from HRT-90, and under it the roster, the register, Edit and
   Archive, for whoever runs groups. A member sees the page without that half.
6. **Requests.** A leader's waiting requests are still at the top of the list.

### HRT-92, dropped, and why

Built and taken out the same day. It put a Resend API key, an SMTP server and a port on a settings
screen, for Maria to fill in. Four hours a week, one volunteer, and we asked her for a port number.

The provider still has to exist, because messaging runs on the church's own account (R16.2) and
that is settled. It gets set up with the church during onboarding (F22), by somebody who does this
for a living, out of the volunteer's way. Where that configuration is written down is part of
onboarding's design, so it is decided there.

**HRT-87** group messaging waits on that. The queue of people a message is owed is already a query,
so the sending is the only part missing.
