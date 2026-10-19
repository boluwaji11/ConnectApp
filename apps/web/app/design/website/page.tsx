import {
  PALETTES, SITE_CONTRAST_PAIRS, SITE_PAIRINGS, SITE_PALETTES, contrast,
  shortPairs, type Palette,
} from "@connectapp/db/rules";
import { PageTitle, Section } from "@/components/section";
import { PAIRINGS, SITE_PRESETS, themeStyle } from "@/components/church-site/theme";

/** The gallery is a tool for us, so it names itself plainly. */
export const metadata = { title: "Design · church websites" };

/**
 * HRT-380. What a church's own website is drawn in.
 *
 * Separate from the product's own colour, because a church's site is not the
 * admin product in a different hue: it has its own grounds, its own faces and
 * its own shapes, and this is where they are looked at side by side. The
 * contrast figures are the ones the test in packages/db asserts, printed so a
 * change can be judged before it ships rather than after it fails.
 */

const SWATCHES: (keyof Palette)[] = [
  "bg", "surface", "ink", "muted", "line", "primary", "primaryInk", "accent",
];

function Swatches({ palette }: { palette: Palette }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SWATCHES.map((token) => (
        <div key={token} className="flex flex-col gap-1">
          <span
            className="block size-12 rounded-md border border-line"
            style={{ background: String(palette[token]) }}
          />
          <span className="text-caption text-fg-muted">{token}</span>
        </div>
      ))}
    </div>
  );
}

/** A page's worth of the palette, at the size it is actually read. */
function Specimen({ name, palette }: { name: string; palette: Palette }) {
  const short = shortPairs(palette);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-label font-medium capitalize text-fg">{name}</h3>
        <span className={short.length ? "text-caption text-danger" : "text-caption text-fg-muted"}>
          {short.length ? short.join("; ") : "every pair clears"}
        </span>
      </div>
      <div
        className="overflow-hidden rounded-lg border border-line"
        style={{ background: palette.bg, color: palette.ink }}
      >
        <div className="flex flex-col gap-3 p-5">
          <p className="m-0 text-[26px] leading-tight" style={{ color: palette.ink }}>
            A church on the corner
          </p>
          <p className="m-0 text-body" style={{ color: palette.muted }}>
            We are a church in this neighbourhood. Whoever you are, there is a seat for you here.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex rounded-md px-3 py-1.5 text-label font-semibold"
              style={{ background: palette.primary, color: palette.primaryInk }}
            >
              Service times
            </span>
            <span
              className="inline-flex rounded-md border px-3 py-1.5 text-label font-semibold"
              style={{ borderColor: palette.primary, color: palette.primary }}
            >
              Find us
            </span>
            <span
              className="inline-flex rounded-md px-3 py-1.5 text-label font-semibold"
              style={{ background: palette.accent, color: palette.primaryInk }}
            >
              Give
            </span>
          </div>
          <div
            className="rounded-md p-3"
            style={{ background: palette.surface, border: `1px solid ${palette.line}` }}
          >
            <p className="m-0 text-caption" style={{ color: palette.muted }}>
              A card, on the surface, with a line around it.
            </p>
          </div>
        </div>
      </div>
      <Swatches palette={palette} />
    </div>
  );
}

export default function WebsiteDesign() {
  return (
    <>
      <PageTitle
        title="Church websites"
        lede="The grounds, faces and shapes a church's own website is drawn in. Nothing here is a product token: a published church site shares none of them."
      />

      <Section
        title="Grounds"
        note="Eight, each a whole look rather than a hue swap. The figure beside each one is from the same test that runs in CI."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          {SITE_PALETTES.map((key) => (
            <Specimen key={key} name={key} palette={PALETTES[key]} />
          ))}
        </div>
      </Section>

      <Section
        title="Faces"
        note="Six pairings. A church sets one, and only its two families are served."
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_PAIRINGS.map((key) => (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-lg border border-line p-4"
              style={{
                fontFamily: PAIRINGS[key].body,
              }}
            >
              <span className="text-caption uppercase tracking-wide text-fg-muted">{key}</span>
              <span
                className="text-[30px] leading-tight text-fg"
                style={{
                  fontFamily: PAIRINGS[key].display,
                  letterSpacing: PAIRINGS[key].displayTracking,
                }}
              >
                Welcome to this church
              </span>
              <span className="text-body text-fg-muted">
                We gather every week and there is a seat for you. Come as you are.
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Presets"
        note="What a church chooses before it touches a single control. Each one sets the palette, the pairing, the type scale, the shapes and the rhythm together."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_PRESETS.map((preset) => {
            const palette = PALETTES[preset.theme.palette];
            return (
              <div
                key={preset.key}
                className="overflow-hidden rounded-lg border border-line"
                style={{
                  ...themeStyle({ ...preset.theme, colors: {} }),
                  background: palette.bg,
                  color: palette.ink,
                }}
              >
                <div className="flex flex-col gap-2 p-5">
                  <span
                    className="text-[24px] leading-tight"
                    style={{ fontFamily: PAIRINGS[preset.theme.fonts].display }}
                  >
                    {preset.key}
                  </span>
                  <span
                    className="inline-flex w-fit px-3 py-1.5 text-[13px] font-semibold"
                    style={{
                      background: palette.primary,
                      color: palette.primaryInk,
                      borderRadius: "var(--s-button-corner)",
                    }}
                  >
                    Plan your visit
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="What is checked"
        note="The pairs a page actually sets, and what each one has to clear."
      >
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body text-fg-muted">
          {SITE_CONTRAST_PAIRS.map((pair) => (
            <li key={`${pair.fore}-${pair.back}`}>
              {pair.fore} on {pair.back}, at least {pair.least}:1. Worst across the eight:{" "}
              {Math.min(
                ...SITE_PALETTES.map((key) =>
                  contrast(String(PALETTES[key][pair.fore]), String(PALETTES[key][pair.back]))),
              ).toFixed(2)}:1
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
