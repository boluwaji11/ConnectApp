"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import {
  withTenant,
  emailRecipientsFor, findEmailRecipients, wayOutForAll, wayOutKey, startSend,
  emailProvider, readSend, restoreConsent, cancelSend,
  listSends, listWithdrawn, countAllWithdrawn,
  type Audience, canManageChurch, PermissionError,
} from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { markdownToHtml } from "@/lib/rich-text";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { churchOrigin } from "@/lib/church-address";
import { drain } from "@/lib/send-worker";

/**
 * HRT-139, HRT-143, R16.4, R16.6, R16.8. Sending one message to a church's people.
 *
 * Every copy carries the way out. That is not a line at the bottom of a
 * template somebody could delete: it is added here, to every message, and a
 * church cannot send one without it.
 *
 * Sent from the request rather than from a queue, because there is no queue
 * yet. That is the limit on this: a send is capped, and a church with
 * thousands waits for HRT-141. What is here works for the fifty to five
 * hundred this product is for.
 */

export interface SendResult {
  error?: string;
  /** R16.6. How many copies were written down, which is what the press did. */
  queued?: number;
  sendId?: string;
}

/**
 * SEC-022. Who this screen's actions belong to.
 *
 * Every action in this file is about the church's own mail: who it would
 * reach, what has been sent, who has asked to be left alone, and sending.
 * Sending was refused in the repository and the screen refuses a reader who
 * may not manage the church, but the five reads were refused nowhere.
 *
 * So a plain member could count an audience and take three addresses off it, a
 * query at a time, which is the directory one call at a time; could search
 * recipients by name and read the address back; could open any past send and
 * read its whole body; and could list everybody who had unsubscribed. The
 * permission is checked here so it covers the actions added after this one.
 *
 * `actor` carries the permissions as well. Without them a church that wrote
 * its own role would be judged by the built-in matrix and refused its own
 * grant.
 */
async function context() {
  const session = await requireSession();
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");

  if (!canManageChurch(session)) throw new PermissionError(session.role, "editChurch");

  return {
    session,
    actor: {
      tenantId: session.tenantId,
      role: session.role,
      userId: session.userId,
      permissions: session.permissions,
    },
    ctx: {
      tenantId: session.tenantId,
      role: session.role,
      userId: session.userId,
      permissions: session.permissions,
      ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
    },
  };
}

const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * R16.4. How many this would reach, and a few of them by name.
 *
 * The count alone is not enough to catch the mistake that matters, which is
 * the right message going to the wrong list. Three addresses is enough for
 * somebody to recognise the audience, or to realise they have the whole
 * directory selected when they meant a group of eight.
 */
export interface Reach {
  count: number;
  sample: string[];
}

export async function countAudience(
  audience: Audience,
  audienceId: string | null,
  memberIds: string[] = [],
  addresses: string[] = [],
): Promise<Reach> {
  const { ctx } = await context();
  const people = await withTenant(ctx, (tx) =>
    emailRecipientsFor(tx, { audience, audienceId, memberIds, addresses }),
  );
  return { count: people.length, sample: people.slice(0, 3).map((one) => one.address) };
}

/**
 * R16.6. One message as it went out, for reading back.
 *
 * A send cannot be edited or sent again from here. What it answers is the
 * question a church actually asks weeks later: what did we say, and who did
 * it reach.
 */
export async function openSend(id: string) {
  const { ctx } = await context();
  const held = await withTenant(ctx, (tx) => readSend(tx, id));
  if (!held) return null;
  return {
    ...held,
    sentAt: held.sentAt ? held.sentAt.toISOString() : null,
    sendAt: held.sendAt ? held.sendAt.toISOString() : null,
    html: markdownToHtml(held.body),
  };
}

/**
 * R16.8. Putting somebody back on the list, from the office.
 *
 * A church is asked for this in the car park far more often than through a
 * link, and the alternative is a volunteer being told it cannot be undone.
 */
export async function putBack(id: string): Promise<boolean> {
  const { ctx, actor } = await context();
  try {
    await withTenant(ctx, (tx) => restoreConsent(tx, actor, id));
    revalidatePath("/members/email");
    return true;
  } catch {
    return false;
  }
}

/**
 * R16.6. Calling off a send that has not gone.
 *
 * Only what is still waiting stops. Anything the provider already took is on
 * its way and nothing here can reach it.
 */
