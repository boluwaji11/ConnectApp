import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "../client";
import {
  conversations, conversationPeople, messages, messageDrafts, messageReactions,
  messageFiles,
} from "../schema/messages";
import { members } from "../schema/members";
import { tenantMembers, storedFiles } from "../schema/tenancy";
import { groupMemberships, groups } from "../schema/groups";
import { teamMembers, teams } from "../schema/serving";
import { InvalidInputError } from "../errors";
import { PermissionError } from "../roles";
import { can, rolesWith, type TenantRole } from "../permissions";
import { t } from "@connectapp/i18n";

/**
 * R16.9, R17.1. Messages written here and read here.
 *
 * Nothing is sent. No provider holds anything, no credential is stored and no
 * delivery is paid for, which is why this half of communication can exist in a
 * product given away.
 *
 * A conversation has people in it. The office is one of them, as a role rather
 * than a person, so whoever is on staff this month answers and the thread
 * belongs to the church. Everybody else is a member, and the read mark is per
 * person: what one reader has seen is theirs alone.
 */

/** Whoever is reading, from the session. */
export interface Reader {
  tenantId: string;
  userId: string;
  /** Their own person record, where their account is tied to one. */
  memberId: string | null;
  /** Whether they answer for the church. */
  office: boolean;
}

/**
 * Who a message is addressed to.
 *
 * "office", or a member's own readable address. A row id never appears in a
 * link in this product, and a conversation is found by who it is with rather
 * than by which row holds it.
 */
export type Target =
  | { office: true }
  | { office: false; slug: string }
  | { office: false; group: string }
  | { office: false; team: string };

/** R16.9. The marks a church may put against a message. */
export const REACTIONS = [
  "\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F389}", "\u{1F64F}", "\u{1F62E}",
  /* Kept so a mark already put against a line goes on reading. */
  "\u{1F622}",
] as const;

export interface Reaction {
  emoji: string;
  count: number;
  /** Whether this reader is one of them. */
  mine: boolean;
}

export interface Message {
  id: string;
  body: string;
  createdAt: Date;
  /** Written as the church. */
  fromOffice: boolean;
  authorMemberId: string | null;
  /** Who it reads as, already resolved. Empty for the office. */
  authorName: string;
  authorPhotoKey: string | null;
  /** Whether the reader wrote it. */
  mine: boolean;
  /** R16.9. Changed after it was sent, so the line can say so. */
  edited: boolean;
  /** R2.13. Taken back: the row stays, the words are gone. */
  deleted: boolean;
  /** R16.9. The line this one answers, where it answers one. */
  answering: {
    id: string;
    /** Who wrote it, already resolved. Empty for the church. */
    name: string;
    fromOffice: boolean;
    /** Its opening, short enough to sit above a line. */
    line: string;
  } | null;
  /** R16.9. What has been put against it, most used first. */
  reactions: Reaction[];
  /**
   * R16.9. Whether anybody else in the conversation has opened it.
   *
   * Only ever asked of the reader's own lines. Nothing is sent anywhere here,
   * so a line is in the other person's inbox the moment it is written down;
   * what a church actually wants to know is whether anybody has looked.
   */
  readByOthers: boolean;
  /** R16.14. What was sent with it. */
  files: SentFile[];
}

/** R16.14. One file on a message, named and ready to be asked for. */
export interface SentFile {
  id: string;
  /** Where it is stored, which the signed link is made from. */
  key: string;
  contentType: string;
  bytes: number;
  /** The name it arrived with. */
  label: string;
}

export interface Thread {
  id: string;
  kind: string;
  /** Its address: "office", or who it is with. */
  key: string;
  /** Who it is with, from this reader's side. Null means the church office. */
  withMemberId: string | null;
  withName: string;
  withPhotoKey: string | null;
  lastLine: string;
  lastAt: Date;
  /** Whether the last line is the reader's own. */
  lastMine: boolean;
  unread: number;
  archived: boolean;
}

export interface Recipient {
  /** "office", a group or team address, or a member's own. */
  value: string;
  name: string;
  photoKey: string | null;
  /** Why they are on the list: the group or team they lead. */
  through: string | null;
  /** Whether it reaches everybody in a group rather than one person. */
  whole?: boolean;
}

export interface Draft {
  target: string;
  name: string;
  photoKey: string | null;
  body: string;
  updatedAt: Date;
}

const clean = (body: string): string => body.trim();

/** The first line of a message, short enough for a row in a list. */
const opening = (body: string): string => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
};

/**
 * The reader's own row in a conversation, and what is unread against it.
 *
 * A staff member who is also in a thread as themselves has two rows in it, so
 * the office row is preferred: answering for the church is the errand they
 * opened the inbox for.
 */
const mineFor = (reader: Reader) => sql`coalesce(
  (${reader.office} and m.from_office)
  or (m.author_member_id = ${reader.memberId ?? null})
, false)`;

interface Row {
  id: string;
  kind: string;
  last_message_at: string | Date;
  archived_at: Date | null;
  i_am_office: boolean;
  last_body: string | null;
  last_had_file: boolean | null;
  last_mine: boolean | null;
  unread: number;
}

