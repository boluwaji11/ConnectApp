import { t } from "@connectapp/i18n";
import type { Message, Sent } from "./types";

/**
 * HRT-388, R16.4. One message from ConnectApp itself.
 *
 * The platform's own mail, on the platform's own account: an invitation, a
 * welcome, the word that a church has been approved. None of it is a church
 * writing to its congregation, which goes out on the church's own account and
 * through the queue. This is what "the shared email quota is transactional
 * only" means in code.
 *
 * Deliberately a bare request rather than the provider module the product
 * sends through. That module carries a mail server client for a church's own
 * SMTP, and the admin app has no business pulling one in to say that a church
 * has been approved.
 */
const RESEND = "https://api.resend.com/emails";

/** Long enough for a slow answer, short enough to not hang a press. */
const PATIENCE = 10_000;

/** Who it comes from, as a mail program shows it. */
const sender = (name: string, address: string): string => `${name} <${address}>`;

export async function sendAsPlatform(message: Omit<Message, "from">): Promise<Sent> {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["PLATFORM_FROM_EMAIL"] ?? process.env["SUPPORT_FROM_EMAIL"];

  /* A deployment with no platform account of its own, which is a laptop. */
  if (!key || !from) return { ok: false, connected: false };

  try {
    const answer = await fetch(RESEND, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: sender(t("app.name"), from),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.cc?.length ? { cc: message.cc } : {}),
      }),
      signal: AbortSignal.timeout(PATIENCE),
      cache: "no-store",
    });

    if (answer.ok) return { ok: true };

    const held: unknown = await answer.json().catch(() => null);
    const said =
      typeof held === "object" && held !== null && "message" in held
        ? String((held as { message: unknown }).message)
        : `${answer.status}`;
    return { ok: false, connected: true, said: said.slice(0, 300) };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, connected: true, said: raw.replace(/\s+/g, " ").trim().slice(0, 300) };
  }
}
