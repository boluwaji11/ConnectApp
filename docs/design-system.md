# Design system

> **October 2026.** A full design pass over the product is reconciled in
> [redesign/README.md](redesign/README.md): the prototypes, how its tokens map onto these, the
> three hue values we kept, and what in it is not being built. The shell, the navigation and any
> screen's layout follow that file.

ConnectApp has to look better than the software it replaces.

Requirement IDs refer to [../PRD.md](../PRD.md). This document is the source of truth for tokens,
type, motion, and component behaviour. Web first. Native mobile later, which is why tokens are
defined platform-neutrally in section 9.

## 1. Principles

**1. The service is the constraint.** The hardest screen in this product is a check-in station two minutes before a service
with a queue of forty families, run by a volunteer who has done it twice. Design for that, and the
Tuesday afternoon office screens take care of themselves. This is why there are three density modes
(section 2) and not one.

**2. Colourful where it carries meaning, quiet everywhere else.** Every competitor is a blue SaaS
dashboard, grey on grey, with one accent colour and no joy. ConnectApp uses a warm canvas and a spectrum
that earns its place by doing real work: every ministry, team, room, group type, and fund has its own
colour, so a calendar, a check-in floor, and a giving chart are readable at a glance rather than
after reading.

The discipline is the other half. Colour marks identity, and nothing else. A row of tinted tiles, a
rainbow header, a swatch for every section: that is decoration, the eye stops sorting it, and the
colour that does mean something gets lost in it. A church is not a CRM and should not feel like one,
but it is not a paint chart either.

**3. Legible beats fashionable.** Volunteers span every age and ability. WCAG 2.2 AA is a floor, not
a goal (R22.7). If a trend costs contrast or tap target size, the trend loses. No exceptions, and no
"but it looks better with" conversations.

**4. Motion clarifies, never decorates.** Motion shows where a thing came from and where it went.
Anything that exists to be admired gets cut.

**5. Typography carries the hierarchy.** Not borders, not boxes, not shadows. Fewer containers,
better type.

**6. Nothing is hover-only.** Half of this product is used on a tablet with a finger, in a hurry.

## 2. Three surfaces, three densities

One design system, three density modes. Same tokens, different scale. This is the structural idea
that makes the system work across contexts that have genuinely different requirements.

| | **Office** | **Station** | **Portal** |
|---|---|---|---|
| Who | Maria at a desk, midweek | Ruth at check-in, doors open | A member on a phone, 4 min a week |
| Goal | Density, keyboard speed, calm | Unmissable, fast, zero ambiguity | Warm, simple, app-like |
| Base body | 14px / 20px | **20px / 28px** | 16px / 24px |
| Min tap target | 32px (mouse), 44px (touch) | **56px** | 44px |
| Row height | 36px | 72px | 56px |
| Grid gutter | 16px | 32px | 16px |
| Max content width | 1440px, tables full bleed | Single column, 720px | 560px |
| Chrome | Persistent sidebar, breadcrumbs | **None.** One task, full screen | Bottom tab bar |
| Motion | Fast, 120 to 180ms | Minimal, confirm only | Springy, app-like |

Set with `data-density="office | station | portal"` on the root element. Every token that changes is
resolved through CSS custom properties, so a component is written once.

## 3. Colour

OKLCH throughout, for perceptually even ramps and predictable contrast. Defined as CSS custom
properties on `:root`, redefined for dark mode.

The palette follows the name. **Stone** for warm neutrals, **ink** for text and primary action,
**ember** for accent and warmth.

