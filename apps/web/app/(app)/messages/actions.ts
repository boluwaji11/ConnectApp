"use server";

import {
  withTenant, sendMessage, setThreadArchived, threadAt, canReadMessageFile,
  saveDraft, dropDraft, peopleNamed, writableGroups, writableTeams, react,
  editMessage, deleteMessage, canAnswerMessages, tellAbout,
} from "@connectapp/db";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { readerFor } from "@/lib/inbox";
import { tellAboutMessage } from "@/lib/inbox-push";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * R16.9. Writing, reading and keeping what has not been sent.
 *
 * Every address here is a person rather than a row: "office", or whoever the
 * message is for. A link to a conversation is a link to somebody.
 */
async function context() {
  const session = await requireSession();
  return {
    session,
    ctx: {
      tenantId: session.tenantId,
      role: session.role,
      userId: session.userId,
      permissions: session.permissions,
    },
  };
}

/** R16.9. A message, to the office or to whoever it names. */
export async function send(
  to: string,
  body: string,
  /** R16.9. The line this one answers, where it answers one. */
  answering?: string | null,
  /** R16.14. What was uploaded to go with it, in the order it was chosen. */
  files?: { id: string; label?: string | null }[],
): Promise<{ key?: string; error?: string }> {
  try {
    const { session, ctx } = await context();
    const { sent, told } = await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);
      const [kind, name] = to.includes("/") ? to.split("/") : [null, to];
      const made = await sendMessage(tx, me, {
        to: to === "office"
          ? { office: true }
          : kind === "group"
            ? { office: false, group: name! }
            : kind === "team"
              ? { office: false, team: name! }
              : { office: false, slug: to },
        body,
        answering,
        files,
      });
      /* R16.10. Read in the same breath as the write, sent after it: who to
         tell is a question about the church's records, and a push is three
         seconds of somebody else's HTTP. */
      return {
        sent: made,
        told: await tellAbout(tx, me, { threadId: made.threadId, messageId: made.id }, session.tenantName),
      };
    });

    if (told) await tellAboutMessage(ctx, told, sent.threadId);

    return { key: to };
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R16.14, R21.1. A link to something sent with a message.
 *
 * Signed for a key this church's own ledger holds, and only for as long as it
 * takes to open: a file in a conversation is the church's, not the web's.
 */
export async function messageFileLink(
  key: string,
  church?: string,
  /** What to call it once it lands, which is the name it arrived with. */
  name?: string,
): Promise<string | null> {
  const { session, ctx } = await context();
  /*
   * SEC-019. Party to the conversation, not merely in the church.
   *
   * This asked `holdsFile`, which answers whether the church holds the key and
   * says as much in its own comment. So any member with a key was signed an
   * hour-long URL to an attachment from a thread they were never in, pastoral
   * ones included. Every other read in this file is scoped to the reader.
   */
  const mine = await withTenant(ctx, async (tx) =>
    canReadMessageFile(tx, await readerFor(tx, session), key),
  );
  if (!mine) return null;

  const supabase = await supabaseServer();
  const clean = (name ?? "").replace(/[\\/:*?"<>|]/g, "").trim();
  const signed = await supabase.storage
    .from("church")
    .createSignedUrl(key, 3600, clean ? { download: clean } : undefined);
  return signed.data?.signedUrl ?? null;
}

/** R2.13. Off the list, kept in the records. A reply brings it back. */
export async function archiveThread(
  key: string,
  archived: boolean,
  ): Promise<{ error?: string }> {
  try {
    const { session, ctx } = await context();
    await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);
      const thread = await threadAt(tx, me, key);
      if (thread) await setThreadArchived(tx, me, thread.id, archived);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R16.9. What has been typed and not sent, kept as it is typed. */
export async function keepDraft(
  to: string,
  body: string,
  ): Promise<{ error?: string }> {
  try {
    const { session, ctx } = await context();
    await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);
      await saveDraft(tx, me, to, body);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R16.9. A draft thrown away. */
export async function binDraft(to: string): Promise<{ error?: string }> {
  try {
    const { session, ctx } = await context();
    await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);
      await dropDraft(tx, me, to);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

export interface WriteTo {
  value: string;
  label: string;
  /** Why they are on the list: the group or team they lead. */
  through?: string | null;
  /** R9.7. Whether it reaches everybody in a group rather than one person. */
  whole?: boolean;
}

/** R16.9. Changing a line already sent. */
export async function editLine(
  id: string,
  body: string,
  ): Promise<{ error?: string }> {
  try {
    const { session, ctx } = await context();
    await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);
      await editMessage(tx, me, id, body);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R16.9, R2.13. Taking a line back: the words go, the line stays. */
export async function deleteLine(
  id: string,
  ): Promise<{ error?: string }> {
  try {
    const { session, ctx } = await context();
    await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);
      await deleteMessage(tx, me, id);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R16.9. A mark put against a message, or taken off it again. */
export async function markMessage(
  id: string,
  emoji: string,
  ): Promise<{ error?: string }> {
  try {
    const { session, ctx } = await context();
    await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);
      await react(tx, me, id, emoji);
    });
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/** R16.9. The kinds of thing a message can be addressed to. */
export type WriteKind = "church" | "member" | "group" | "team";

/**
 * R16.9. What this reader may address a message to.
 *
 * Asked a kind at a time, because a church has three different lists and
 * putting them in one box made the office scroll past every group to reach a
 * name. Each list is what this reader may reach: the office looks anybody up
 * and writes to any group, a member reaches the groups and teams they are in
 * and whoever leads one of them.
 */
export async function whoToWriteTo(
  kind: WriteKind,
  query: string,
): Promise<WriteTo[]> {
  try {
    const { session, ctx } = await context();
    return await withTenant(ctx, async (tx) => {
      const me = await readerFor(tx, session);

      if (kind === "group") {
        return (await writableGroups(tx, me)).map((one) => ({
          value: one.value, label: one.name, whole: true,
        }));
      }

      if (kind === "team") {
        return (await writableTeams(tx, me)).map((one) => ({
          value: one.value, label: one.name, whole: true,
        }));
      }

      /*
       * R16.9, R3.2. Only the office writes to a person by name.
       *
       * A member writes to the church, or to a group or team they are part
       * of. A directory of four hundred people in a To field would be the
       * church's own privacy settings undone by a message box.
       */
      if (!canAnswerMessages(session)) return [];

      return (await peopleNamed(tx, query)).map((one) => ({
        value: one.value, label: one.name, through: null,
      }));
    });
  } catch {
    return [];
  }
}

/** R16.9. Which kinds this reader may address, in the order they are offered. */
export async function kindsICanWriteTo(): Promise<WriteKind[]> {
  try {
    const { session } = await context();
    return canAnswerMessages(session)
      ? ["member", "group", "team"]
      : ["church", "group", "team"];
  } catch {
    return [];
  }
}
