import Link from "next/link";
import { Check, Minus } from "lucide-react";
import {
  withTenant, getChurch, canEditPeople, canReadIncidents,
  connectedness, connectednessSummary,
} from "@connectapp/db";
import { t, plural } from "@connectapp/i18n";
import { Screen } from "@/components/screen";
import { requireScreen } from "@/lib/shell-data";
import { Denied } from "@/components/denied";
import { Empty } from "@/components/empty";
import { churchNow } from "@/lib/church-now";
import { ReportFrame, backBy, windowOf } from "../frame";
import { Figure, Figures } from "../figure";
import { RowBars } from "../charts";
import { tabMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

/** R17.1. What the browser tab says. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  return tabMetadata(t("reports.title"));
}

/** The hue per band, from zero of four to four of four. */
const BAND_HUE = ["rose", "clay", "amber", "sky", "fern"] as const;

/**
 * R18.9. The connectedness indicator.
 *
 * Four boxes a person either has or has not: they turn up, they give, they
 * serve, they are in a group. Nothing is weighted and nothing is scored,
 * because the whole value of it is that a pastor can explain it in one
 * sentence to the person it describes.
 *
 * Giving is a yes or a no and never an amount, so this screen is readable by
 * a role that may not see what anybody gave.
 */
export default async function ConnectedReport({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; score?: string }>;
}) {
  const { days, score } = await searchParams;
  const session = await requireScreen();
  if (!canEditPeople(session) && !canReadIncidents(session)) {
    return <Denied role={session.role} action="readReports" church={session.tenantSlug} />;
  }

  const window = windowOf(days);
  /* R18.9. Clicking a band narrows the list to the people in it, which is the
     acceptance criterion: every part of the indicator opens its own people. */
  const want = /^[0-4]$/.test(score ?? "") ? Number(score) : undefined;

  const { summary, people } = await withTenant(
    { tenantId: session.tenantId, role: session.role },
    async (tx) => {
      const clock = churchNow((await getChurch(tx, session.tenantId))?.timezone ?? "America/Chicago");
      const range = { from: backBy(clock.date, window), to: clock.date };
      return {
        summary: await connectednessSummary(tx, range),
        people: await connectedness(tx, { ...range, score: want }),
      };
    },
  );

  const here = `?days=${window}`;

  return (
    <Screen wide>
      <ReportFrame
        title={t("reports.connected.title")}
        window={window}
        path="connected"
      >
        {summary.counted === 0 ? (
          <Empty icon="members" title={t("reports.none")} />
        ) : (
          <>
            <Figures>
              <Figure
                label={t("reports.connected.attends")}
                value={String(summary.attends)}
                hue="violet"
                sub={t("reports.connected.ofCounted", { of: String(summary.counted) })}
              />
              <Figure
                label={t("reports.connected.gives")}
                value={String(summary.gives)}
                hue="teal"
                sub={t("reports.connected.ofCounted", { of: String(summary.counted) })}
              />
              <Figure
                label={t("reports.connected.serves")}
                value={String(summary.serves)}
                hue="amber"
                sub={t("reports.connected.ofCounted", { of: String(summary.counted) })}
              />
              <Figure
                label={t("reports.connected.inGroup")}
                value={String(summary.inGroup)}
                hue="sky"
                sub={t("reports.connected.ofCounted", { of: String(summary.counted) })}
              />
            </Figures>

            <RowBars
              title={t("reports.connected.shape")}
              rows={summary.bands.map((count, at) => ({
                key: String(at),
                label: plural("reports.connected.band", at),
                value: count,
              }))}
            />

            {/* R18.9. Every band opens the people in it. */}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/reports/connected${here}`}
                aria-current={want === undefined ? "page" : undefined}
                /* R22.7. text-canvas, not text-bg: there is no `bg` colour, so
                   that class did nothing and the chosen pill drew near-black
                   words on a near-black fill. */
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                  want === undefined ? "bg-fg text-canvas" : "bg-sunken text-fg hover:bg-line"
                }`}
              >
                {t("reports.connected.everybody")}
              </Link>
              {summary.bands.map((count, at) => (
                <Link
                  key={at}
                  href={`/reports/connected${here}&score=${at}`}
                  aria-current={want === at ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
                    want === at ? "bg-fg text-canvas" : "bg-sunken text-fg hover:bg-line"
                  }`}
                >
                  {plural("reports.connected.band", at)} · {count}
                </Link>
              ))}
            </div>

            {/*
              The four boxes, drawn rather than tabulated. A tick a reader can
              run their eye down four columns of says more than four numbers,
              and this screen's whole job is being read at a glance.
            */}
            <section className="overflow-hidden rounded-[14px] border border-line bg-surface">
              <table className="w-full table-fixed border-collapse">
                <thead>
                  <tr className="border-b border-line bg-sunken">
                    <th className="w-[40%] px-4 py-2.5 text-left text-caption font-semibold text-fg-muted">
                      {t("reports.serving.person")}
                    </th>
                    {[
                      t("reports.connected.attends"),
                      t("reports.connected.gives"),
                      t("reports.connected.serves"),
                      t("reports.connected.inGroup"),
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-2 py-2.5 text-center text-caption font-semibold text-fg-muted"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((one) => (
                    <tr key={one.memberId} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/members/${one.slug}`}
                          className="truncate font-medium text-fg no-underline hover:underline"
                        >
                          {one.name}
                        </Link>
                      </td>
                      {[one.attends, one.gives, one.serves, one.inGroup].map((has, at) => (
                        <td key={at} className="px-2 py-2.5 text-center">
                          {has ? (
                            <Check
                              className="inline size-4"
                              style={{ color: `var(--hue-${BAND_HUE[4]}-key)` }}
                              aria-label={t("reports.connected.yes")}
                            />
                          ) : (
                            <Minus
                              className="inline size-4 text-fg-subtle"
                              aria-label={t("reports.connected.no")}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </ReportFrame>
    </Screen>
  );
}
