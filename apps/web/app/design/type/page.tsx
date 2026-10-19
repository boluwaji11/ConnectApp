import { CodeDisplay } from "@connectapp/ui";
import { PageTitle, Section } from "@/components/section";

/** The gallery is a tool for us, so it names itself plainly. */
export const metadata = { title: "Design · type" };

/*
 * The faces are served from `public/fonts` and named in `app/fonts.css`, so a
 * family is set by its own name here rather than through a loader. The two
 * this screen alone reaches, Atkinson Hyperlegible Next and JetBrains Mono,
 * are in `scripts/fonts.mjs` for that reason.
 */
const FONT_OPTIONS = [
  {
    name: "IBM Plex",
    description: "IBM Plex Sans · IBM Plex Serif · IBM Plex Mono",
    sans: "var(--font-ibm-plex-sans)",
    serif: "var(--font-ibm-plex-serif)",
    mono: "var(--font-ibm-plex-mono)",
  },
  {
    name: "Source",
    description: "Source Sans 3 · Source Serif 4 · IBM Plex Mono",
    sans: '"Source Sans 3", sans-serif',
    serif: '"Source Serif 4", serif',
    mono: '"IBM Plex Mono", monospace',
  },
  {
    name: "Fraunces / Inter",
    description: "Fraunces · Inter · JetBrains Mono",
    sans: '"Inter", sans-serif',
    serif: '"Fraunces", serif',
    mono: '"JetBrains Mono", monospace',
  },
  {
    name: "Atkinson",
    description: "Atkinson Hyperlegible Next · IBM Plex Serif · IBM Plex Mono",
    sans: '"Atkinson Hyperlegible Next", sans-serif',
    serif: '"IBM Plex Serif", serif',
    mono: '"IBM Plex Mono", monospace',
  },
  {
    name: "System",
    description: "System sans · IBM Plex Serif · system mono",
    sans: "system-ui, sans-serif",
    serif: '"IBM Plex Serif", serif',
    mono: "ui-monospace, SFMono-Regular, monospace",
  },
] as const;

const SCALE = [
  ["display-lg", "Page hero, empty states", "font-display text-display-lg"],
  ["display", "Page title", "font-display text-display"],
  ["heading", "Section heading", "font-display text-heading"],
  ["title", "Card and dialog title", "text-title"],
  ["body-lg", "Portal default, long form", "text-body-lg"],
  ["body", "Default", "text-body"],
  ["label", "Form labels, table headers", "text-label"],
  ["caption", "Helper text, timestamps", "text-caption"],
  ["code", "Codes and identifiers", "font-mono text-code"],
];

export default function Type() {
  return (
    <>
      <PageTitle
        title="Type"
        lede="Typography carries the hierarchy. The same church-management screens are shown in each font system."
      />

      <Section
        title="Font options, preview only"
        note="Compare the same church-management content in each system. These specimens are isolated to this gallery and do not change the platform."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {FONT_OPTIONS.map((option) => (
            <article
              key={option.name}
              className="min-w-0 rounded-lg border border-line bg-surface p-4"
              style={{ fontFamily: option.sans }}
            >
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h3
                  className="m-0 text-[22px] font-semibold text-fg"
                  style={{ fontFamily: option.serif }}
                >
                  {option.name}
                </h3>
                <span className="text-caption text-fg-muted">{option.description}</span>
              </div>

              <p
                className="mb-4 mt-0 text-[25px] leading-tight text-fg"
                style={{ fontFamily: option.serif }}
              >
                Church management, made simple, for free
              </p>

              <div className="overflow-hidden rounded-md border border-line">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 bg-sunken px-3 py-2 text-[12px] font-semibold text-fg-muted">
                  <span>Member</span>
                  <span>Last attended</span>
                  <span>Status</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-t border-line px-3 py-2.5 text-[13px] text-fg">
                  <span className="truncate">Adaeze Okafor</span>
                  <span className="whitespace-nowrap">Oct 11, 2026</span>
                  <span>Present</span>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-primary-soft p-3">
                <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-fg-muted">
                  Check-in station
                </p>
                <p className="mb-1 mt-2 text-[20px] font-semibold leading-7 text-fg">
                  Maya Okafor · Room 3
                </p>
                <p className="m-0 text-[16px] text-fg">
                  Allergy: peanuts
                  <span className="ml-3" style={{ fontFamily: option.mono }}>
                    4B07
                  </span>
                </p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="The three faces">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="font-display text-display leading-none">Aa</p>
            <p className="mt-3 text-label text-fg">IBM Plex Serif</p>
            <p className="text-caption text-fg-muted">Display. Headings and page titles.</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="font-sans text-display font-semibold leading-none">Aa</p>
            <p className="mt-3 text-label text-fg">IBM Plex Sans</p>
            <p className="text-caption text-fg-muted">Everything functional. Tabular figures in tables and currency.</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="font-mono text-display font-medium leading-none">Aa</p>
            <p className="mt-3 text-label text-fg">IBM Plex Mono</p>
            <p className="text-caption text-fg-muted">Codes and amounts. 0 and O, 1 and l are unambiguous.</p>
          </div>
        </div>
      </Section>

      <Section
        title="Why the mono matters"
        note="A volunteer reads a pickup code aloud across a room. If the face makes 0 look like O, a child goes to the wrong adult. This is a safety decision wearing a typography hat."
      >
        <div className="flex flex-wrap items-end gap-8 rounded-lg border border-line bg-surface p-6">
          <CodeDisplay code="4B07" label="Pickup code" />
          <div className="flex flex-col gap-1">
            <p className="font-mono text-heading">0O 1lI 5S 8B 2Z</p>
            <p className="text-caption text-fg-muted">Ambiguous pairs, set in the chosen face.</p>
          </div>
        </div>
      </Section>

      <Section title="Scale" note="Office mode. Station and portal scale from the same ratio. Never lighter than 400 for body text, because thin weights at 13px lock out a 70 year old volunteer.">
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {SCALE.map(([token, use, cls]) => (
            <div key={token as string} className="flex flex-wrap items-baseline justify-between gap-4 p-4">
              <p className={cls as string}>The quick brown fox</p>
              <div className="flex shrink-0 flex-col items-end">
                <code className="text-code text-fg-muted">{token}</code>
                <span className="text-caption text-fg-subtle">{use}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="In context" note="Fewer containers, better type.">
        <article className="max-w-prose rounded-lg border border-line bg-surface p-6">
          <p className="text-label text-accent-fg/70 uppercase tracking-wide">Sunday, 12 October</p>
          <h3 className="mt-1 font-display text-display text-fg">Morning Service</h3>
          <p className="mt-3 text-body-lg text-fg-muted">
            Four songs, a baptism, and the second week of the series. Running time is 74 minutes, which is
            six over, so the announcements come down to two.
          </p>
          <p className="mt-4 text-[length:var(--d-text-body)] text-fg">
            James has the set. Ruth has four volunteers in the under-fives room and needs a fifth.
          </p>
        </article>
      </Section>
    </>
  );
}