```css
:root {
  /* Stone: warm neutral. Hue 75 keeps it warm, never blue-grey. */
  --stone-50:  oklch(0.985 0.003 75);
  --stone-100: oklch(0.967 0.005 75);
  --stone-200: oklch(0.925 0.008 75);
  --stone-300: oklch(0.863 0.010 75);
  --stone-400: oklch(0.706 0.013 75);
  --stone-500: oklch(0.556 0.014 75);
  --stone-600: oklch(0.442 0.013 75);
  --stone-700: oklch(0.366 0.012 75);
  --stone-800: oklch(0.262 0.010 75);
  --stone-900: oklch(0.198 0.009 75);
  --stone-950: oklch(0.142 0.008 75);

  /* Ink: primary action. Deep warm indigo. Serious, not corporate blue. */
  --ink-50:  oklch(0.968 0.012 285);
  --ink-100: oklch(0.928 0.026 285);
  --ink-200: oklch(0.866 0.048 285);
  --ink-300: oklch(0.772 0.078 285);
  --ink-400: oklch(0.652 0.108 285);
  --ink-500: oklch(0.548 0.124 285);
  --ink-600: oklch(0.455 0.118 285);   /* primary */
  --ink-700: oklch(0.382 0.098 285);
  --ink-800: oklch(0.302 0.074 285);
  --ink-900: oklch(0.242 0.056 285);

  /* Ember: accent, highlight, active state. Candlelight. */
  --ember-50:  oklch(0.975 0.018 70);
  --ember-100: oklch(0.945 0.042 70);
  --ember-200: oklch(0.895 0.082 70);
  --ember-300: oklch(0.842 0.118 68);
  --ember-400: oklch(0.792 0.148 65);
  --ember-500: oklch(0.742 0.162 62);   /* accent */
  --ember-600: oklch(0.658 0.158 55);
  --ember-700: oklch(0.552 0.138 48);
  --ember-800: oklch(0.442 0.108 45);
  --ember-900: oklch(0.362 0.082 45);

  /* Semantic */
  --success:  oklch(0.582 0.132 155);
  --warning:  oklch(0.712 0.152 75);
  --danger:   oklch(0.558 0.198 25);
  --info:     oklch(0.582 0.122 235);
  --critical: oklch(0.505 0.225 20);  /* allergies, safety blocks. See section 7. */
}
```

### Semantic tokens

Components reference these, never the ramp directly. Changing a ramp must never require touching a
component.

```
--bg              --stone-50    / dark: --stone-950
--bg-raised       white         / dark: --stone-900
--bg-sunken       --stone-100   / dark: --stone-950
--fg              --stone-900   / dark: --stone-100
--fg-muted        --stone-600   / dark: --stone-400
--fg-subtle       --stone-500   / dark: --stone-500
--border          --stone-200   / dark: --stone-800
--border-strong   --stone-300   / dark: --stone-700
--primary         --ink-600     / dark: --ink-400
--primary-fg      white         / dark: --stone-950
--accent          --ember-500
--ring            --ink-500
```

### Rules

- **Audited, not asserted.** `packages/ui/scripts/contrast.mjs` computes every shipped pair from the
  OKLCH source and runs in CI. It reads the tokens rather than a screenshot, so it proves a pair can
  never be wrong rather than that one page looked fine the day it ran. It found four real defects the
  first time it ran: control borders at 1.45:1, dark-mode caption text at 3.84:1, and four hues whose
  text step was unreadable on its own tint.
- **Contrast minimums:** 4.5:1 body text, 3:1 large text and UI boundaries, **7:1 for anything on a
  station screen**. Verified in CI, not by eye.
- **Never pure black or pure white as a background.** `--stone-50` and `--stone-950`.
- **Colour is never the only signal.** Every status carries an icon or a label as well. Roughly one
  in twelve men is colour blind, and some of them run your check-in station.
- **Dark mode is a first-class target**, not an inversion. Booths and back rooms are dark, and stage
  areas are dark on purpose. Every spectrum hue has a dark-mode pair: `100` tints become `900`-level
  washes and text keys to the `100` end, so a colour-coded calendar is just as readable at night.
- **A hue is an identity, not a status.** Semantic colours mean one thing each, and a spectrum hue
  never signals success or danger.

### The spectrum

Eight hues at matched lightness and chroma, evenly spread around the wheel, so any two sit together
without clashing and no single one shouts. Assigned to things, not sprinkled on them.

It was twelve, and twelve was wrong. Twelve read as a paint chart, and the extra four sat close
enough to their neighbours that nobody could tell them apart at a glance, which is the only thing a
hue is for here. Eight is also closer to what a church actually has: five rooms, six teams, four
funds.

