import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * The contrast audit (R22.7, N7).
 *
 * Every colour in the product is OKLCH in tokens/color.json, so the pairs can be
 * checked from the source rather than by screenshotting a running app. That
 * matters: a screenshot test tells you a page was fine on the day it ran, and
 * this tells you a token pair can never be wrong.
 *
 * Thresholds come from docs/design-system.md: 4.5:1 for body text, 3:1 for a UI
 * boundary a person has to see but not read, and 7:1 on a station screen, which
 * is a Sunday kiosk read at arm's length by someone in reading glasses.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
export const tokens = JSON.parse(readFileSync(join(HERE, "..", "tokens", "color.json"), "utf8"));

// ---------------------------------------------------------------------------
// Colour maths. OKLCH to sRGB, then WCAG relative luminance.
// ---------------------------------------------------------------------------

/** oklch(L C H) and oklch(L C H / A), plus #rrggbb, which the tokens also use. */
export function parseColour(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }

  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/.exec(value.trim());
  if (!m) throw new Error(`Cannot parse colour: ${value}`);
  return oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** Linear light to WCAG relative luminance. Out-of-gamut values are clamped. */
export function luminance(rgb) {
  const channel = (v) => Math.min(1, Math.max(0, v));
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrast(a, b) {
  const la = luminance(parseColour(a));
  const lb = luminance(parseColour(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Resolving a semantic token to a literal colour
// ---------------------------------------------------------------------------

/** "{stone.900}" points into ramps. Anything else is already a colour. */
export function resolve(value) {
  const ref = /^\{([a-z]+)\.(\w+)\}$/i.exec(value);
  if (!ref) return value;
  const ramp = tokens.ramps[ref[1]];
  if (!ramp || !ramp[ref[2]]) throw new Error(`Unknown token reference: ${value}`);
  return ramp[ref[2]];
}

const sem = (theme, name) => resolve(tokens.semantic[theme][name]);

// ---------------------------------------------------------------------------
// The pairs
// ---------------------------------------------------------------------------

/**
 * Every pair the product actually puts on screen, with the rule it has to meet.
 * A pair that is not listed here is a pair nobody has thought about.
 */
export function pairs() {
  const out = [];
  const add = (label, fg, bg, min) => out.push({ label, fg, bg, min });

  for (const theme of ["light", "dark"]) {
    const on = (bg) => sem(theme, bg);

    // Body text. The thing a person reads.
    // R24.4. The washed frame is read on as much as any panel: the nav rows
    // down the rail and the screen's own name across the top.
    for (const bg of ["canvas", "surface", "sunken"]) {
      add(`${theme}: fg on ${bg}`, sem(theme, "fg"), on(bg), 4.5);
      add(`${theme}: fg-muted on ${bg}`, sem(theme, "fg-muted"), on(bg), 4.5);
    }

    // Secondary text. Captions and hints, still read, so still 4.5.
    add(`${theme}: fg-subtle on canvas`, sem(theme, "fg-subtle"), on("canvas"), 4.5);
    add(`${theme}: fg-subtle on surface`, sem(theme, "fg-subtle"), on("surface"), 4.5);
    /* The sunken fill is where the pills and chips sit, and fg-subtle on it
       was never audited, so the household member's role on its pill failed
       at AA while the two pairs above passed. */
    add(`${theme}: fg-subtle on sunken`, sem(theme, "fg-subtle"), on("sunken"), 4.5);
    /* R24.4. The rail is solid ink with its own foreground, so it is audited
       as its own pair rather than against the canvas. */
    add(`${theme}: shell-fg on shell`, sem(theme, "shell-fg"), on("shell"), 4.5);
    add(`${theme}: shell-muted on shell`, sem(theme, "shell-muted"), on("shell"), 4.5);

    // Filled controls.
    add(`${theme}: primary-fg on primary`, sem(theme, "primary-fg"), sem(theme, "primary"), 4.5);
    add(`${theme}: accent-fg on accent`, sem(theme, "accent-fg"), sem(theme, "accent"), 4.5);

    // Boundaries and focus. Seen, not read.
    add(`${theme}: line-strong on canvas`, sem(theme, "line-strong"), on("canvas"), 3);
    add(`${theme}: line-strong on surface`, sem(theme, "line-strong"), on("surface"), 3);
    add(`${theme}: ring on canvas`, sem(theme, "ring"), on("canvas"), 3);
    add(`${theme}: ring on surface`, sem(theme, "ring"), on("surface"), 3);

    // Status. The tint and its text move together per theme, which is the whole
    // reason each status carries a dark pair.
    //
    // `base` is only ever put under white text for danger and critical, on the
    // destructive button and the station interrupt. The other three bases are
    // used as a dot or a rule, never as a text background, so asserting white on
    // them would be measuring a combination the product does not ship.
    const WHITE_ON_BASE = ["danger", "critical"];
    for (const [name, value] of Object.entries(tokens.status)) {
      const set = theme === "dark" ? value.dark : value;
      add(`${theme}: ${name} text on ${name} soft`, set.text, set.soft, 4.5);
      if (WHITE_ON_BASE.includes(name)) {
        add(`${theme}: white on ${name} base`, "#ffffff", set.base, 4.5);
      }
    }

    // The spectrum. A hue tag is a tint with its key colour as text.
    for (const [hue, steps] of Object.entries(tokens.spectrum)) {
      const tint = theme === "dark" ? steps["900"] : steps["100"];
      const key = theme === "dark" ? steps["100"] : steps["700"];
      add(`${theme}: ${hue} key on ${hue} tint`, key, tint, 4.5);

      /*
       * R22.7. A hue's key colour is also used as text straight on a card,
       * without its tint behind it: the follow-ups board colours each column
       * heading by its stage. That pair was never audited, and axe found it
       * failing on the board. Auditing it here is what stops the next screen
       * doing the same.
       */
      add(`${theme}: ${hue} key on surface`, key, on("surface"), 4.5);

      /*
       * The follow-ups board puts a coloured heading on its own wash rather
       * than on a card, which is darker than surface in light mode and lighter
       * in dark mode. The darkest step is what has the room there.
       */
      const deepest = theme === "dark" ? steps["100"] : steps["900"];
      add(`${theme}: ${hue} 900 on board`, deepest, sem(theme, "board"), 4.5);
    }

    /*
     * R22.7. Text colours against the board wash, for the same reason. The
     * board carries ordinary words as well as coloured headings, and
     * fg-subtle does not have the room on it that it has on a card.
     */
    add(`${theme}: fg on board`, sem(theme, "fg"), sem(theme, "board"), 4.5);
    add(`${theme}: fg-muted on board`, sem(theme, "fg-muted"), sem(theme, "board"), 4.5);
  }

  return out;
}

/** Every pair with its measured ratio and whether it passes. */
export function audit() {
  return pairs().map((p) => {
    const ratio = contrast(p.fg, p.bg);
    return { ...p, ratio: Math.round(ratio * 100) / 100, passes: ratio >= p.min };
  });
}

// Run directly for a report.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = audit();
  const failed = results.filter((r) => !r.passes);
  for (const r of results) {
    const mark = r.passes ? "pass" : "FAIL";
    console.log(`${mark}  ${String(r.ratio).padStart(6)}  need ${r.min}  ${r.label}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} pairs pass.`);
  if (failed.length) process.exit(1);
}