async function readThreads(
  db: Tx,
  reader: Reader,
  opts: { archivedOnly?: boolean; limit?: number } = {},
): Promise<Thread[]> {
  const MINE = mineFor(reader);
  const me = reader.memberId ?? null;

  const rows = (await db.execute(sql`
    select distinct on (c.id)
           c.id, c.kind, c.last_message_at, c.archived_at,
           coalesce(p.office, false) as i_am_office,
           (select case when m.deleted_at is null then m.body else '' end from messages m
             where m.conversation_id = c.id order by m.created_at desc limit 1) as last_body,
           (select ${MINE} from messages m
             where m.conversation_id = c.id order by m.created_at desc limit 1) as last_mine,
           /* R16.14. Whether the last line was a file rather than words, so a
              row in the list says something either way. */
           (select exists (select 1 from message_files f where f.message_id = m.id)
              from messages m
             where m.conversation_id = c.id order by m.created_at desc limit 1) as last_had_file,
           (select count(*)::int from messages m
             where m.conversation_id = c.id
               and m.deleted_at is null
               and m.created_at > coalesce(p.last_read_at, timestamptz '-infinity')
               and not ${MINE}) as unread
      from conversations c
      left join conversation_people p on p.conversation_id = c.id
       and ((p.office and ${reader.office}) or (p.member_id = ${me}))
     where ${opts.archivedOnly ? sql`c.archived_at is not null` : sql`c.archived_at is null`}
       and exists (select 1 from messages m where m.conversation_id = c.id)
       and (
         p.id is not null
         /* R9.7. A group's thread belongs to whoever is in the group now,
            read here rather than copied into a roster that goes stale. */
         /* R9.7. A group's conversation belongs to the group, so it is not
            in the office's inbox unless the office is in that group or has
            written into it. Thirty groups talking among themselves is not a
            church's post. */
         or (c.group_id is not null and exists (
              select 1 from group_memberships gm
               where gm.group_id = c.group_id and gm.member_id = ${me}))
         or (c.team_id is not null and exists (
              select 1 from team_members tm
               where tm.team_id = c.team_id and tm.member_id = ${me}))
       )
     order by c.id, p.office desc nulls last
  `)) as unknown as Row[];

  if (rows.length === 0) return [];

  const ids = rows.map((one) => one.id);

  const people = await db
    .select({
      conversationId: conversationPeople.conversationId,
      memberId: conversationPeople.memberId,
      office: conversationPeople.office,
      first: members.firstName,
      last: members.lastName,
      slug: members.slug,
      photoKey: members.photoKey,
    })
    .from(conversationPeople)
    .leftJoin(members, eq(members.id, conversationPeople.memberId))
    .where(inArray(conversationPeople.conversationId, ids));

  /* What a group thread is called is the group's own name. */
  const named = await db
    .select({
      id: conversations.id,
      groupName: groups.name,
      groupSlug: groups.slug,
      teamName: teams.name,
      teamSlug: teams.slug,
    })
    .from(conversations)
    .leftJoin(groups, eq(groups.id, conversations.groupId))
    .leftJoin(teams, eq(teams.id, conversations.teamId))
    .where(inArray(conversations.id, ids));

  const out = rows.map((row) => {
    const here = people.filter((one) => one.conversationId === row.id);
    const whose = named.find((one) => one.id === row.id);

    const other = here.find((one) =>
      row.i_am_office ? !one.office : one.memberId !== reader.memberId);

    const key = whose?.groupSlug
      ? `group/${whose.groupSlug}`
      : whose?.teamSlug
        ? `team/${whose.teamSlug}`
        : other && !other.office
          ? other.slug ?? ""
          : "office";

    const name = whose?.groupName
      ?? whose?.teamName
      ?? (other && !other.office ? `${other.first} ${other.last}`.trim() : "");

    return {
      id: row.id,
      kind: row.kind,
      key,
      withMemberId: whose?.groupSlug || whose?.teamSlug ? null : other?.memberId ?? null,
      withName: name,
      withPhotoKey: whose?.groupSlug || whose?.teamSlug ? null : other?.photoKey ?? null,
      lastLine: opening(row.last_body ?? "") || (row.last_had_file ? t("inbox.aFile") : ""),
      lastAt: new Date(row.last_message_at),
      lastMine: Boolean(row.last_mine),
      unread: row.unread,
      archived: row.archived_at !== null,
    };
  });

  out.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** R16.9. Every thread this reader is in, newest written to first. */
export const inboxFor = (
  db: Tx,
  reader: Reader,
  opts: { archivedOnly?: boolean; limit?: number } = {},
): Promise<Thread[]> => readThreads(db, reader, opts);

/**
 * R16.9. How many lines are waiting on this reader.
 *
 * Lines rather than conversations: the mark in the corner says how much there
 * is to read, and a church that has been sent nine things should see nine.
 *
 * One statement, because every page in the product renders this number on its
 * way to the browser: the shell asks for it before anything else is drawn.
 */
export async function unreadFor(db: Tx, reader: Reader): Promise<number> {
  const MINE = mineFor(reader);
  const me = reader.memberId ?? null;

  const rows = (await db.execute(sql`
    select coalesce(sum(waiting.lines), 0)::int as waiting from (
      select distinct c.id,
             (select count(*)::int from messages m
               where m.conversation_id = c.id
                 and m.deleted_at is null
                 and m.created_at > coalesce(p.last_read_at, timestamptz '-infinity')
                 and not ${MINE}) as lines
        from conversations c
        left join conversation_people p on p.conversation_id = c.id
         and ((p.office and ${reader.office}) or (p.member_id = ${me}))
       where c.archived_at is null
         and (
           p.id is not null
           or (c.group_id is not null and exists (
                select 1 from group_memberships gm
                 where gm.group_id = c.group_id and gm.member_id = ${me}))
           or (c.team_id is not null and exists (
                select 1 from team_members tm
                 where tm.team_id = c.team_id and tm.member_id = ${me}))
         )
         and exists (
           select 1 from messages m
            where m.conversation_id = c.id
              and m.created_at > coalesce(p.last_read_at, timestamptz '-infinity')
              and not ${MINE}
         )
    ) waiting
  `)) as unknown as { waiting: number }[];
  return rows[0]?.waiting ?? 0;
}

/** R16.9. Everything said in one thread, oldest first. */
export async function messagesIn(
  db: Tx,
  reader: Reader,
  conversationId: string,
): Promise<Message[]> {
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      editedAt: messages.editedAt,
      deletedAt: messages.deletedAt,
      replyToId: messages.replyToId,
      fromOffice: messages.fromOffice,
      authorMemberId: messages.authorMemberId,
      first: members.firstName,
      last: members.lastName,
      photoKey: members.photoKey,
    })
    .from(messages)
    .leftJoin(members, eq(members.id, messages.authorMemberId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  /* R16.9. What each answer is answering, read in one go. */
  const answered = rows.map((one) => one.replyToId).filter((one): one is string => Boolean(one));
  const quoted = answered.length === 0
    ? []
    : await db
        .select({
          id: messages.id,
          body: messages.body,
          deletedAt: messages.deletedAt,
          fromOffice: messages.fromOffice,
          first: members.firstName,
          last: members.lastName,
        })
        .from(messages)
        .leftJoin(members, eq(members.id, messages.authorMemberId))
        .where(inArray(messages.id, answered));

  /*
   * R16.9. The last moment anybody else in this conversation looked.
   *
   * One number for the whole thread rather than a lookup a line: a line
   * written before somebody's last read is a line they have seen, and the
   * mark says "at least one of them", not which. The office reads as the
   * church, so its own seat is not somebody else.
   */
  const [seat] = (await db.execute(sql`
    select max(p.last_read_at) as seen
      from conversation_people p
     where p.conversation_id = ${conversationId}
       and not coalesce(
         (${reader.office} and p.office)
         or (p.member_id = ${reader.memberId ?? null})
       , false)
  `)) as unknown as { seen: string | Date | null }[];
  /* Raw rows hand back a timestamp as text, and text does not compare. */
  const seen = seat?.seen ? new Date(seat.seen) : null;

  const marks = rows.length === 0
    ? []
    : await db
        .select({
          messageId: messageReactions.messageId,
          emoji: messageReactions.emoji,
          memberId: messageReactions.memberId,
        })
        .from(messageReactions)
        .where(inArray(messageReactions.messageId, rows.map((one) => one.id)));

  /* R16.14. What was sent with each line, read in one go beside them. */
  const sent = rows.length === 0
    ? []
    : await db
        .select({
          messageId: messageFiles.messageId,
          id: storedFiles.id,
          key: storedFiles.key,
          contentType: storedFiles.contentType,
          bytes: storedFiles.bytes,
          label: messageFiles.label,
          position: messageFiles.position,
        })
        .from(messageFiles)
        .innerJoin(storedFiles, eq(storedFiles.id, messageFiles.fileId))
        .where(inArray(messageFiles.messageId, rows.map((one) => one.id)))
        .orderBy(asc(messageFiles.position));

  const withLine = (id: string): SentFile[] =>
    sent
      .filter((one) => one.messageId === id)
      .map((one) => ({
        id: one.id,
        key: one.key,
        contentType: one.contentType,
        bytes: one.bytes,
        label: one.label || one.key.split("/").pop() || one.contentType,
      }));

  const against = (id: string): Reaction[] => {
    const here = marks.filter((one) => one.messageId === id);
    const out: Reaction[] = [];
    for (const one of here) {
      const held = out.find((each) => each.emoji === one.emoji);
      if (held) {
        held.count += 1;
        held.mine = held.mine || one.memberId === reader.memberId;
      } else {
        out.push({ emoji: one.emoji, count: 1, mine: one.memberId === reader.memberId });
      }
    }
    return out.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  };

  return rows.map((one) => ({
    id: one.id,
    body: one.deletedAt ? "" : one.body,
    createdAt: one.createdAt,
    edited: one.editedAt !== null,
    deleted: one.deletedAt !== null,
    fromOffice: one.fromOffice,
    authorMemberId: one.authorMemberId,
    authorName: one.fromOffice ? "" : `${one.first ?? ""} ${one.last ?? ""}`.trim(),
    authorPhotoKey: one.fromOffice ? null : one.photoKey,
    mine: one.fromOffice
      ? reader.office
      : one.authorMemberId !== null && one.authorMemberId === reader.memberId,
    reactions: one.deletedAt ? [] : against(one.id),
    files: one.deletedAt ? [] : withLine(one.id),
    readByOthers: seen !== null && seen.getTime() >= one.createdAt.getTime(),
    answering: (() => {
      const held = one.replyToId
        ? quoted.find((each) => each.id === one.replyToId)
        : undefined;
      if (!held) return null;
      return {
        id: held.id,
        name: held.fromOffice ? "" : `${held.first ?? ""} ${held.last ?? ""}`.trim(),
        fromOffice: held.fromOffice,
        line: held.deletedAt ? "" : opening(held.body),
      };
    })(),
  }));
}

/** Whether this reader wrote a particular line. */
async function wroteIt(
  db: Tx,
  reader: Reader,
  messageId: string,
): Promise<{ conversationId: string } | null> {
  const [said] = await db
    .select({
      conversationId: messages.conversationId,
      fromOffice: messages.fromOffice,
      authorMemberId: messages.authorMemberId,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!said || said.deletedAt) return null;
  const ownIt = said.fromOffice
    ? reader.office
    : said.authorMemberId !== null && said.authorMemberId === reader.memberId;
  return ownIt ? { conversationId: said.conversationId } : null;
}

/**
 * R16.9. Changing a line already sent.
 *
 * Only the person who wrote it, and the line says it was changed: a message
 * somebody can quietly rewrite is a message nobody can rely on having read.
 */
export async function editMessage(
  db: Tx,
  reader: Reader,
  messageId: string,
  body: string,
): Promise<void> {
  const words = clean(body);
  if (!words) throw new InvalidInputError("inbox.error.empty");
  if (!(await wroteIt(db, reader, messageId))) {
    throw new PermissionError(reader.office ? "staff" : "member", "editPerson");
  }

  await db
    .update(messages)
    .set({ body: words, editedAt: new Date() })
    .where(eq(messages.id, messageId));
}

/**
 * R16.9, R2.13. Taking a line back.
 *
 * The row stays and the words go, so the conversation still reads in order
 * and the audit trail still holds what was said.
 */
export async function deleteMessage(
  db: Tx,
  reader: Reader,
  messageId: string,
): Promise<void> {
  if (!(await wroteIt(db, reader, messageId))) {
    throw new PermissionError(reader.office ? "staff" : "member", "editPerson");
  }

  await db
    .update(messages)
    .set({ body: "", deletedAt: new Date() })
    .where(eq(messages.id, messageId));

  await db.delete(messageReactions).where(eq(messageReactions.messageId, messageId));
  /* R2.13, R16.14. The words go and so does what was sent with them. The
     bytes stay in the ledger, where the quota and the audit can still see
     them. */
  await db.delete(messageFiles).where(eq(messageFiles.messageId, messageId));
}

/**
 * R16.9. A mark put against a message, or taken off it again.
 *
 * The same press both ways, because that is what everybody's hands already
 * expect, and the row is theirs alone so nobody can take off somebody else's.
 */
export async function react(
  db: Tx,
  reader: Reader,
  messageId: string,
  emoji: string,
): Promise<void> {
  if (!reader.memberId) throw new InvalidInputError("member.error.noRecord");
  if (!(REACTIONS as readonly string[]).includes(emoji)) {
    throw new InvalidInputError("inbox.error.mark");
  }

  const [said] = await db
    .select({
      conversationId: messages.conversationId,
      fromOffice: messages.fromOffice,
      authorMemberId: messages.authorMemberId,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!said) throw new InvalidInputError("inbox.error.thread");

  /* R16.9. A mark is an answer to somebody. Answering yourself is not one. */
  const ownIt = said.fromOffice
    ? reader.office
    : said.authorMemberId !== null && said.authorMemberId === reader.memberId;
  if (ownIt) throw new InvalidInputError("inbox.error.ownMark");
  if (!(await canRead(db, reader, said.conversationId))) {
    throw new PermissionError(reader.office ? "staff" : "member", "editPerson");
  }

  const [held] = await db
    .select({ id: messageReactions.id })
    .from(messageReactions)
    .where(and(
      eq(messageReactions.messageId, messageId),
      eq(messageReactions.memberId, reader.memberId),
      eq(messageReactions.emoji, emoji),
    ))
    .limit(1);

  if (held) {
    await db.delete(messageReactions).where(eq(messageReactions.id, held.id));
    return;
  }

  await db
    .insert(messageReactions)
    .values({
      tenantId: reader.tenantId,
      messageId,
      memberId: reader.memberId,
      emoji,
    })
    .onConflictDoNothing();
}

/**
 * R16.14, R21.1. Whether this reader may open a file sent in a message.
 *
 * SEC-019. The action behind this asked `holdsFile`, which answers only whether
 * the church holds the key, and its own comment says so. So any member of the
 * church who had a storage key was signed a one-hour URL to an attachment from
 * any conversation, including a pastoral one they were never part of. Every
 * other read in this file is scoped to the reader; this one was scoped to the
 * tenant.
 *
 * The key walks back to the conversation it was sent in, and then through the
 * same participation test the thread itself uses, so a file is exactly as
 * readable as the message that carried it.
 */
export async function canReadMessageFile(
  db: Tx,
  reader: Reader,
  key: string,
): Promise<boolean> {
  const [row] = await db
    .select({ conversationId: messages.conversationId })
    .from(messageFiles)
    .innerJoin(storedFiles, eq(storedFiles.id, messageFiles.fileId))
    .innerJoin(messages, eq(messages.id, messageFiles.messageId))
    .where(eq(storedFiles.key, key))
    .limit(1);

  if (!row) return false;
  return canRead(db, reader, row.conversationId);
}

/** Whether this reader is in a conversation at all. */
export async function canRead(
  db: Tx,
  reader: Reader,
  conversationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: conversationPeople.id })
    .from(conversationPeople)
    .where(and(
      eq(conversationPeople.conversationId, conversationId),
      reader.office && reader.memberId
        ? sql`(${conversationPeople.office} or ${conversationPeople.memberId} = ${reader.memberId})`
        : reader.office
          ? eq(conversationPeople.office, true)
          : eq(conversationPeople.memberId, reader.memberId ?? ""),
    ))
    .limit(1);
  return Boolean(row);
}

/**
 * R16.9. The thread between these two, started if there is not one yet.
 *
 * One a pair, for the life of the church, so somebody who wrote in August and
 * writes again in March writes into the same place.
 */
export async function openThread(
  db: Tx,
  tenantId: string,
  between: { office: boolean; memberIds: string[] },
): Promise<string> {
  const kind = between.office ? "church" : "direct";
  const people = [...new Set(between.memberIds)].sort();

  const held = (await db.execute(sql`
    select c.id from conversations c
     where c.tenant_id = ${tenantId}
       and c.kind = ${kind}
       and (select count(*) from conversation_people p where p.conversation_id = c.id)
           = ${people.length + (between.office ? 1 : 0)}
       ${between.office
          ? sql`and exists (select 1 from conversation_people p
                             where p.conversation_id = c.id and p.office)`
          : sql``}
       and not exists (
         select 1 from conversation_people p
          where p.conversation_id = c.id
            and p.member_id is not null
            and p.member_id not in (${sql.join(people.map((one) => sql`${one}`), sql`, `)})
       )
     limit 1
  `)) as unknown as { id: string }[];

  if (held[0]) return held[0].id;

  const [made] = await db
    .insert(conversations)
    .values({ tenantId, kind })
    .returning({ id: conversations.id });

  const rows = people.map((memberId) => ({
    tenantId, conversationId: made!.id, memberId, office: false,
  }));
  if (between.office) {
    rows.push({ tenantId, conversationId: made!.id, memberId: null as never, office: true });
  }
  await db.insert(conversationPeople).values(rows);

  return made!.id;
}

/**
 * R16.9. A message, to whoever it is addressed to.
 *
 * Writing is reading: the thread does not come back to the writer's own
 * unread list a second after they sent it.
 */
export async function sendMessage(
  db: Tx,
  reader: Reader,
  input: {
    to: Target;
    body: string;
    answering?: string | null;
    /** R16.14. Files already uploaded, in the order they were chosen. */
    files?: readonly { id: string; label?: string | null }[];
  },
): Promise<{ threadId: string; id: string }> {
  const body = clean(input.body);
  /* R16.14. A line with a photograph on it and nothing typed is a line. */
  if (!body && (input.files ?? []).length === 0) {
    throw new InvalidInputError("inbox.error.empty");
  }

  const toGroup = !input.to.office && "group" in input.to ? input.to.group : null;
  const toTeam = !input.to.office && "team" in input.to ? input.to.team : null;
  const toPerson = !input.to.office && "slug" in input.to ? input.to.slug : null;

  /*
   * R16.9, R3.2. Only the office writes to a person by name.
   *
   * A member writes to the church, or to a group or team they are part of.
   * Anything else would be the church's own privacy settings undone by a
   * message box.
   */
  if (toPerson && !reader.office) throw new PermissionError("member", "editPerson");

  /*
   * Writing as the church is what the office does.
   *
   * Inside a group it writes as itself where it is in the group: a leader who
   * happens to be on staff is in their own group as themselves, and a line
   * from "the church" in the middle of their own group would read as somebody
   * else entirely. Where it is not in the group, it writes as the church.
   */
  const inside = toGroup || toTeam
    ? await memberOf(db, reader, { group: toGroup ?? undefined, team: toTeam ?? undefined })
    : false;
  const asOffice = reader.office && (Boolean(toPerson) || ((Boolean(toGroup) || Boolean(toTeam)) && !inside));
  if (!asOffice && !reader.memberId) throw new InvalidInputError("member.error.noRecord");

  const them = toPerson ? await memberBySlug(db, toPerson) : null;
  if (toPerson && !them) throw new InvalidInputError("member.error.noRecord");

  const threadId = toGroup
    ? await openWhole(db, reader, { group: toGroup })
    : toTeam
      ? await openWhole(db, reader, { team: toTeam })
      : input.to.office
        ? await openThread(db, reader.tenantId, { office: true, memberIds: [reader.memberId!] })
        : asOffice
          ? await openThread(db, reader.tenantId, { office: true, memberIds: [them!] })
          : await openThread(db, reader.tenantId, {
              office: false,
              memberIds: [reader.memberId!, them!],
            });

  /* R16.9. A line may only answer one in the same conversation. */
  let answering: string | null = null;
  if (input.answering) {
    const [held] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(
        eq(messages.id, input.answering),
        eq(messages.conversationId, threadId),
      ))
      .limit(1);
    answering = held?.id ?? null;
  }

  const [made] = await db
    .insert(messages)
    .values({
      tenantId: reader.tenantId,
      conversationId: threadId,
      fromOffice: asOffice,
      authorMemberId: asOffice ? null : reader.memberId,
      authorUserId: reader.userId,
      body,
      replyToId: answering,
    })
    .returning({ id: messages.id });

  /* R16.14. What was sent with it, in the order it was chosen. The files are
     already in the ledger: the upload path checked the type, the size and the
     church's quota before any of them were written. */
  const sending = (input.files ?? []).slice(0, 10);
  if (sending.length > 0) {
    const held = await db
      .select({ id: storedFiles.id })
      .from(storedFiles)
      .where(inArray(storedFiles.id, sending.map((one) => one.id)));

    const real = sending.filter((one) => held.some((each) => each.id === one.id));
    if (real.length > 0) {
      await db.insert(messageFiles).values(
        real.map((one, at) => ({
          tenantId: reader.tenantId,
          messageId: made!.id,
          fileId: one.id,
          label: one.label?.trim() || null,
          position: at,
        })),
      );
    }
  }

  const now = new Date();
  await db
    .update(conversations)
    .set({ lastMessageAt: now, updatedAt: now, archivedAt: null })
    .where(eq(conversations.id, threadId));

  /* R9.7. Writing into something puts the writer in it, which is how a group
     thread the office answered turns up in the office's own inbox while the
     ones it has never touched stay out of it. */
  await db
    .insert(conversationPeople)
    .values({
      tenantId: reader.tenantId,
      conversationId: threadId,
      memberId: asOffice ? null : reader.memberId,
      office: asOffice,
      lastReadAt: now,
    })
    .onConflictDoNothing();

  await markThreadRead(db, reader, threadId);

  await dropDraft(
    db,
    reader,
    input.to.office ? "office" : toGroup ? `group/${toGroup}` : toTeam ? `team/${toTeam}` : them!,
  );

  return { threadId, id: made!.id };
}