```css
:root {
  /* Matched L and C, hue rotated. 500 is the base, each has 100 / 500 / 700. */
  --hue-rose-100:   oklch(0.938 0.042  10);  --hue-rose-500:   oklch(0.635 0.168  12);  --hue-rose-700:   oklch(0.505 0.152  14);
  --hue-amber-100:  oklch(0.942 0.048  72);  --hue-amber-500:  oklch(0.732 0.156  70);  --hue-amber-700:  oklch(0.572 0.132  62);
  --hue-citron-100: oklch(0.944 0.050 105);  --hue-citron-500: oklch(0.742 0.148 110);  --hue-citron-700: oklch(0.582 0.126 108);
  --hue-fern-100:   oklch(0.938 0.044 142);  --hue-fern-500:   oklch(0.662 0.148 145);  --hue-fern-700:   oklch(0.522 0.128 147);
  --hue-teal-100:   oklch(0.936 0.040 196);  --hue-teal-500:   oklch(0.648 0.118 200);  --hue-teal-700:   oklch(0.508 0.104 202);
  --hue-sky-100:    oklch(0.936 0.042 232);  --hue-sky-500:    oklch(0.642 0.138 238);  --hue-sky-700:    oklch(0.505 0.128 240);
  --hue-indigo-100: oklch(0.934 0.044 268);  --hue-indigo-500: oklch(0.612 0.156 272);  --hue-indigo-700: oklch(0.478 0.142 274);
  --hue-violet-100: oklch(0.936 0.046 296);  --hue-violet-500: oklch(0.622 0.168 300);  --hue-violet-700: oklch(0.488 0.152 302);
}
```

`100` is the tint for backgrounds and chips. `500` is the identity, for dots, bars, and borders.
`700` is the text-safe version, at or above 4.5:1 on `--stone-50`. **Never put `500` text on a light
background**, and never fill a large area with `500`. Tint the area, key the text.

### Colour as data

Assignment rules, so colour means something consistently across the whole product:

| Thing | How it gets a colour |
|---|---|
| **Check-in rooms** | Each room owns a hue, chosen by the church. It prints on the child's label, tints the room card, and colours the supervisor dashboard tile. A volunteer directs a parent by saying "the teal room", which is faster and more accurate than reading a name. |
| **Teams** | Worship, tech, hospitality, children, ushers. Colour runs through the schedule grid, the plan, and the coverage dashboard, so James sees his team's rows instantly. |
| **Group types** | Small group, class, ministry team, committee. Drives the group finder filters and the calendar. |
| **Funds** | General, building, missions, benevolence. Drives every giving chart and the statement key, so a treasurer reads a chart without a legend. |
| **Ministries** | The master calendar is colour-coded by ministry, which is the only way a shared church calendar is ever legible. |
| **Pipeline stages** | A warm-to-cool ramp across the funnel, so progress reads as movement. |

Colours are assigned automatically on creation, spread around the wheel for maximum separation, and
**editable by the church**, because the youth ministry will have opinions.

### Where the interface is colourful

- **Dashboard tiles** are quiet by default: a plain surface, a hairline, and one small keyed mark in
  the domain's hue. At most one tile in a row is fully tinted, and only when it genuinely needs to be
  seen first. A row of six tinted tiles is decoration, not information.
- **Empty states** get a real illustration, drawn in spectrum hues, not a grey outline icon and an
  apology. A church's first week in the product should feel like an invitation.
- **Avatars** fall back to initials on a tinted chip, hue derived from the person's id, so individuals
  are recognisable before you read a name.
- **Calendars and schedule grids** carry the full spectrum. This is the screen the palette exists for.
- **Charts** use the spectrum in a fixed order, and a categorical series never changes colour between
  two views of the same data.
- **Milestones** get celebratory colour. A baptism recorded should look like something happened.

### Restraint, where it belongs

The canvas stays warm and quiet so the colour reads. Chrome, tables, and forms are stone, ink, and
one accent. Marketing and sign-in use the accent alone, never the whole spectrum: a rainbow says
nothing about the product except that we own a palette. **The station is the exception in the other direction**: the only colours on a check-in
screen are the room hue and `--critical`, because that screen has exactly two things to communicate
and adding a third is a safety problem.

## 4. Typography

A serif for display, a sans for UI, and a mono for codes, all from IBM Plex. The shared family gives
the platform one voice across headings, working screens, and the codes volunteers read aloud.

