import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  withTenant, getPerson, householdFor,
  personTimeline, servingForPerson, groupsForPerson,
  listContacts, listAddresses, givingForPerson,
  listCustomFields, getCustomValues, listTags, listTagsForPerson, listCampuses,
  canEditPeople, canArchivePeople, canReadGivingAmounts, canWriteNotes, anniversaryOf,
  checksFor, canSeeChecks, listMilestones,
} from "@connectapp/db";
import { Avatar, Button, Tooltip } from "@connectapp/ui";
import { t, plural } from "@connectapp/i18n";
import { requireSession } from "@/lib/session";
import { shellData } from "@/lib/shell-data";
import { photoUrls } from "@/lib/photos";
import { lifecycleLabel, maritalOptions } from "@/lib/person-input";
import { longDate, shortDate } from "@/lib/dates";
import { money } from "@/lib/money";
import { churchNow } from "@/lib/church-now";
import { Timeline } from "./timeline";
import { ArchiveButton } from "../archive-button";
import { Contacts } from "./contacts";
import { Places } from "./places";
import { WriteTo } from "@/components/inbox/write-to";
import { NoteForm } from "../note-form";
import { customFieldValue } from "../field-values";
import { canReadConfidentialNotes, canAnswerMessages } from "@connectapp/db";
import { tabMetadata } from "@/lib/page-metadata";
import { memberDirectoryReturnTo } from "@/lib/member-return";
import { RecordPanel, type RecordPanelSection } from "@/components/record-panel";
import { Milestones } from "../milestones";
import { TagEditor } from "../tag-editor";
import { Checks } from "../checks";

/** R17.1. What the browser tab says until the record names itself. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ }>;
}) {
  const {} = await searchParams;
  return tabMetadata(t("members.title"));
}

/**
 * One label and its value.
 *
 * No rule under it. Every value carried one, so a section of six fields drew
 * six lines across the window, and on a record where half of them are empty
 * the lines were the loudest thing on the screen: a reader met a ledger of
 * what the church does not know about somebody.
 */
function RecordValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption text-fg-subtle">{label}</span>
      <span className="text-[length:var(--d-text-body)] text-fg">{children}</span>
    </div>
  );
}

/**
 * What a field with nothing in it reads as.
 *
 * A drawn rule rather than a dash character, because the project writes no
 * dashes and a glyph in the source is still a glyph in the source.
 */
const EMPTY = (
  <span aria-hidden className="inline-block h-px w-3 bg-line-strong align-middle" />
);

/**
 * One unboxed section in the member record.
 *
 * The heading names the section; a light rule separates its contents from the
 * next section.
 */
function RecordSection({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-record-section={id ? "" : undefined}
      /* No rule under it. The window shows one section at a time, so a line
         below the last thing on screen separates nothing. */
      className="scroll-mt-4 flex flex-col gap-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-title font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {/* The contents in their own box, so a part can tell whether it is the
          first thing under the heading. Measured against the section itself,
          the heading was always first and every part drew a rule. */}
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/**
 * R24.6. Names a part of a section that holds more than one thing.
 *
 * A rule above each one, so a section of three parts reads as three things
 * rather than one column of headings at the same weight. The first part of a
 * section goes without, because a line directly under the section's own
 * heading separates it from nothing.
 */
function RecordPart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h4 className="text-label font-medium text-fg-muted">{title}</h4>
      {children}
    </div>
  );
}

/** R2.2. The same pill the directory uses, so a status reads the same anywhere. */
const STATUS_HUE: Record<string, string> = {
  member: "fern",
  regular_attender: "sky",
  visitor: "amber",
  inactive: "clay",
  deceased: "clay",
};

function PersonStatus({ status }: { status: string }) {
  const hue = STATUS_HUE[status] ?? "clay";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium"
      style={{ background: `var(--hue-${hue}-tint)`, color: `var(--hue-${hue}-key)` }}
    >
      {lifecycleLabel(status)}
    </span>
  );
}

/**
 * R2.x. One person.
 *
 * Built to docs/redesign/design: the back link, who they are, and the record
 * sections.
 * What we hold about them, who they live with, what they are part of, and
 * everything that has happened, in that order.
 */
type PersonPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export async function PersonPanelPage({
  params,
  searchParams,
}: {
  params: PersonPageProps["params"];
  searchParams: PersonPageProps["searchParams"];
}) {
  const { id } = await params;
  const { returnTo: rawReturnTo } = await searchParams;
  const returnTo = memberDirectoryReturnTo(rawReturnTo);
  const session = await requireSession();

  /*
   * R24.11. The frame around this panel has already read the church, and the
   * clock this record is filed on comes out of it. Reading it again inside the
   * transaction was a round trip for a timezone that every read below waited
   * behind, on a panel whose whole job is to open quickly from the list.
   */
  const zone = (await shellData(session)).church?.timezone ?? "America/Chicago";
  const year = churchNow(zone).date.slice(0, 4);

  const ctx = { tenantId: session.tenantId, role: session.role };
  const where = <T,>(work: (tx: Parameters<Parameters<typeof withTenant<T>>[1]>[0]) => Promise<T>) =>
    withTenant(ctx, work);

  /*
   * R1.5. Giving amounts are a field-level permission, so the read itself is
   * skipped rather than the number being hidden on the way out.
   */
  const amounts = canReadGivingAmounts(session);

  /*
   * R24.11, R24.12. The record's reads run as several transactions at once.
   *
   * This was one transaction wrapping a `Promise.all` of eighteen reads, on
   * the assumption that issuing them together meant answering them together.
   * It does not. Drizzle sends every statement through postgres.js's `unsafe`,
   * which refuses to pipeline anything but a statement the connection has
   * already parsed, and each of these is different from the last. Measured: a
   * query repeated eight times costs 30ms for all eight, and eight different
   * queries cost 406ms, which is one round trip each. The `Promise.all` was
   * drawing a straight line and calling it a fan.
   *
   * So the fan is made out of connections instead. Each group is its own
   * tenant transaction, which costs one connection and about 180ms of BEGIN,
   * `set_config` and COMMIT, and the groups are balanced so no one of them is
   * much longer than the others. The person's own record is resolved first
   * because the address may carry a readable name rather than an id, and
   * everything after it reads from the record's own id.
   *
   * Three extra connections per record against a pool of ten. That is the
   * trade: a panel somebody is waiting on, against connections a church is
   * not otherwise using while they wait.
   */
  /*
   * HRT-448. The church's own lists ride with the record lookup.
   *
   * The fields, the tags and the campuses need the church and not the person,
   * so they were travelling in the parallel phase below and paying their own
   * BEGIN, `set_config` and COMMIT for about 120ms of reading. Here they cost
   * nothing extra: this transaction is open and waiting on a round trip
   * either way.
   */
  const [person, customFields, allTags, campuses] = await where(async (tx) => [
    await getPerson(tx, id, { role: session.role, userId: session.userId }),
    /* R1.10. Whatever this church decided a person needs. It was on the form
       and in the directory and nowhere on the record itself. */
    await listCustomFields(tx, "person"),
    /* R1.13. Every tag this church keeps, so one can be put on or taken off
       from the record itself. */
    await listTags(tx),
    await listCampuses(tx),
  ] as const);

  // Not found and not permitted are the same response on purpose. A person in
  // another church must not be distinguishable from a person who does not exist.
  if (!person) notFound();

  // Found by their readable address or by their id, so everything after this
  // works from the record's own id rather than from whatever was in the URL.
  const memberId = person.id;

  /*
   * HRT-448. Four groups, balanced so none is much longer than the others.
   *
   * The timeline used to be the long pole on its own at seven round trips.
   * Now that it is three, the groups are evened out again: the slowest group
   * is what the panel waits for, so a group carrying twice the work of its
   * neighbours is the whole cost.
   */
  const [
    [contacts, household],
    [history, addresses],
    [groups, serving, giving, customValues],
    [memberTags, anniversary, milestoneRows, checkStanding],
  ] = await Promise.all([
    where(async (tx) => [
      // R2.4. Every way of reaching them, not only the one that leads.
      await listContacts(tx, memberId),
      await householdFor(tx, memberId),
    ] as const),

    where(async (tx) => [
      // R2.15. Everything that has happened with this person, in one order.
      await personTimeline(
        tx,
        { tenantId: session.tenantId, role: session.role, userId: session.userId, permissions: session.permissions },
        memberId,
        /* R2.15. Days read on the church's own clock, so an evening's work is
           filed under the evening it happened. */
        { timezone: zone },
      ),
      await listAddresses(tx, memberId),
    ] as const),

    where(async (tx) => [
      await groupsForPerson(tx, memberId),
      await servingForPerson(tx, memberId),
      amounts
        ? await givingForPerson(tx, memberId, { from: `${year}-01-01`, to: `${year}-12-31` })
        : null,
      await getCustomValues(tx, "person", memberId),
    ] as const),

    where(async (tx) => [
      await listTagsForPerson(tx, memberId),
      await anniversaryOf(tx, memberId),
      /* R2.6, R2.10. The dates a church is asked for and cannot produce, and
         the check that decides whether somebody may serve with children. */
      await listMilestones(tx, memberId),
      canSeeChecks(session) ? await checksFor(tx, session, memberId) : null,
    ] as const),
  ]);

  /* R1.10. Every custom field configured by the church has a place on the record. */
  const extra = customFields
    .map((field) => ({
      id: field.id,
      label: field.label,
      value: customFieldValue(field, customValues[field.id], longDate),
    }));

  const display = `${person.preferredName ?? person.firstName} ${person.lastName}`;
  // R2.9. Their face, signed for the hour.
  const faces = await photoUrls([person.photoKey]);
  const canEdit = canEditPeople(session);
  const canArchive = canArchivePeople(session);
  const canMessage = canAnswerMessages(session);
  const editHref =
    `/members/${person.slug}/edit?returnTo=${encodeURIComponent(returnTo ?? "/members")}`;

  const actions = canMessage ? (
    <div className="flex items-center gap-2">
      <WriteTo at={person.slug} name={display} />
    </div>
  ) : undefined;

  /*
   * R24.6. Edit sits on the heading of each section it acts on.
   *
   * Two of the seven sections hold fields the edit form writes: personal
   * details, and address and contact. A single Edit on the window's footer was
   * a press whose effect depended on which section happened to be open. The
   * other sections carry their own controls already: a milestone, a check, a
   * note.
   *
   * There is no Close here. The square in the corner is the way out of every
   * window in the product, and a second one at the other end would be two
   * answers to one question.
   */
  const editMark = (part?: string) => canEdit ? (
    <Tooltip content={t("action.edit")}>
      <Button
        variant="ghost"
        asChild
        className="size-[var(--d-tap)] min-h-0 rounded-[var(--d-radius-control)] px-0 [&_svg]:size-[var(--d-icon)]"
      >
        <Link
          href={part ? `${editHref}#${part}` : editHref}
          aria-label={t("action.edit")}
        >
          <Pencil />
        </Link>
      </Button>
    </Tooltip>
  ) : undefined;

  const panelFooter = canArchive ? (
    <div className="flex w-full items-center">
      <ArchiveButton
        mark
        church={session.tenantSlug}
        id={person.id}
        name={display}
        archived={Boolean(person.archivedAt)}
      />
    </div>
  ) : undefined;

  /*
   * R24.6. Seven at most, and fewer for most churches.
   *
   * Eleven entries made the rail a list to read rather than a place to go, and
   * several of them held one line each. Things that answer the same question
   * now share a section and keep their own names inside it.
   */
  const panelSections: RecordPanelSection[] = [
    { id: "overview", label: t("personForm.section.details") },
    { id: "contact", label: t("personForm.section.contact") },
    { id: "household", label: t("person.household") },
    { id: "timeline", label: t("person.churchHistory") },
    { id: "belonging", label: t("person.belonging") },
    ...(giving ? [{ id: "giving", label: t("person.giving") }] : []),
    { id: "tags", label: t("person.tags") },
    ...(customFields.length > 0 ? [{ id: "additional", label: t("person.more") }] : []),
  ];

  const content = (
    <>
      {/* Their name, status and personal facts open the record. */}
      <section
        id="overview"
        data-record-section=""
        className="scroll-mt-4 flex flex-col gap-6"
      >
      <div className="flex flex-wrap items-center gap-5">
        {/* R24.6. The mark that edits these fields, on the row that names
            them, as it is on the address and contact section. */}
        <span className="order-last ml-auto self-start">{editMark("details")}</span>
        <Avatar
          name={display}
          src={person.photoKey ? (faces[person.photoKey] ?? null) : null}
          id={person.id}
          className="size-[108px] text-[34px] font-semibold"
        />
        <div className="min-w-[200px] flex-1">
          <div className="font-display text-[32px] leading-[38px] text-fg">{display}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PersonStatus status={person.lifecycleStatus} />
          </div>
        </div>

      </div>
      <div className="grid gap-x-8 sm:grid-cols-2">
        <RecordValue label={t("personForm.dateOfBirth")}>
          {person.dateOfBirth ? longDate(person.dateOfBirth) : EMPTY}
        </RecordValue>
        <RecordValue label={t("person.maritalStatus")}>
          {maritalOptions().find((option) => option.value === person.maritalStatus)?.label ?? EMPTY}
        </RecordValue>
        {/* R2.11. Shown where there is one, so the record reads the way the
            form that wrote it asked. */}
        {anniversary ? (
          <RecordValue label={t("person.anniversary")}>{longDate(anniversary)}</RecordValue>
        ) : null}
      </div>
      </section>

      {/* Everything about the member stays grouped by section. The panel's left
          navigation keeps one part in view at a time. */}
      <div className="flex flex-col gap-7">
          {/*
            * R2.4, R24.6. Written where it is read.
            *
            * An address and a way of reaching somebody are each a row of their
            * own that is added and taken away one at a time, so there is no
            * form to fill in: the pencil led to the same three lists on
            * another address. They are edited here, and the edit form keeps
            * them for the fields beside them.
            */}
          <RecordSection id="contact" title={t("personForm.section.contact")}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-caption text-fg-subtle">{t("contact.emails")}</span>
                <Contacts memberId={person.id} kind="email" contacts={contacts} canEdit={canEdit} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-caption text-fg-subtle">{t("contact.phones")}</span>
                <Contacts memberId={person.id} kind="phone" contacts={contacts} canEdit={canEdit} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-caption text-fg-subtle">{t("contact.addresses")}</span>
                <Places memberId={person.id} name={display} places={addresses} canEdit={canEdit} />
              </div>
            </div>
          </RecordSection>

          {/*
            * R2.4, R24.6. A household is kept on its own screen, where it is
            * named, addressed, merged and archived. The mark here went to this
            * person's edit form, which does not hold any of that.
            */}
          <RecordSection
            id="household"
            title={t("person.household")}
            action={household && canEdit ? (
              <Link
                href={`/settings/households?find=${encodeURIComponent(household.name)}`}
                className="text-label font-medium text-primary underline underline-offset-4"
              >
                {t("person.manageHousehold")}
              </Link>
            ) : undefined}
          >
            {household && household.members.length > 0 ? (
              /* R24.6. The rail the product uses wherever several things are
                 one thing: a dot a row, and a line running between them. */
              <ol className="m-0 flex list-none flex-col p-0">
                {household.members.map((m) => (
                  <li key={m.id} className="group flex items-stretch gap-3">
                    {/* The line runs the height of the row, behind the face,
                        and stops at the first and the last of them. */}
                    <span className="relative flex w-7 shrink-0 justify-center py-1.5">
                      <span
                        aria-hidden
                        className={
                          "absolute inset-y-0 w-px bg-line"
                          + " group-first:top-1/2 group-last:bottom-1/2"
                        }
                      />
                      <Avatar
                        name={m.displayName}
                        id={m.id}
                        className="relative size-7 shrink-0 text-[12px] font-semibold"
                      />
                    </span>

                    <span className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5">
                      <span className="min-w-0 flex-1 truncate font-medium text-fg">
                        {m.displayName}
                      </span>
                      <span className="text-[13px] text-fg-subtle">
                        {t(`householdRole.${m.role}` as never)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-fg-muted">{t("person.noHousehold")}</p>
            )}
          </RecordSection>

          {/*
            * R2.6, R2.7. Three things, each named: the dates a church is asked
            * for years later, what it has marked, and what has happened.
            *
            * These were previously four loose blocks of equal weight, two of
            * them usually empty, with a note box open underneath and a rule
            * below separating nothing. On a record with no dates and no
            * milestones, that put four empty sections above the only content
            * there was to read.
            */}
          <RecordSection id="timeline" title={t("person.churchHistory")} action={editMark("status")}>
            <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
              <RecordValue label={t("personForm.firstVisit")}>
                {person.firstVisitOn ? longDate(person.firstVisitOn) : EMPTY}
              </RecordValue>
              <RecordValue label={t("personForm.membershipDate")}>
                {person.membershipDate ? longDate(person.membershipDate) : EMPTY}
              </RecordValue>
              {campuses.length > 1 ? (
                <RecordValue label={t("person.campus")}>
                  {campuses.find((campus) => campus.id === person.campusId)?.name ?? EMPTY}
                </RecordValue>
              ) : null}
            </div>

            <RecordPart title={t("person.milestones")}>
              <Milestones memberId={person.id} rows={milestoneRows} canEdit={canEdit} />
            </RecordPart>

            {/* R2.7. The note is written into the history it joins, so the
                press that writes one belongs to the history rather than
                floating under it. */}
            <RecordPart title={t("timeline.title")}>
              <Timeline entries={history} />
              {canWriteNotes(session) ? (
                <NoteForm
                  inline
                  memberId={person.id}
                  name={display}
                  canConfidential={canReadConfidentialNotes(session)}
                />
              ) : null}
            </RecordPart>
          </RecordSection>

          <RecordSection id="belonging" title={t("person.belonging")}>
            <RecordPart title={t("groups.title")}>
              {groups.length === 0 ? (
                <p className="text-[13px] text-fg-muted">{t("person.notInGroup")}</p>
              ) : (
                groups.map((group) => (
                  <span key={group.groupId} className="flex items-center gap-2.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: `var(--hue-${group.typeHue ?? "fern"}-500)` }}
                    />
                    <span className="font-medium text-fg">{group.name}</span>
                  </span>
                ))
              )}
            </RecordPart>

            <RecordPart title={t("person.serving")}>
              {serving.length === 0 ? (
                <p className="text-[13px] text-fg-muted">{t("person.notOnTeam")}</p>
              ) : (
                serving.map((team) => (
                  <span key={team.teamId} className="flex items-center gap-2.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: `var(--hue-${team.hue}-500)` }}
                    />
                    <span className="font-medium text-fg">{team.teamName}</span>
                  </span>
                ))
              )}
            </RecordPart>

            {/* R2.10, R21.11. Read by the role the church trusts with it. */}
            {checkStanding ? (
              <RecordPart title={t("checks.title")}>
                <Checks
                  memberId={person.id}
                  standing={checkStanding.standing}
                  expiresOn={checkStanding.expiresOn}
                  rows={checkStanding.checks}
                  canEdit={canEdit}
                />
              </RecordPart>
            ) : null}
          </RecordSection>

          {giving ? (
            <RecordSection id="giving" title={t("person.giving")}>
              <div data-numeric className="font-display text-[32px] leading-[38px] text-fg">
                {giving.gifts === 0 ? EMPTY : money(giving.cents)}
              </div>
              <div className="text-[13px] text-fg-muted">
                {giving.gifts === 0
                  ? t("person.noGifts")
                  : plural("person.giving.year", giving.gifts, {
                      last: giving.lastOn ? shortDate(giving.lastOn) : "",
                    })}
              </div>
            </RecordSection>
          ) : null}

          {/* R1.13. A tag goes on and comes off with one press, so this
              section carries no pencil either. */}
          <RecordSection id="tags" title={t("person.tags")}>
            {/* Keyed by the record, because the window is a parallel slot and
                keeps its component alive: without this, opening a second
                person showed the first person's tags. */}
            <TagEditor
              key={person.id}
              memberId={person.id}
              all={allTags.map((tag) => ({ id: tag.id, name: tag.name, hue: tag.hue }))}
              assigned={memberTags.map((tag) => tag.id)}
              canEdit={canEdit}
            />
          </RecordSection>

          {customFields.length > 0 ? (
            <RecordSection id="additional" title={t("person.more")} action={editMark("custom")}>
              {extra.map((one) => (
                <div key={one.id} className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-caption text-fg-subtle">{one.label}</span>
                  <span className="text-[length:var(--d-text-body)] text-fg">
                    {one.value || EMPTY}
                  </span>
                </div>
              ))}
            </RecordSection>
          ) : null}
      </div>
    </>
  );

  return (
      <RecordPanel
        title={display}
        sections={panelSections}
        actions={actions}
        footer={panelFooter}
        closeTo={returnTo ?? "/members"}
      >
        <div className="flex flex-col gap-5">{content}</div>
      </RecordPanel>
  );
}