/**
 * R9.7. The thread a group or a team has, started the first time somebody
 * writes into it.
 *
 * Nobody is written into it: who is in a group thread is whoever is in the
 * group at the moment they open it.
 */
/** R9.7. Whether this reader is in the group or team themselves. */
async function memberOf(
  db: Tx,
  reader: Reader,
  whose: { group?: string; team?: string },
): Promise<boolean> {
  if (!reader.memberId) return false;

  const [row] = whose.group
    ? await db
        .select({ id: groupMemberships.id })
        .from(groupMemberships)
        .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
        .where(and(
          eq(groups.slug, whose.group),
          eq(groupMemberships.memberId, reader.memberId),
        ))
        .limit(1)
    : await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(and(
          eq(teams.slug, whose.team!),
          eq(teamMembers.memberId, reader.memberId),
        ))
        .limit(1);

  return Boolean(row);
}

/** R9.7. Whether this reader may write into the group or team at all. */
async function inIt(
  db: Tx,
  reader: Reader,
  whose: { group?: string; team?: string },
): Promise<boolean> {
  /* The office acts for the church, so it can reach any group. Everybody else
     can reach only the groups they are in. */
  if (reader.office) return true;
  return memberOf(db, reader, whose);
}

async function openWhole(
  db: Tx,
  reader: Reader,
  whose: { group?: string; team?: string },
): Promise<string> {
  const standing = await inIt(db, reader, whose);
  if (!standing) throw new PermissionError(reader.office ? "staff" : "member", "editPerson");

  const [held] = whose.group
    ? await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(groups, eq(groups.id, conversations.groupId))
        .where(eq(groups.slug, whose.group))
        .limit(1)
    : await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(teams, eq(teams.id, conversations.teamId))
        .where(eq(teams.slug, whose.team!))
        .limit(1);

  if (held) return held.id;

  const [whom] = whose.group
    ? await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, whose.group)).limit(1)
    : await db.select({ id: teams.id }).from(teams).where(eq(teams.slug, whose.team!)).limit(1);
  if (!whom) throw new InvalidInputError("inbox.error.thread");

  const [made] = await db
    .insert(conversations)
    .values({
      tenantId: reader.tenantId,
      kind: whose.group ? "group" : "team",
      ...(whose.group ? { groupId: whom.id } : { teamId: whom.id }),
    })
    .returning({ id: conversations.id });

  return made!.id;
}