| Role | Face | Notes |
|---|---|---|
| Display | **IBM Plex Serif** | Headings, page titles, and marketing. A sturdy serif that gives headings a distinct hierarchy. |
| UI and body | **IBM Plex Sans** variable | Everything functional. Tabular figures enabled for tables and currency. |
| Mono | **IBM Plex Mono** | **Security codes, giving amounts in tables, batch totals.** Codes stay monospaced and the character pairs remain easy to distinguish when read aloud. |

Served from the app's own `public/fonts`, put there by `scripts/fonts.mjs`. No render-blocking
third party font request. Noto Color Emoji is the one exception and is linked from Google, because
it is several megabytes of numbered chunks; `apps/web/app/fonts-emoji.ts` says why.

### Scale

Office mode. Station and portal scale from the same ratio.

| Token | Size / line | Use |
|---|---|---|
| `display-lg` | 44 / 48, IBM Plex Serif | Page hero, empty states |
| `display` | 32 / 38, IBM Plex Serif | Page title |
| `heading` | 22 / 28, IBM Plex Serif | Section heading |
| `title` | 17 / 24, IBM Plex Sans 600 | Card and dialog title |
| `body` | 14 / 20, IBM Plex Sans 400 | Default |
| `body-lg` | 16 / 24, IBM Plex Sans 400 | Portal default, long form |
| `label` | 13 / 16, IBM Plex Sans 500 | Form labels, table headers |
| `caption` | 12 / 16, IBM Plex Sans 400 | Helper text, timestamps |
| `code` | 14 / 20, IBM Plex Mono | Codes, IDs |

**Never lighter than 400 for body text.** Thin weights on a warm background at 13px is how you lock
out a 70 year old volunteer.

## 5. Space, radius, elevation

**Space:** 4px base. `1 2 3 4 6 8 12 16 20 24 32 40 48 64` in units of 4px. Nothing off-scale.

**Radius:** `sm 6px`, `md 10px`, `lg 14px`, `xl 20px`, `full 9999px`. Larger surfaces get larger
radius. Inputs `md`, cards `lg`, sheets and dialogs `xl`. Pills only for badges and filter chips,
never for primary buttons.

**Elevation:** a hairline border plus a soft layered shadow. Border does the work, shadow does the
hinting.

```css
--shadow-sm: 0 1px 2px oklch(0 0 0 / 0.04), 0 1px 3px oklch(0 0 0 / 0.06);
--shadow-md: 0 2px 4px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.08);
--shadow-lg: 0 4px 8px oklch(0 0 0 / 0.04), 0 12px 32px oklch(0 0 0 / 0.10);
```

**A dialog's content is portaled.** It is rendered at the end of the body, so a submit button
inside a dialog is outside its own form in the DOM and submits nothing. Either put the form inside
the dialog, or give the button `form="<id>"`. And never wrap a submit in `DialogClose`: closing
tears the form down before React runs the action. Close the dialog from state, after the action
returns. A test walks the screens and fails on the second shape.

**Never the sparkle.** `Sparkles`, wands and star bursts are refused everywhere, for everything. It
is the mark every product reaches for when it wants a thing to feel magic, and reaching for it makes
this look like every other product. An icon names what the thing does, or there is no icon.

**No glassmorphism.** Backdrop blur reads as 2021, costs contrast, and costs frame rate on the
seven year old tablet running check-in. One exception: a sticky table header may use a solid
background with a hairline, not a blur.

## 6. Icons

**Lucide.** Open licence, comprehensive, consistent, and the current default for good reason.

- Stroke 1.5px at 16 and 20px, 2px at 24px and above. Never mix stroke widths in one view.
- Sizes: 16 (inline), 20 (buttons, office), 24 (portal), **32 (station)**.
- Icons are `currentColor`, always.
- **An icon-only control must carry an accessible label**, and on station density, icon-only controls
  are not permitted at all. A volunteer should never have to guess.
- **A repeated action is an icon alone.** Edit, archive, restore, remove, undo: where the action sits
  on every row of a list or every card in a grid, it is an `IconButton`. The words are identical on
  every row, so a column reading "Edit Archive Edit Archive" is noise. `IconButton` requires a
  `label`, which becomes the accessible name and the tooltip. An action that appears once on a
  screen keeps its words on the button, and so does a confirmation inside a dialog.