export async function callOffSend(id: string): Promise<boolean> {
  const { ctx, actor } = await context();
  try {
    const stopped = await withTenant(ctx, (tx) => cancelSend(tx, actor, id));
    revalidatePath("/members/email");
    return stopped;
  } catch {
    return false;
  }
}

/** R16.6. A page of what this church has sent. */
export async function sentPage(page: number) {
  const { ctx } = await context();
  const rows = await withTenant(ctx, (tx) =>
    listSends(tx, { limit: 10, offset: Math.max(0, page - 1) * 10 }),
  );
  return rows.map((one) => ({
    id: one.id,
    subject: one.subject,
    state: one.state,
    total: one.total,
    done: one.done ?? 0,
    delivered: one.delivered,
    failed: one.failed,
    sentAt: one.sentAt?.toISOString() ?? null,
    sendAt: one.sendAt?.toISOString() ?? null,
  }));
}

/** R16.8. A page of who has asked this church to stop. */
export async function withdrawnPage(page: number) {
  const { ctx } = await context();
  const read = await withTenant(ctx, async (tx) => ({
    rows: await listWithdrawn(tx, { limit: 10, offset: Math.max(0, page - 1) * 10 }),
    total: await countAllWithdrawn(tx),
  }));
  return {
    total: read.total,
    rows: read.rows.map((one) => ({
      id: one.id,
      address: one.address,
      name: one.name,
      withdrawnAt: one.withdrawnAt?.toISOString() ?? null,
    })),
  };
}

/** R16.4. People matching what the writer typed, for choosing them one by one. */
export async function findRecipients(query: string) {
  const { ctx } = await context();
  try {
    return await withTenant(ctx, (tx) => findEmailRecipients(tx, query));
  } catch {
    return [];
  }
}

export async function sendEmail(data: FormData): Promise<SendResult> {
  const { session, actor, ctx } = await context();

  const subject = field(data, "subject");
  const body = field(data, "body");
  if (!subject) return { error: t("send.error.subject") };
  if (!body) return { error: t("send.error.body") };

  const audience = (field(data, "audience") || "everyone") as Audience;
  const audienceId = field(data, "audienceId") || null;
  const audienceName = field(data, "audienceName") || null;
  const memberIds = field(data, "memberIds").split(",").filter(Boolean);
  const addresses = field(data, "addresses").split(",").filter(Boolean);

  /* R16.6. The scheduled send time. A church composing in advance needs to set
     the time here rather than return to send it manually. */
  const when = field(data, "sendAt");
  const sendAt = when ? new Date(when) : null;
  if (sendAt && Number.isNaN(sendAt.getTime())) return { error: t("send.error.when") };

  try {
    const held = await withTenant(ctx, (tx) => emailProvider(tx));
    if (!held?.fromAddress) return { error: t("email.test.notConnected") };

    const people = await withTenant(ctx, async (tx) => {
      const found = await emailRecipientsFor(tx, { audience, audienceId, memberIds, addresses });
      /* R16.8. Each person's own way out, minted once and kept, so a link in
         a message sent last year still works. Minted here rather than in the
         worker, because this is the last point at which the church's own
         session is what authorises writing to its records, and minted for the
         whole audience in one go, because a round trip each put eleven seconds
         in front of a church-wide send. */
      const tokens = await wayOutForAll(tx, actor, found);
      for (const one of found) one.token = tokens.get(wayOutKey(one)) ?? "";
      return found.filter((one) => one.token);
    });

    if (people.length === 0) return { error: t("send.error.nobody") };

    const origin = (await churchOrigin(session.tenantSlug)) ?? "";

    const sendId = await withTenant(ctx, (tx) =>
      startSend(tx, actor, {
        subject,
        body,
        audience,
        audienceId,
        audienceName,
        sendAt,
        origin,
        recipients: people.map((one) => ({ memberId: one.memberId, address: one.address })),
      }),
    );

    revalidatePath("/members/email");

    /*
     * R16.6. The press itself does the first of the work, so a message to
     * three people arrives while the church is still looking at the screen.
     * What it does not finish is a row still waiting, which the worker takes
     * on its next pass.
     */
    if (!sendAt) after(() => drain(2));

    return { queued: people.length, sendId };
  } catch (error) {
    return { error: explain(error) };
  }
}