/** The person behind an address, where there is one. */
export async function memberBySlug(db: Tx, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.slug, slug))
    .limit(1);
  return row?.id ?? null;
}

/**
 * R16.9. The thread at an address, where this reader has one.
 *
 * The address is who it is with, so a link to a conversation is a link to a
 * person rather than to a row, and it survives whatever the row is called.
 *
 * Found in one statement rather than by reading the whole list and looking
 * through it: this runs every time somebody opens a conversation, and a panel
 * that takes a second to answer a press reads as broken.
 */
export async function threadAt(
  db: Tx,
  reader: Reader,
  key: string,
): Promise<Thread | null> {
  const me = reader.memberId ?? null;
  const [kind, name] = key.includes("/") ? key.split("/") : [null, key];

  const rows = (await db.execute(sql`
    select c.id, c.kind, c.last_message_at, c.archived_at,
           coalesce(p.office, false) as i_am_office
      from conversations c
      left join conversation_people p on p.conversation_id = c.id
       and ((p.office and ${reader.office}) or (p.member_id = ${me}))
     where ${kind === "group"
        ? sql`c.group_id = (select g.id from groups g where g.slug = ${name!} limit 1)
              and (${reader.office} or exists (select 1 from group_memberships gm
                           where gm.group_id = c.group_id and gm.member_id = ${me}))`
        : kind === "team"
          ? sql`c.team_id = (select tm.id from teams tm where tm.slug = ${name!} limit 1)
                and (${reader.office} or exists (select 1 from team_members t
                             where t.team_id = c.team_id and t.member_id = ${me}))`
          : key === "office"
            ? sql`p.id is not null and exists (select 1 from conversation_people q
                                                where q.conversation_id = c.id and q.office)`
            : sql`p.id is not null and exists (select 1 from conversation_people q
                                                 join members w on w.id = q.member_id
                                                where q.conversation_id = c.id and w.slug = ${key})`}
     order by p.office desc nulls last, c.last_message_at desc
     limit 1
  `)) as unknown as {
    id: string; kind: string; last_message_at: string | Date;
    archived_at: Date | null; i_am_office: boolean;
  }[];

  const row = rows[0];
  if (!row) return null;

  const named = kind === "group"
    ? (await db.select({ name: groups.name }).from(groups).where(eq(groups.slug, name!)).limit(1))[0]
    : kind === "team"
      ? (await db.select({ name: teams.name }).from(teams).where(eq(teams.slug, name!)).limit(1))[0]
      : null;

  const [other] = kind || key === "office"
    ? []
    : await db
        .select({
          id: members.id, first: members.firstName, last: members.lastName,
          photoKey: members.photoKey,
        })
        .from(members)
        .where(eq(members.slug, key))
        .limit(1);

  return {
    id: row.id,
    kind: row.kind,
    key,
    withMemberId: other?.id ?? null,
    withName: named?.name ?? (other ? `${other.first} ${other.last}`.trim() : ""),
    withPhotoKey: other?.photoKey ?? null,
    /* The list carries these; an open conversation shows its own lines. */
    lastLine: "",
    lastAt: new Date(row.last_message_at),
    lastMine: false,
    unread: 0,
    archived: row.archived_at !== null,
  };
}