- One concept, one icon, registered in a single map. No two glyphs for "person".

## 7. Motion

Motion shows causality: where a thing came from, where it went, what changed. Nothing animates to be
admired.

| Token | Duration | Use |
|---|---|---|
| `instant` | 80ms | Colour and opacity on hover, focus, press |
| `fast` | 140ms | Tooltips, dropdowns, checkbox and toggle |
| `base` | 200ms | Dialogs, popovers, accordion, tab content |
| `slow` | 300ms | Sheets, drawers, page transitions |
| `spring` | 420ms, spring(0.5, 0.8) | Direct manipulation, drag, reorder, sheet drag-to-dismiss |

Easing: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` for things entering, `--ease-in-out:
cubic-bezier(0.65, 0, 0.35, 1)` for things moving. Exits are faster than entrances, always.

### What we animate

- **Route changes** through the View Transitions API. Shared element transitions where a card
  becomes a detail page, which is where the technique actually earns itself.
- **List insert, remove, and reorder**, so a new person appearing in a filtered list is visible
  rather than surprising.
- **Optimistic state.** A saved record settles, a failed one shakes once and reverts. The animation
  is the error message's first half.
- **Numbers that change** on a dashboard tick to their new value over `base`.
- **Skeletons, never spinners**, for anything expected to take over 300ms. A spinner tells the user
  nothing. Under 300ms, show nothing at all.

### What we never animate

Page load reveals. Scroll-triggered fades on functional screens. Anything on the check-in station
beyond a confirmation. Anything that delays an interaction by more than one frame.

### Reduced motion

`prefers-reduced-motion: reduce` means **no motion**, not less: opacity and instant position only.
It is honoured through a single token override, so a component cannot forget.

## 8. Station design rules

The station is a kiosk, not a page. It gets its own rules because a mistake here is a safety
incident, not a support ticket (PRD section 8.8).

- **One task per screen.** No sidebar, no breadcrumbs, no navigation. Find family, choose children,
  confirm, print. Four screens.
- **56px minimum target, 20px minimum text, 7:1 minimum contrast.**
- **Allergies and medical notes use `--critical`**, a full-width banner above the fold, with an icon
  and the word, and they cannot be scrolled past. R8.10 requires the volunteer to have seen it, so
  the layout makes not seeing it impossible.
- **Blocking warnings are blocking.** A custody restriction or a failed pickup code is a full-screen
  interrupt with a single deliberate action, not a toast and not a dismissible dialog.
- **Offline state is persistent chrome**, a bar across the top, always visible, never a toast. R8.22
  says the station never silently fails, and a notification that disappears is a silent failure.
- **No hover states.** Nothing depends on a pointer.
- **Numbers and codes in mono**, at `display` size, because a volunteer reads them aloud across a
  room.
- **Every confirmation shows what will be printed** before it prints.

## 9. Tokens are platform-neutral

Web now, native mobile later. Tokens live in `packages/ui/tokens/*.json` as the single source, and
are generated into CSS custom properties for web and a token module for a future React Native app.
Nobody hand-writes a hex value twice.

That is the whole mobile strategy at this stage: the PWA covers members in v1 (PRD section 8.17), a
native shell comes later, and when it does it inherits the palette, type scale, and motion
durations rather than reinventing them.

## 10. Front end stack

| | |
|---|---|
| CSS | **Tailwind CSS v4**, CSS-first config, native OKLCH, container queries |
| Components | **shadcn/ui** on **Radix primitives**. Accessible focus management, keyboard behaviour, and ARIA that we do not have to get right ourselves. Copied in and owned, not a dependency we cannot edit. |
| Icons | **Lucide** |
| Motion | **Motion** for components, **View Transitions API** for routes |
| Fonts | IBM Plex Serif, IBM Plex Sans, IBM Plex Mono, served from `public/fonts` |
| Charts | Minimal, one accent colour, no gradients, no 3D, direct labels over legends where they fit |
| Forms | React Hook Form plus Zod, with the same schema validating on the server |
| Tables | TanStack Table, virtualised above 200 rows |

## 11. Component inventory, v1

**Primitives:** Button (primary, secondary, ghost, danger), IconButton, Input, Textarea, Select,
Combobox, Checkbox, Radio, Switch, Slider, DatePicker, TimePicker, FileUpload, Avatar, Badge, Chip,
Tooltip, Separator, Skeleton, Spinner, Progress.

**Composites:** Card, DataTable (sort, filter, paginate, bulk select), EmptyState, PageHeader,
Sidebar, CommandPalette, Tabs, Accordion, Dialog, Sheet, Popover, DropdownMenu, ContextMenu, Toast,
Banner, Stepper, Timeline, PersonCard, HouseholdCard, Calendar, Scheduler.

**Station:** StationShell, FamilySearch, ChildPicker, CriticalBanner, CodeDisplay, PrintPreview,
OfflineBar, BlockingInterrupt.

**Portal:** BottomTabBar, MobileSheet, GiveForm, ScheduleCard, CheckInCard.

### Form validation

Ours, never the browser's. `noValidate` on the form, messages rendered through `Field`, which wires
`aria-invalid` and `aria-describedby` and gives the error `role="alert"`.

- **Errors appear on submit**, then follow along as the field is corrected. Nagging someone
  mid-typing, before they have finished, is not help.
- **The first invalid control takes focus**, so a keyboard or screen reader user lands on the problem
  rather than hunting for it.
- **Messages say what is wrong and what to do.** "That does not look like an email address. Check for
  a typo." Never "invalid", never blame, never shout.
- **The error carries an icon as well as colour**, because colour is never the only signal.
- Shared validators live in `packages/ui/src/lib/validate.ts`, so two forms cannot disagree about
  what a valid email is and the messages stay in one voice.

### Every component ships with

1. All states: default, hover, focus-visible, active, disabled, loading, error, empty.
2. A **visible focus ring**, `--ring`, 2px with a 2px offset. Never removed, in any state, for any
   reason.
3. Full keyboard operation.
4. Correct behaviour in all three density modes.
5. Light and dark.
6. An entry in the gallery route at `/design`, which is how this gets reviewed.

## 12. Anti-patterns

Explicitly refused, so the conversation happens once:

| Not this | Because |
|---|---|
| Glassmorphism and backdrop blur | 2021, costs contrast, costs frames on an old tablet |
| Body text under 400 weight | Locks out older volunteers |
| Grey text on grey backgrounds below 4.5:1 | It is not subtle, it is unreadable |
| Icon-only buttons without labels | Nobody guesses correctly under time pressure |
| Hover-only affordances | Half the product is touch |
| The same word on every row of a column | "Edit Archive Edit Archive" reads as texture. Repeated actions are `IconButton` |
| A tile whose title is the only clickable part | The whole tile stands for the thing. Stretch the title's link across the card |
| Pure black or pure white backgrounds | Harsh, and kills the warmth the palette exists for |
| Toast-only error reporting | Toasts vanish. Errors must persist near their cause |
| Hint text explaining what a field is for | A label and an error are enough. Hints make a short form look long |
| The contrast construction: "X, never Y", "X, not Y", "Nothing is deleted" | A tic. Say the one true thing and stop |
| Reassurance copy in banners | If the title says it, the sentence under it is padding. A screen header's one line saying what the screen is for is the exception, through `PageHeader` |
| Spinners for long operations | Use skeletons, or a real progress indicator |
| Scroll-triggered animation on functional screens | Delays work, breaks find-in-page |
| Modal stacking | If a dialog opens a dialog, the flow is wrong |
| More than one primary button in a view | Then none of them is primary |
| Placeholder text as the label | It disappears exactly when it is needed |
| A required field with nothing to say so | The asterisk is the one mark everyone already reads. Pass `required` to `Field` |
| Native browser validation bubbles | Unstyled, unlocalised, vanish on their own, and look like a different product. Put `noValidate` on every form and render the message through `Field`. |
| Any default browser UI we can replace | Validation bubbles, `alert()`, `confirm()`, the default file input. If the browser drew it, it does not match the system. |
| Emoji as iconography | Renders differently everywhere, reads as unserious |
| A spectrum swatch on every element | Colour marks identity. Used everywhere it marks nothing, and the colour that does mean something gets lost |
