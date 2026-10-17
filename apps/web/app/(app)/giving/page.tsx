import Link from "next/link";
import {
  withTenant, listFunds, fundTotals, listBatches, countBatches,
  listGifts, countGifts, givingTotals, onTheWay, listCampaigns,
  getStripeAccount, listRecurring, countRecurring, recurringMonthly,
  canManageGiving, canReadGivingAmounts,
} from "@connectapp/db";
import {
  Archive, Banknote, CalendarCheck, CornerDownRight, Download as DownloadIcon, FileText,
  Landmark, Plus, Printer, Repeat, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import { t, plural } from "@connectapp/i18n";
import { Screen } from "@/components/screen";
import { requireScreen, shellData } from "@/lib/shell-data";
import { churchNow } from "@/lib/church-now";
import { MyGiving } from "./mine";
import { Empty } from "@/components/empty";
import { Figure, Figures } from "@/app/(app)/reports/figure";
import { Pager } from "@/components/pager";
import { money, groupAmount } from "@/lib/money";
import { briefDate, longDate } from "@/lib/dates";
import { StartCount } from "./start-count";
import { GiftPanel } from "./gift-panel";
import { RefundGift } from "./refund";
import { AttachGift } from "./attach";
import { GiftState } from "./gift-state";
import { giftRows } from "./rows";
import { GiftCards } from "./gift-cards";
import { CountCards } from "./count-cards";
import { RepeatMark } from "./repeat-mark";
import { Download } from "@/components/download";
import { StopRepeating } from "./stop-repeating";
import { Button, Tooltip, Thead, Th } from "@connectapp/ui";
import { Panel, Nothing, Destination } from "./panel";
import { GivingFilters } from "./filters";
import { narrowingFrom, narrowingCount, periodRange } from "./narrowing";
import { tabMetadata } from "@/lib/page-metadata";

export const dynamic = "force-dynamic";

/** How much of each list is on one page. */
const COUNTS_PER_PAGE = 8;
const GIFTS_PER_PAGE = 10;
/** How many of a side panel's rows fit before it stops being a glance. */
const ASIDE_ROWS = 8;

/** R17.1. Giving to whoever runs it, My giving to everybody else. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  const session = await requireScreen();
  const theirs = !canManageGiving(session) && !canReadGivingAmounts(session);
  return tabMetadata(t(theirs ? "mine.giving.title" : "giving.title"));
}

/** A page number out of the address, which may hold anything at all. */
const pageFrom = (raw?: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

/**
 * R13.21. What has come in, and what is still being counted.
 *
 * The screen a treasurer opens on a Monday, read top to bottom in the order
 * the questions arrive: what came in, where the rest of the month's work
 * lives, did the count get entered, is that gift right, and what the church
 * is holding. Each of those is its own panel, because the two tables and a
 * column of loose cards this replaced read as one wall of figures.
 */
export default async function GivingPage({
  searchParams,
}: {
  searchParams: Promise<{
    counts?: string; gifts?: string;
    period?: string; fund?: string; how?: string; state?: string; repeats?: string;
  }>;
}) {
  const asked = await searchParams;
  const session = await requireScreen();
  const manage = canManageGiving(session);
  const amounts = canReadGivingAmounts(session);

  /*
   * R17.4. The same address read from the other side.
   *
   * A member opening Giving is asking about their own, the way opening Groups
   * asks which groups they are in. Two routes for one word would have meant
   * two places for a link to point and one of them always wrong.
   */
  if (!manage && !amounts) return <MyGiving session={session} page={pageFrom(asked.gifts)} />;

  const ctx = {
    tenantId: session.tenantId,
    role: session.role,
    userId: session.userId,
    permissions: session.permissions,
  };

  const countsPage = pageFrom(asked.counts);
  const giftsPage = pageFrom(asked.gifts);
  const narrowing = narrowingFrom(asked);
  const repeatsPage = pageFrom(asked.repeats);

  /*
   * The frame around this screen has already read the church, and the clock
   * this page runs on comes out of it. Reading it again was a second trip for
   * a timezone, and every read below waited behind it.
   */
  const profile = (await shellData(session)).church;
  const today = churchNow(profile?.timezone ?? "America/Chicago").date;
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);

  /* R13.21. What the filter is asking for, as dates and as a clause. */
  const span = periodRange(narrowing.period, today);
  const narrowed = {
    ...span,
    fundIds: narrowing.fundIds,
    methods: narrowing.methods,
    statuses: narrowing.statuses,
  };

  const read = await withTenant(ctx, async (tx) => {
    /*
     * Fourteen independent reads previously ran in sequence, one round trip
     * each, on the screen a treasurer opens most often. They are issued
     * together on the one connection.
     */
    const [
      funds, everyFund, byFund, thisYear, thisMonth, counts, allCounts,
      recent, allGifts, coming, recurring, allRecurring, expected, campaigns, stripe,
    ] = await Promise.all([
      listFunds(tx),
      /* R13.9. Archiving a fund takes it off the pickers, and the money
         given to it is still the church's. Read here so the board's two
         totals stay true and the fund it came from can still be named. */
      listFunds(tx, { includeArchived: true }),
      fundTotals(tx, { from: `${year}-01-01`, to: `${year}-12-31` }),
      givingTotals(tx, { from: `${year}-01-01`, to: `${year}-12-31` }),
      givingTotals(tx, { from: `${month}-01`, to: today }),
      listBatches(tx, COUNTS_PER_PAGE, (countsPage - 1) * COUNTS_PER_PAGE),
      countBatches(tx),
      listGifts(tx, ctx, {
        ...narrowed,
        limit: GIFTS_PER_PAGE,
        offset: (giftsPage - 1) * GIFTS_PER_PAGE,
      }),
      countGifts(tx, narrowed),
      /* R13.2. Bank transfers authorised and not yet arrived. */
      onTheWay(tx),
      // R13.3. What the church is expecting without anybody doing anything.
      listRecurring(tx, ctx, {
        activeOnly: true,
        limit: ASIDE_ROWS,
        offset: (repeatsPage - 1) * ASIDE_ROWS,
      }),
      countRecurring(tx, { activeOnly: true }),
      recurringMonthly(tx),
      listCampaigns(tx),
      getStripeAccount(tx),
    ]);

    return {
      today, funds, everyFund, byFund, thisYear, thisMonth, counts, allCounts,
      recent, allGifts, coming, recurring, allRecurring, expected, campaigns, stripe,
    };
  });

  const fundList = read.funds.map((one) => ({ id: one.id, name: one.name }));
  /* A church with nothing in it yet, rather than a filter that matched
     nothing: the big empty state is an invitation to start, and showing it
     to somebody who narrowed to "failed bank gifts" reads as data loss. */
  const nothing =
    narrowingCount(narrowing) === 0 && read.allCounts === 0 && read.allGifts === 0;
  /* The pager carries the current filter, so moving to the next page of a
     narrowed list does not silently return the unfiltered list. */
  const page = (name: "counts" | "gifts" | "repeats", to: number) => {
    const at = new URLSearchParams({ church: session.tenantSlug });
    if (asked.period) at.set("period", asked.period);
    if (asked.fund) at.set("fund", asked.fund);
    if (asked.how) at.set("how", asked.how);
    if (asked.state) at.set("state", asked.state);
    at.set("counts", String(name === "counts" ? to : countsPage));
    at.set("gifts", String(name === "gifts" ? to : giftsPage));
    at.set("repeats", String(name === "repeats" ? to : repeatsPage));
    return `/giving?${at.toString()}`;
  };

  /*
   * R24.x. Recording a gift and exporting read as the two things done to
   * this list, so they are written as links rather than as a button with a
   * link beside it, which read as one action and one afterthought.
   */
  const asLink =
    "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--d-radius-control)]"
    + " px-2 text-[13px] font-medium text-primary underline underline-offset-4"
    + " hover:bg-sunken [&_svg]:size-4";

  const record = manage ? (
    <GiftPanel
      today={read.today}
      funds={fundList}
      trigger={
        <button type="button" className={asLink}>
          <Plus aria-hidden /> {t("giving.gift.add")}
        </button>
      }
    />
  ) : null;
  const startCount = manage ? (
    <StartCount
      today={read.today}
      funds={fundList}
      trigger={
        <button type="button" className={asLink}>
          <Plus aria-hidden /> {t("giving.count.start")}
        </button>
      }
    />
  ) : null;

  return (
    <Screen wide>
      <div className="flex flex-col gap-6">
        {/* R13.21. What is narrowing the lists, above the whole screen. The
            figures are the month and the year by definition and are not
            narrowed by it. */}
        <div className="flex flex-wrap items-center justify-end">
          <GivingFilters
            now={narrowing}
            funds={fundList}
          />
        </div>

        {/* R13.21. The two totals a treasurer is asked for, what the church
            can plan on, and whether the online door is open.

            A church that has recorded no giving met four noughts, which say
            four times over that it has not started. The invitation below says
            it once and says what to do about it. */}
        {nothing ? null : (
        <Figures>
          <Figure
            icon={<Banknote />}
            label={t("giving.month")}
            value={money(read.thisMonth.cents)}
            sub={plural("giving.givers.sub", read.thisMonth.gifts)}
            hue="fern"
            /* R13.2. Authorised and not yet moved by the bank, so it is in
               none of these figures and says so where they are read. */
            note={
              read.coming.cents > 0
                ? t("giving.onTheWay", { amount: money(read.coming.cents) })
                : undefined
            }
          />
          <Figure
            icon={<TrendingUp />}
            label={t("giving.year")}
            value={money(read.thisYear.cents)}
            sub={plural("giving.givers.sub", read.thisYear.gifts)}
            hue="violet"
          />
          <Figure
            icon={<Users />}
            label={t("giving.givers")}
            value={String(read.thisYear.givers)}
            sub={t("giving.givers.average", {
              amount: money(
                read.thisYear.givers > 0
                  ? Math.round(read.thisYear.cents / read.thisYear.givers)
                  : 0,
              ),
            })}
            hue="sky"
          />
          {/* R13.3. The figure is every repeating gift brought to a month,
              so a weekly $20,000 reads as $86,666.66. The label says so: it
              said "Repeating gifts", which reads as their total. */}
          <Figure
            icon={<Repeat />}
            label={t("giving.expectedMonthly")}
            value={money(read.expected)}
            sub={plural("giving.repeating.from", read.allRecurring)}
            hue="amber"
          />
        </Figures>
        )}

        {/* R13.17, R13.16. The rest of a treasurer's year. These were three
            small links wedged into the side of a heading about something
            else, each now carrying a figure that earns it the room. */}
        <div className="grid gap-3 sm:gap-4 sm:[grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          <Destination
            icon={<Landmark />}
            title={t("payouts.title")}
            detail={
              read.stripe?.chargesEnabled ? t("stripe.state.ready") : t("stripe.state.none")
            }
            href={"/giving/payouts"}
          />
          <Destination
            icon={<Target />}
            title={t("campaigns.title")}
            detail={plural("giving.campaigns.count", read.campaigns.length)}
            href={"/giving/campaigns"}
          />
          <Destination
            icon={<FileText />}
            title={t("giving.statements")}
            href={"/giving/statements"}
          />
        </div>

        {/* R13.21. The lists on the left, what the church is holding on the
            right. A table given the whole of a wide screen leaves a hand's
            width of nothing between a name and a fund, and the two standing
            facts were sitting under a fold nobody scrolled to. */}
        <div className="grid items-start gap-6 xl:[grid-template-columns:minmax(0,1fr)_minmax(300px,360px)]">
          <div className="flex min-w-0 flex-col gap-6">

        {nothing ? (
          <Empty
            icon="calendar"
            title={t("giving.empty.title")}
            action={
              manage ? (
                /* Both ways in, because a church with nothing recorded is
                   either about to count a plate or about to type in a
                   cheque, and the screen cannot know which. */
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <StartCount today={read.today} funds={fundList} />
                  {/* Both filled here. This is the screen's whole content,
                      so neither of them is the quieter one. */}
                  <GiftPanel
                    today={read.today}
                    funds={fundList}
                    trigger={
                      <Button>
                        <Plus /> {t("giving.gift.add")}
                      </Button>
                    }
                  />
                </div>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* R13.10. A session is what was counted at one service: the day,
                what the church called it, the fund it went to and how much
                there was, with the slip for the bank on the end. */}
            <Panel
              id="counts"
              icon={<CalendarCheck />}
              title={t("giving.counts")}
              action={startCount}
            >
              {read.counts.length === 0 ? (
                <Nothing>{t("giving.counts.none")}</Nothing>
              ) : (
                <>
                  {/* R24.6. Six columns do not read on a phone, so the
                      same sessions stack instead. */}
                  <div className="sm:hidden">
                    <CountCards
                      counts={read.counts}
                      today={read.today}
                      funds={fundList}
                      firstFundId={read.funds[0]?.id ?? ""}
                      manage={manage}
                    />
                  </div>

                  {/* R24.6. A table of five short columns is read rather than
                      arranged, so it takes the width it is given and divides
                      it rather than offering handles and a sideways scroll. */}
                  <div className="hidden sm:block">
                    <table className="w-full table-fixed border-collapse">
                      <Thead>
                        <tr>
                          <Th className="w-[18%] px-5">
                            {t("giving.col.date")}
                          </Th>
                          {/* The name takes whatever the others do not. */}
                          <Th className="w-[32%] px-3">
                            {t("giving.count.name")}
                          </Th>
                          <Th className="w-[17%] px-3">
                            {t("giving.col.fund")}
                          </Th>
                          <Th className="w-[10%] px-3">
                            {t("giving.col.method")}
                          </Th>
                          <Th className="w-[16%] px-3 text-right">
                            {t("giving.count.counted")}
                          </Th>
                          <Th className="w-[7%] px-3" />
                        </tr>
                      </Thead>

                      <tbody>
                        {read.counts.map((count) => (
                          <tr
                            key={count.id}
                            className="relative border-t border-line hover:bg-sunken"
                          >
                            <td className="truncate px-5 py-3 text-[13px] text-fg-subtle">
                              {longDate(count.receivedOn)}
                            </td>

                            {/* R24.x. The whole row opens the session, so a
                                count entered wrong is put right where it is
                                read. The slip sits above the link. */}
                            <td className="min-w-0 px-3 py-3 font-medium text-fg">
                              {manage ? (
                                <StartCount
                                  today={read.today}
                                  funds={fundList}
                                  count={{
                                    id: count.id,
                                    name: count.name,
                                    receivedOn: count.receivedOn,
                                    fundId: count.fundId ?? read.funds[0]?.id ?? "",
                                    method: count.method,
                                    amount: groupAmount((count.enteredCents / 100).toFixed(2)),
                                  }}
                                  trigger={
                                    <button
                                      type="button"
                                      className="cursor-pointer text-left after:absolute after:inset-0 after:content-['']"
                                    >
                                      {count.name}
                                    </button>
                                  }
                                />
                              ) : (
                                count.name
                              )}
                            </td>

                            <td className="px-3 py-3 text-[13px] text-fg-muted">{count.funds}</td>
                            <td className="px-3 py-3 text-[13px] text-fg-muted">
                              {count.methods
                                .split(",")
                                .filter(Boolean)
                                .map((one) => t(`giving.method.${one}` as never))
                                .join(", ")}
                            </td>
                            <td
                              data-numeric
                              className="whitespace-nowrap px-3 py-3 text-right font-semibold text-fg"
                            >
                              {money(count.enteredCents)}
                            </td>
                            <td className="relative z-10 px-3 py-3">
                              <span className="flex justify-end">
                                <Tooltip content={t("giving.count.slip")}>
                                  <a
                                    href={`/giving/counts/${count.slug}/slip`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    aria-label={t("giving.count.slip")}
                                    className="inline-flex size-9 items-center justify-center rounded-[var(--d-radius-control)] text-fg-muted hover:bg-surface hover:text-fg [&_svg]:size-4"
                                  >
                                    <Printer />
                                  </a>
                                </Tooltip>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pager
                    page={countsPage}
                    size={COUNTS_PER_PAGE}
                    total={read.allCounts}
                    href={(to) => page("counts", to)}
                    anchor="counts"
                  />
                </>
              )}
            </Panel>

            {/* R13.21. The last gifts recorded, so a mistake is caught the
                day it is made. */}
            <Panel
              id="gifts"
              icon={<Banknote />}
              title={t("giving.recent")}
              action={
                <>
                  {record}
                  {/* R13.23, R24.6. Everything recorded, as a spreadsheet.
                      A download is a mark everywhere else in the product, so
                      it is one here too, with its words on the tooltip. */}
                  {/* The press is a component of its own rather than a button
                      element, so the tooltip is given something it can hold
                      on to. */}
                  <Tooltip content={t("giving.export")}>
                    <span className="inline-flex">
                    <Download
                      href={"/api/giving"}
                      file={`giving-${session.tenantSlug}.csv`}
                      label={t("download.building")}
                      name={t("giving.export")}
                      className="relative grid size-[var(--d-tap)] place-items-center rounded-md text-fg-muted hover:bg-sunken hover:text-fg [&_svg]:size-[18px]"
                    >
                      <DownloadIcon />
                    </Download>
                    </span>
                  </Tooltip>
                </>
              }
            >
              {read.recent.length === 0 ? (
                <Nothing>{t("giving.recent.none")}</Nothing>
              ) : (
                <>
                  {/* R24.6. Seven columns do not read on a phone, so the
                      same rows stack instead. */}
                  <div className="sm:hidden">
                    <GiftCards
                      rows={giftRows(read.recent)}
                      manage={manage}
                    />
                  </div>

                  <div className="hidden sm:block">
                    <table className="w-full table-fixed border-collapse">
                      <Thead>
                        <tr>
                          <Th className="w-[17%] px-5">
                            {t("giving.col.date")}
                          </Th>
                          {/* The giver takes whatever the others do not. */}
                          <Th className="w-[24%] px-3">
                            {t("giving.col.giver")}
                          </Th>
                          <Th className="w-[15%] px-3">
                            {t("giving.col.fund")}
                          </Th>
                          <Th className="w-[10%] px-3">
                            {t("giving.col.method")}
                          </Th>
                          <Th className="w-[14%] px-3 text-right">
                            {t("giving.col.amount")}
                          </Th>
                          <Th className="w-[13%] px-3">
                            {t("giving.col.status")}
                          </Th>
                          <Th className="w-[7%] px-3" />
                        </tr>
                      </Thead>

                      <tbody>
                        {giftRows(read.recent).map((row) => {
                          const gift = row.gift;
                          const back = row.kind === "refund";

                          return (
                            <tr
                              key={row.key}
                              className={
                                back
                                  /* R13.15. The rule between a gift and its
                                     refund is drawn inside the row rather
                                     than across it, so the pair reads as one
                                     payment with two lines. */
                                  ? "italic text-fg-muted [&>td]:relative"
                                    + " [&>td]:before:absolute [&>td]:before:inset-x-0"
                                    + " [&>td]:before:top-0 [&>td]:before:h-px"
                                    + " [&>td]:before:bg-line [&>td]:before:content-['']"
                                    + " [&>td:first-child]:before:left-10"
                                    + " [&>td:last-child]:before:right-5"
                                  : "border-t border-line hover:bg-sunken"
                              }
                            >
                              {/* R13.15. The turn marks the refund as
                                  belonging to the gift above it. */}
                              <td className="truncate py-3 pr-3 pl-5 text-[13px] text-fg-subtle">
                                <span className="flex items-center gap-1">
                                  {back ? (
                                    <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
                                  ) : null}
                                  {longDate(row.on)}
                                </span>
                              </td>

                              <td className="min-w-0 px-3 py-3">
                                <span className="flex min-w-0 flex-col leading-5">
                                  <span className="truncate text-fg">
                                    {gift.memberName ?? t("giving.gift.anonymous")}
                                  </span>
                                  {/* R13.18. A gift on nobody's record is on
                                      nobody's statement either. */}
                                  {gift.memberId === null && !back ? (
                                    <span className="text-[12px] text-fg-subtle">
                                      {t("giving.gift.unattached")}
                                    </span>
                                  ) : null}
                                </span>
                              </td>

                              <td className="px-3 py-3 text-[13px] text-fg-muted">
                                {gift.fundName}
                              </td>

                              <td className="px-3 py-3 text-[13px] text-fg-muted">
                                {t(`giving.method.${gift.method}` as never)}
                              </td>

                              <td
                                data-numeric
                                className={`whitespace-nowrap px-3 py-3 text-right ${
                                  gift.status === "settled" && !back
                                    ? "font-semibold text-fg"
                                    : "text-fg-subtle"
                                }`}
                              >
                                <span className="flex items-center justify-end gap-1.5">
                                  {/* R13.3. Collected by a repeating gift,
                                      which is money the church can plan on. */}
                                  {gift.recurring && !back ? <RepeatMark /> : null}
                                  {gift.inKindDescription && !back
                                    ? ""
                                    : money(row.amountCents)}
                                </span>
                              </td>

                              {/* R13.2, R13.15. Where the money has got to. */}
                              <td className="px-3 py-3 text-[13px]">
                                <GiftState status={row.status} reason={gift.failureReason} />
                              </td>

                              {/* R13.15, R13.18. The two things done to a
                                  gift, in the same place on every row. */}
                              <td className="px-3 py-3">
                                <span className="flex items-center justify-end gap-1">
                                  {manage && gift.memberId === null && !back ? (
                                    <AttachGift
                                      gift={{ id: gift.id, typed: gift.memberName }}
                                    />
                                  ) : null}
                                  {manage && !back && !gift.inKindDescription
                                    && gift.status === "settled"
                                    && gift.amountCents > gift.refundedCents ? (
                                    <RefundGift
                                      gift={{
                                        id: gift.id,
                                        amountCents: gift.amountCents,
                                        refundedCents: gift.refundedCents,
                                        method: gift.method,
                                        giver: gift.memberName,
                                      }}
                                    />
                                  ) : null}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <Pager
                    page={giftsPage}
                    size={GIFTS_PER_PAGE}
                    total={read.allGifts}
                    href={(to) => page("gifts", to)}
                    anchor="gifts"
                  />
                </>
              )}
            </Panel>
          </>
        )}

          </div>

          <div className="flex min-w-0 flex-col gap-6">
          {/* R13.9. The board's question is what the church can spend, so
              the funds are read in two groups with a total on each. Money
              given for a building is in the bank and is not available. */}
          <Panel
            icon={<Wallet />}
            title={t("giving.funds")}
            action={
              <Link
                href={"/settings/funds"}
                className="inline-flex min-h-9 items-center rounded-[var(--d-radius-control)] px-3 text-[13px] font-medium text-primary underline underline-offset-4 hover:bg-sunken"
              >
                {t("giving.funds.manage")}
              </Link>
            }
          >
            {read.everyFund.length === 0 ? (
              <Nothing>{t("giving.funds.none")}</Nothing>
            ) : (
              <div className="flex flex-col gap-5 px-5 py-4">
                {([false, true] as const).map((restricted) => {
                  /* An archived fund stays on the board while it still holds
                     money, after the live ones, so a treasurer reading the
                     total can see where the rest of it sits. One emptied and
                     then archived has nothing left to say and comes off. */
                  const all = read.everyFund
                    .filter((one) => one.restricted === restricted)
                    .filter((one) => !one.archived || (read.byFund[one.id]?.cents ?? 0) !== 0)
                    .sort((a, b) => Number(a.archived) - Number(b.archived));
                  if (all.length === 0) return null;
                  /* The total is of every one of them. The list under it is
                     the first few, because a column of twenty funds beside a
                     table is not something anybody glances at. */
                  const group = all.slice(0, ASIDE_ROWS);
                  const rest = all.length - group.length;
                  const held = all.reduce(
                    (sum, one) => sum + (read.byFund[one.id]?.cents ?? 0),
                    0,
                  );

                  return (
                    <div key={String(restricted)} className="flex flex-col">
                      <div className="flex items-baseline justify-between gap-3">
                        <Tooltip
                          content={
                            restricted
                              ? t("giving.funds.restrictedWhy")
                              : t("giving.funds.availableWhy")
                          }
                        >
                          <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-fg">
                            {restricted
                              ? t("giving.funds.restricted")
                              : t("giving.funds.available")}
                          </span>
                        </Tooltip>
                        <span data-numeric className="text-[15px] font-semibold text-fg">
                          {money(held)}
                        </span>
                      </div>

                      {/* The funds hang off their group's total on the rail
                          the rest of the product uses for a thing inside a
                          thing, so the two groups read apart at a glance. */}
                      <ul className="m-0 mt-1 flex list-none flex-col p-0">
                        {group.map((fund, at) => (
                          <li key={fund.id} className="flex min-w-0 gap-3">
                            <span
                              aria-hidden
                              className="flex w-2.5 shrink-0 flex-col items-center"
                            >
                              <span className="h-[18px] w-px bg-line-strong" />
                              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                              {/* The rail stops at the last one, so it reads
                                  as a group closing rather than a line
                                  running off the bottom of the card. */}
                              {at === group.length - 1 ? null : (
                                <span className="w-px flex-1 bg-line-strong" />
                              )}
                            </span>

                            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 py-2">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span
                                  className={`min-w-0 truncate text-[length:var(--d-text-body)] ${
                                    fund.archived ? "text-fg-muted" : "text-fg"
                                  }`}
                                >
                                  {fund.name}
                                </span>
                                {fund.archived ? (
                                  <Tooltip content={t("giving.funds.archivedMark")}>
                                    <span
                                      aria-label={t("giving.funds.archivedMark")}
                                      className="inline-flex shrink-0 text-fg-subtle [&_svg]:size-3.5"
                                    >
                                      <Archive aria-hidden />
                                    </span>
                                  </Tooltip>
                                ) : null}
                              </span>
                              <span data-numeric className="shrink-0 text-fg">
                                {money(read.byFund[fund.id]?.cents ?? 0)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>

                      {rest > 0 ? (
                        <Link
                          href={"/settings/funds"}
                          className="mt-1 pl-[22px] text-[13px] font-medium text-primary no-underline"
                        >
                          {plural("giving.more", rest)}
                        </Link>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* R13.3. What repeats, which is the number a church plans on. */}
          <Panel
            id="repeats"
            icon={<Repeat />}
            title={t("giving.recurring")}
            count={
              read.allRecurring > 0
                ? t("giving.recurring.monthly", { amount: money(read.expected) })
                : undefined
            }
          >
            {read.recurring.length === 0 ? (
              <Nothing>{t("giving.recurring.none")}</Nothing>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {read.recurring.map((one) => (
                  <li
                    key={one.id}
                    className="flex items-center gap-3 border-t border-sunken px-5 py-3 first:border-0"
                  >
                    <span className="flex min-w-0 flex-1 flex-col leading-5">
                      <span className="truncate font-medium text-fg">
                        {one.name || t("giving.gift.anonymous")}
                      </span>
                      <span className="truncate text-[12px] text-fg-subtle">
                        {[
                          one.fundName,
                          t(
                            `giving.recurring.every.${one.interval}${
                              one.intervalCount > 1 ? `.${one.intervalCount}` : ""
                            }` as never,
                          ),
                        ]
                          .filter(Boolean)
                          .join(" \u00b7 ")}
                      </span>
                      {/* R13.8. When it collects next, on its own line. On
                          the end of the one above it was the first thing a
                          narrow column cut, and it is the one date a
                          treasurer is looking for. */}
                      {one.nextOn ? (
                        <span className="text-[12px] text-fg-subtle">
                          {t("giving.recurring.next", { date: briefDate(one.nextOn) })}
                        </span>
                      ) : null}
                      {/* R13.8. A gift that has stopped collecting says so
                          here, rather than being noticed in March. */}
                      {one.status === "past_due" ? (
                        <span
                          className="text-[12px] font-medium"
                          style={{ color: "var(--warning-text)" }}
                        >
                          {t("giving.recurring.status.past_due")}
                        </span>
                      ) : null}
                    </span>

                    <span data-numeric className="shrink-0 font-semibold text-fg">
                      {money(one.amountCents)}
                    </span>

                    {/* R13.3. A treasurer is asked to stop one on a giver's
                        behalf, so it is stopped from here as well. */}
                    {manage ? (
                      <StopRepeating
                        id={one.id}
                        label={money(one.amountCents)}
                        who={one.name || null}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <Pager
              page={repeatsPage}
              size={ASIDE_ROWS}
              total={read.allRecurring}
              href={(to) => page("repeats", to)}
              anchor="repeats"
            />
          </Panel>
          </div>
        </div>
      </div>
    </Screen>
  );
}