/** R16.9. The reader has seen everything in this thread up to now. */
export async function markThreadRead(
  db: Tx,
  reader: Reader,
  conversationId: string,
): Promise<void> {
  const now = new Date();

  /* The office row where this reader answers for the church and the thread
     has one; otherwise their own. */
  const [held] = await db
    .select({ id: conversationPeople.id, office: conversationPeople.office })
    .from(conversationPeople)
    .where(and(
      eq(conversationPeople.conversationId, conversationId),
      reader.office && reader.memberId
        ? sql`(${conversationPeople.office}
               or ${conversationPeople.memberId} = ${reader.memberId})`
        : reader.office
          ? eq(conversationPeople.office, true)
          : eq(conversationPeople.memberId, reader.memberId ?? ""),
    ))
    .orderBy(desc(conversationPeople.office))
    .limit(1);

  if (held) {
    await db
      .update(conversationPeople)
      .set({ lastReadAt: now })
      .where(eq(conversationPeople.id, held.id));
    return;
  }

  /* R9.7. In a group thread nobody is written down until they read it, so
     the mark brings the row with it. */
  if (!reader.memberId) return;
  await db
    .insert(conversationPeople)
    .values({
      tenantId: reader.tenantId,
      conversationId,
      memberId: reader.memberId,
      office: false,
      lastReadAt: now,
    })
    .onConflictDoNothing();
}

