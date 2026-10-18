"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  withTenant, dnsResolver,
  connectEmailProvider, withdrawEmailProvider,
  sendingDomain, markSendingDomain, emailProvider,
} from "@connectapp/db";
import { t } from "@connectapp/i18n";
import { explain } from "@/lib/explain";
import { requireSession } from "@/lib/session";
import { proveSmtp, recordsPublished } from "@/lib/email-provider";
import { resendClientId, revokeGrant } from "@/lib/resend-oauth";
import { sendAsChurch } from "@/lib/transactional";
import { stepUpNeeded, type MayNeedStepUp } from "@/lib/step-up";

/**
 * HRT-287, R16.1, R21.15. Connecting the account a church's email leaves through.
 *
 * Every one of these proves the connection before it writes it down, with the
 * credential the church typed in hand. Nothing here opens a stored one: a
 * church's mail password is sealed in its column and read by the worker that
 * sends, and a request path that could read it is a request path that could
 * leak it.
 */

export interface EmailResult extends MayNeedStepUp {
  error?: string;
  /** R16.1. The provider has gone, so the screen leaves the round trip's
      message behind in the address it arrived in. */
  went?: boolean;
}

async function context() {
  const session = await requireSession();
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    actor: { tenantId: session.tenantId, role: session.role, userId: session.userId },
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

const SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** The address mail goes out as, which both vendors need and neither invents. */
function from(data: FormData): { name: string; address: string } | { error: string } {
  const address = field(data, "fromAddress").toLowerCase();
  if (!address) return { error: t("email.error.from") };
  if (!SHAPE.test(address)) return { error: t("email.error.fromShape") };
  return { name: field(data, "fromName"), address };
}

/** R16.1. A church's own mail server, proved by opening a session with it. */
export async function connectSmtp(data: FormData): Promise<EmailResult> {
  const { actor, ctx } = await context();

  /* R1.8, R21.4. These credentials send mail as the church to everybody in
     it, so they are asked for behind the code rather than behind the role. */
  const stop = await stepUpNeeded();
  if (stop) return stop;

  const sender = from(data);
  if ("error" in sender) return { error: sender.error };

  const host = field(data, "host").toLowerCase();
  if (!host) return { error: t("email.error.host") };

  const port = Number(field(data, "port") || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: t("email.error.port") };

  const settings = {
    host,
    port,
    /* 465 is encrypted from the first byte. 587 starts in the clear and raises
       STARTTLS, which nodemailer does on its own when `secure` is false. */
    secure: port === 465,
    username: field(data, "username"),
  };

  const proof = await proveSmtp({ ...settings, password: field(data, "password") });
  if (!proof.ok) return { error: proof.said };

  try {
    await withTenant(ctx, (tx) =>
      connectEmailProvider(tx, actor, {
        vendor: "smtp",
        credential: field(data, "password"),
        externalAccountId: settings.username || null,
        fromName: sender.name,
        fromAddress: sender.address,
        settings,
      }),
    );
    revalidatePath("/settings/email");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R16.1. Whether the records are published, read from public DNS.
 *
 * Public DNS is what every mail server on the internet reads before it
 * delivers, and it needs no credential, so the question a church keeps coming
 * back to this screen for is answered without opening anything sealed.
 */
export async function checkRecords(): Promise<EmailResult> {
  const { actor, ctx } = await context();

  try {
    const held = await withTenant(ctx, async (tx) => {
      const provider = await emailProvider(tx);
      return provider ? sendingDomain(tx, provider.id) : null;
    });
    if (!held) return {};

    const seen = await recordsPublished(held.records, held.domain, dnsResolver());
    const missing = seen.filter((one) => !one.found);

    await withTenant(ctx, (tx) =>
      markSendingDomain(tx, actor, {
        id: held.id,
        state: missing.length === 0 ? "verified" : "pending",
        failureReason: null,
      }),
    );
    revalidatePath("/settings/email");
    return {};
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * R16.1, R21.15. Taking the connection off, and handing the grant back.
 *
 * Forgetting our copy of a Resend token leaves a live grant sitting on the
 * church's own account, which is not what a church that pressed Disconnect
 * asked for. So the credential comes out of the column and goes straight to
 * Resend to be withdrawn, and it is gone from here either way.
 */
export async function disconnectEmail(): Promise<EmailResult> {
  const { actor, ctx } = await context();

  /* R1.8, R21.4. Taking the account away stops every message the church
     sends, which is as much of a change as connecting one. */
  const stop = await stepUpNeeded();
  if (stop) return stop;

  try {
    const held = await withTenant(ctx, (tx) => withdrawEmailProvider(tx, actor));

    const clientId = resendClientId();
    if (held?.vendor === "resend" && held.credential && clientId) {
      await revokeGrant(clientId, held.credential);
    }

    revalidatePath("/settings/email");
    return { went: true };
  } catch (error) {
    return { error: explain(error) };
  }
}

/**
 * HRT-290, R16.1, R21.15. One message, through whatever the church connected.
 *
 * The proof a church actually wants: not that a key was accepted, but that
 * something arrived in somebody's inbox with the church's name on it.
 *
 * It goes out through the same path an invitation does, which is a credential
 * opened for the length of one send rather than a row in the queue. The queue
 * is for a composed send to a list, and this is one address.
 */
export async function sendTest(data: FormData): Promise<EmailResult> {
  const session = await requireSession();

  /* Typed rather than assumed. The address on the account is often a
     volunteer's work address, and the one they want to see this arrive at is
     the church's own. */
  const to = field(data, "to").toLowerCase();
  if (!to) return { error: t("email.test.noAddress") };
  if (!SHAPE.test(to)) return { error: t("email.error.fromShape") };

  try {
    const sent = await sendAsChurch(session, {
      to,
      subject: t("email.test.subject", { church: session.tenantName }),
      text: t("email.test.body", { church: session.tenantName }),
    });

    revalidatePath("/settings/email");
    if (sent.ok) return {};
    return { error: sent.connected ? sent.said : t("email.test.notConnected") };
  } catch (error) {
    return { error: explain(error) };
  }
}
