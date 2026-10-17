import * as React from "react";

/**
 * R24.6. A row of figures.
 *
 * Two to a row on a phone, because one figure to a screenful means a reader
 * scrolls past four of them before reaching anything they came for. The
 * tiles grow to whatever the room allows above that.
 */
export function Figures({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:[grid-template-columns:repeat(auto-fit,minmax(min(215px,100%),1fr))]">
      {children}
    </div>
  );
}

/**
 * R18.x. One number across the top of a report.
 *
 * The same shape as the dashboard's tiles, without the handle: a report is
 * read rather than arranged. A hue dot keys it to whatever it stands for in
 * the charts underneath.
 */
export function Figure({
  label,
  value,
  sub,
  hue,
  icon,
  note,
}: {
  label: string;
  value: string;
  /**
   * One line qualifying the figure, where there is one worth the room. A
   * count of the rows behind the figure is not: "2 gifts" under $22,041.50
   * repeats what the list below already shows.
   */
  sub?: string;
  hue: string;
  /**
   * A mark in the hue, where the tile is one of a row that stands for
   * different kinds of thing rather than slices of one chart. The dot is
   * enough when they are all the same kind.
   */
  icon?: React.ReactNode;
  /** One more fact under the figure, where there is one worth the line. */
  note?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] border border-line bg-surface p-4 shadow-sm sm:p-5">
      <span className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
        {icon ? (
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-4"
            style={{
              background: `var(--hue-${hue}-100)`,
              color: `var(--hue-${hue}-700)`,
            }}
          >
            {icon}
          </span>
        ) : (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: `var(--hue-${hue}-500)` }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      {/* The figure steps down on a narrow screen rather than overflowing
          its tile: "$123,290.03" at 36px does not fit half of a phone. */}
      <p
        data-numeric
        className="mt-2 font-display text-[26px] leading-8 text-fg sm:mt-3 sm:text-[36px] sm:leading-[42px]"
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[13px] text-fg-muted">{sub}</p> : null}
      {note ? (
        <p data-numeric className="mt-1 text-[13px] text-warning-text">{note}</p>
      ) : null}
    </div>
  );
}