/** R2.13. Off the list, kept in the records. A reply brings it back. */
export async function setThreadArchived(
  db: Tx,
  reader: Reader,
  conversationId: string,
  archived: boolean,
): Promise<void> {
  if (!(await canRead(db, reader, conversationId))) {
    throw new PermissionError(reader.office ? "staff" : "member", "editPerson");
  }
  await db
    .update(conversations)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/**
 * R16.9. Who this reader may write to.
 *
 * The office, and whoever leads something they are part of. A member with a
 * question about Tuesday wants their group leader, and a directory of four
 * hundred people in a To field is how they end up writing to a stranger.
 */
export async function recipientsFor(db: Tx, reader: Reader): Promise<Recipient[]> {
  if (!reader.memberId) return [];

  const mine = db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(eq(groupMemberships.memberId, reader.memberId));

  const groupLeaders = await db
    .select({
      id: members.id,
      slug: members.slug,
      first: members.firstName,
      last: members.lastName,
      photoKey: members.photoKey,
      through: groups.name,
    })
    .from(groupMemberships)
    .innerJoin(members, eq(members.id, groupMemberships.memberId))
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(and(
      inArray(groupMemberships.groupId, mine),
      inArray(groupMemberships.role, ["leader", "coleader"]),
      sql`${members.archivedAt} is null`,
      sql`${members.id} <> ${reader.memberId}`,
    ));

  const myTeams = db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.memberId, reader.memberId));

  const teamLeaders = await db
    .select({
      id: members.id,
      slug: members.slug,
      first: members.firstName,
      last: members.lastName,
      photoKey: members.photoKey,
      through: teams.name,
    })
    .from(teamMembers)
    .innerJoin(members, eq(members.id, teamMembers.memberId))
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(
      inArray(teamMembers.teamId, myTeams),
      eq(teamMembers.role, "leader"),
      sql`${members.archivedAt} is null`,
      sql`${members.id} <> ${reader.memberId}`,
    ));

  /* R9.7. The groups and teams themselves, which reach everybody in them. */
  const myGroups = await db
    .select({ name: groups.name, slug: groups.slug })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(and(
      eq(groupMemberships.memberId, reader.memberId),
      isNull(groups.archivedAt),
    ));

  const myServing = await db
    .select({ name: teams.name, slug: teams.slug })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(
      eq(teamMembers.memberId, reader.memberId),
      isNull(teams.archivedAt),
    ));

  const out: Recipient[] = [
    ...myGroups.map((one) => ({
      value: `group/${one.slug}`,
      name: one.name,
      photoKey: null,
      through: null,
      whole: true,
    })),
    ...myServing.map((one) => ({
      value: `team/${one.slug}`,
      name: one.name,
      photoKey: null,
      through: null,
      whole: true,
    })),
  ];

  for (const one of [...groupLeaders, ...teamLeaders]) {
    if (out.some((held) => held.value === one.slug)) continue;
    out.push({
      value: one.slug,
      name: `${one.first} ${one.last}`.trim(),
      photoKey: one.photoKey,
      through: one.through,
    });
  }
  out.sort((a, b) =>
    Number(Boolean(b.whole)) - Number(Boolean(a.whole)) || a.name.localeCompare(b.name));
  return out;
}

/**
 * R16.9. Whoever in the church answers to this name.
 *
 * For the office, which writes to anybody: the To field is a lookup rather
 * than a list, because a church of four hundred cannot be scrolled.
 */
export async function peopleNamed(
  db: Tx,
  query: string,
  limit = 10,
): Promise<Recipient[]> {
  const want = `%${query.trim().toLowerCase()}%`;
  if (query.trim().length < 2) return [];

  const rows = await db
    .select({
      slug: members.slug,
      first: members.firstName,
      last: members.lastName,
      preferred: members.preferredName,
      photoKey: members.photoKey,
    })
    .from(members)
    .where(and(
      sql`${members.archivedAt} is null`,
      sql`(
        lower(${members.firstName}) like ${want}
        or lower(${members.lastName}) like ${want}
        or lower(coalesce(${members.preferredName}, '')) like ${want}
        or lower(${members.firstName} || ' ' || ${members.lastName}) like ${want}
      )`,
    ))
    .orderBy(asc(members.lastName), asc(members.firstName))
    .limit(limit);

  return rows.map((one) => ({
    value: one.slug,
    name: `${one.preferred ?? one.first} ${one.last}`.trim(),
    photoKey: one.photoKey,
    through: null,
  }));
}

/**
 * R16.9. The groups this reader may write to.
 *
 * The office can reach any group, because it acts for the church. Everybody
 * else can reach only the groups they are in.
 */
export async function writableGroups(db: Tx, reader: Reader): Promise<Recipient[]> {
  const rows = reader.office
    ? await db
        .select({ name: groups.name, slug: groups.slug })
        .from(groups)
        .where(isNull(groups.archivedAt))
        .orderBy(asc(groups.name))
    : reader.memberId
      ? await db
          .select({ name: groups.name, slug: groups.slug })
          .from(groupMemberships)
          .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
          .where(and(
            eq(groupMemberships.memberId, reader.memberId),
            isNull(groups.archivedAt),
          ))
          .orderBy(asc(groups.name))
      : [];

  return rows.map((one) => ({
    value: `group/${one.slug}`, name: one.name, photoKey: null, through: null, whole: true,
  }));
}

/** R16.9, R10.1. The teams this reader may write to. */
export async function writableTeams(db: Tx, reader: Reader): Promise<Recipient[]> {
  const rows = reader.office
    ? await db
        .select({ name: teams.name, slug: teams.slug })
        .from(teams)
        .where(isNull(teams.archivedAt))
        .orderBy(asc(teams.name))
    : reader.memberId
      ? await db
          .select({ name: teams.name, slug: teams.slug })
          .from(teamMembers)
          .innerJoin(teams, eq(teams.id, teamMembers.teamId))
          .where(and(
            eq(teamMembers.memberId, reader.memberId),
            isNull(teams.archivedAt),
          ))
          .orderBy(asc(teams.name))
      : [];

  return rows.map((one) => ({
    value: `team/${one.slug}`, name: one.name, photoKey: null, through: null, whole: true,
  }));
}

/** R16.9. What this reader has started and not sent. */
export async function draftsFor(db: Tx, reader: Reader): Promise<Draft[]> {
  const rows = await db
    .select({
      target: messageDrafts.target,
      body: messageDrafts.body,
      updatedAt: messageDrafts.updatedAt,
      first: members.firstName,
      last: members.lastName,
      slug: members.slug,
      photoKey: members.photoKey,
      groupName: groups.name,
      teamName: teams.name,
    })
    .from(messageDrafts)
    .leftJoin(members, sql`${members.id}::text = ${messageDrafts.target}`)
    .leftJoin(groups, sql`'group/' || ${groups.slug} = ${messageDrafts.target}`)
    .leftJoin(teams, sql`'team/' || ${teams.slug} = ${messageDrafts.target}`)
    .where(eq(messageDrafts.userId, reader.userId));

  return rows
    .filter((one) => one.body.trim().length > 0)
    .map((one) => ({
      target: one.target === "office" || one.target.includes("/")
        ? one.target
        : one.slug ?? one.target,
      photoKey: one.photoKey ?? null,
      name: one.target === "office"
        ? ""
        : one.target.includes("/")
          ? (one.groupName ?? one.teamName ?? "")
          : `${one.first ?? ""} ${one.last ?? ""}`.trim(),
      body: one.body,
      updatedAt: one.updatedAt,
    }))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** R16.9. A draft, kept as it is typed. */
/**
 * Where a draft is filed.
 *
 * A group keeps its address, because that is what it is called everywhere. A
 * person keeps their id, because a slug moves when somebody is renamed and a
 * half-written letter should not go missing because of it. An id handed in
 * stays an id, so either form finds the same row.
 */
async function filedAt(db: Tx, key: string): Promise<string> {
  if (key === "office" || key.includes("/")) return key;
  return (await memberBySlug(db, key)) ?? key;
}

export async function saveDraft(
  db: Tx,
  reader: Reader,
  /** "office", a group or team address, or whoever it is addressed to. */
  key: string,
  body: string,
): Promise<void> {
  const target = await filedAt(db, key);
  if (!body.trim()) {
    await dropDraft(db, reader, key);
    return;
  }
  await db
    .insert(messageDrafts)
    .values({ tenantId: reader.tenantId, userId: reader.userId, target, body })
    .onConflictDoUpdate({
      target: [messageDrafts.tenantId, messageDrafts.userId, messageDrafts.target],
      set: { body, updatedAt: new Date() },
    });
}

export async function dropDraft(db: Tx, reader: Reader, key: string): Promise<void> {
  const target = await filedAt(db, key);
  await db
    .delete(messageDrafts)
    .where(and(
      // RLS already holds this to one church. Named again because the same
      // call on a connection without it would reach every church's drafts.
      eq(messageDrafts.tenantId, reader.tenantId),
      eq(messageDrafts.userId, reader.userId),
      eq(messageDrafts.target, target),
    ));
}

/**
 * R16.9, R16.10. Who to tell that a line has arrived, and where it opens.
 *
 * A push goes to a browser rather than to a person, so this answers in
 * accounts. Each one comes back with the address this conversation has from
 * their side, because the same thread is "the office" to a member and "Jane
 * Smith" to the office, and a notification that opens the wrong screen is a
 * notification somebody presses once.
 *
 * Read after the write rather than inside it, so the HTTP to a browser's push
 * service never happens in a transaction.
 */
export interface Listener {
  userId: string;
  /** The address this conversation has from their side. */
  key: string;
  /** Whether they read in the church's own inbox rather than the portal's. */
  office: boolean;
}

export interface Telling {
  to: Listener[];
  /** What the notification is headed with: a group, the church, or a person. */
  heading: string;
  /** Who typed it, where the heading is a group's or a team's name. */
  author: string | null;
  /** The opening of what they wrote. */
  line: string;
}

/** The name on a person's record, as a message carries it. */
const nameOf = (row: { first: string | null; last: string | null }): string =>
  `${row.first ?? ""} ${row.last ?? ""}`.trim();

/** Whoever answers for the church, which is a role rather than a person. */
async function officeAccounts(db: Tx, tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: tenantMembers.userId })
    .from(tenantMembers)
    .where(and(
      // RLS already holds this to one church. Named again because the same
      // call on a connection without it would reach every church's staff.
      eq(tenantMembers.tenantId, tenantId),
      inArray(tenantMembers.role, rolesWith("messages.office") as never[]),
    ));
  return rows.map((one) => one.userId);
}

/**
 * Which inbox each of these accounts reads in.
 *
 * Taken from the role rather than from the seat in the conversation: a group
 * leader who is also on staff reads their messages in the church's inbox, and
 * the link has to land where they are rather than where the thread sits.
 */
async function readsInOffice(db: Tx, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: tenantMembers.userId, role: tenantMembers.role })
    .from(tenantMembers)
    .where(inArray(tenantMembers.userId, userIds));
  return new Set(
    rows
      .filter((one) => can(one.role as TenantRole, "messages.office"))
      .map((one) => one.userId),
  );
}

export async function tellAbout(
  db: Tx,
  writer: Reader,
  what: { threadId: string; messageId: string },
  churchName: string,
): Promise<Telling | null> {
  const [thread] = await db
    .select({
      kind: conversations.kind,
      groupId: conversations.groupId,
      teamId: conversations.teamId,
    })
    .from(conversations)
    .where(eq(conversations.id, what.threadId))
    .limit(1);
  if (!thread) return null;

  const [line] = await db
    .select({
      body: messages.body,
      fromOffice: messages.fromOffice,
      authorMemberId: messages.authorMemberId,
      first: members.firstName,
      last: members.lastName,
    })
    .from(messages)
    .leftJoin(members, eq(members.id, messages.authorMemberId))
    .where(eq(messages.id, what.messageId))
    .limit(1);
  if (!line) return null;

  const wrote = line.fromOffice ? churchName : nameOf(line);
  /* R16.14. A line that is a photograph and nothing else still has to say
     something on a lock screen. */
  const [carried] = await db
    .select({ id: messageFiles.id })
    .from(messageFiles)
    .where(eq(messageFiles.messageId, what.messageId))
    .limit(1);
  const said = opening(line.body) || (carried ? t("inbox.aFile") : "");
  const to: Listener[] = [];
  let heading = wrote;
  let author: string | null = null;

  if (thread.kind === "group" || thread.kind === "team") {
    const [whose] = thread.groupId
      ? await db
          .select({ slug: groups.slug, name: groups.name })
          .from(groups)
          .where(eq(groups.id, thread.groupId))
          .limit(1)
      : await db
          .select({ slug: teams.slug, name: teams.name })
          .from(teams)
          .where(eq(teams.id, thread.teamId ?? ""))
          .limit(1);
    if (!whose) return null;

    const key = `${thread.kind}/${whose.slug}`;

    /* R9.7. Whoever is in it now, which is who a group thread is with: the
       seats hold read marks rather than membership. */
    const rows = thread.groupId
      ? await db
          .select({ userId: members.appUserId })
          .from(groupMemberships)
          .innerJoin(members, eq(members.id, groupMemberships.memberId))
          .where(and(
            eq(groupMemberships.groupId, thread.groupId),
            isNull(groupMemberships.leftOn),
            isNull(members.archivedAt),
          ))
      : await db
          .select({ userId: members.appUserId })
          .from(teamMembers)
          .innerJoin(members, eq(members.id, teamMembers.memberId))
          .where(and(
            eq(teamMembers.teamId, thread.teamId ?? ""),
            isNull(teamMembers.leftOn),
            isNull(members.archivedAt),
          ));

    for (const row of rows) {
      if (row.userId) to.push({ userId: row.userId, key, office: false });
    }

    /*
     * R9.7. The office is told about a group's thread only once it is in it.
     *
     * A group of twelve arranging a lift is twelve lines nobody on staff asked
     * for, and a church where every group's chatter reaches the office is a
     * church where staff turn notifications off. Writing into a group puts the
     * office in it, and from then on it is a conversation the office is part of.
     */
    if (!line.fromOffice) {
      const [seat] = await db
        .select({ id: conversationPeople.id })
        .from(conversationPeople)
        .where(and(
          eq(conversationPeople.conversationId, what.threadId),
          eq(conversationPeople.office, true),
        ))
        .limit(1);
      if (seat) {
        for (const userId of await officeAccounts(db, writer.tenantId)) {
          to.push({ userId, key, office: true });
        }
      }
    }

    heading = whose.name;
    author = wrote;
  } else if (thread.kind === "direct") {
    const rows = await db
      .select({ memberId: conversationPeople.memberId, userId: members.appUserId })
      .from(conversationPeople)
      .innerJoin(members, eq(members.id, conversationPeople.memberId))
      .where(and(
        eq(conversationPeople.conversationId, what.threadId),
        eq(conversationPeople.office, false),
      ));

    /* The thread is with whoever wrote, from the other side of it. */
    const [mine] = writer.memberId
      ? await db
          .select({ slug: members.slug })
          .from(members)
          .where(eq(members.id, writer.memberId))
          .limit(1)
      : [];
    if (!mine) return null;

    for (const row of rows) {
      if (row.userId && row.memberId !== writer.memberId) {
        to.push({ userId: row.userId, key: mine.slug, office: false });
      }
    }
  } else {
    /* A church thread: the office on one side, one member on the other. */
    const [seat] = await db
      .select({
        userId: members.appUserId,
        slug: members.slug,
        first: members.firstName,
        last: members.lastName,
      })
      .from(conversationPeople)
      .innerJoin(members, eq(members.id, conversationPeople.memberId))
      .where(and(
        eq(conversationPeople.conversationId, what.threadId),
        eq(conversationPeople.office, false),
      ))
      .limit(1);
    if (!seat) return null;

    if (line.fromOffice) {
      if (seat.userId) to.push({ userId: seat.userId, key: "office", office: false });
      heading = churchName;
    } else {
      for (const userId of await officeAccounts(db, writer.tenantId)) {
        to.push({ userId, key: seat.slug, office: true });
      }
      heading = nameOf(seat);
    }
  }

  /* Nobody is told about their own line, and a reader with two seats in one
     thread is told once. */
  const seen = new Set<string>([writer.userId]);
  const only = to.filter((one) => {
    if (seen.has(one.userId)) return false;
    seen.add(one.userId);
    return true;
  });
  if (only.length === 0) return null;

  /* The link lands in the inbox each of them actually reads in. The one
     address that settles it on its own is "office": a reader whose side of a
     thread is the church is reading as a member, whatever else they hold. */
  const staff = await readsInOffice(db, only.map((one) => one.userId));
  for (const one of only) {
    if (one.key !== "office") one.office = staff.has(one.userId);
  }

  return { to: only, heading, author, line: said };
}
