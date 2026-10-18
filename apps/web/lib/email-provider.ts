import nodemailer from "nodemailer";
import type { PlannedRecord, Resolver, SmtpSettings } from "@connectapp/db";

/**
 * HRT-287, R16.1. Talking to the thing a church is about to connect.
 *
 * Every call here acts as the church, with a credential the church typed in a
 * moment ago. The plaintext is in hand at that moment, so nothing in this file
 * ever opens a stored credential: a connection is proved before it is written
 * down, and after that only the worker that sends has any business reading it.
 *
 * A refusal is handed back in the vendor's own words. "Invalid login:
 * 535-5.7.8 Username and Password not accepted" tells a volunteer which of the
 * two fields to look at. "Could not connect" tells them nothing.
 */

/**
 * R16.1, R16.7. The outcome of one send attempt, as the provider reported it.
 *
 * `again` separates a temporary failure from a permanent one: a rate limit or a
 * provider-side fault is worth retrying, a refusal naming the address is not.
 * `ref` is the provider's own identifier for the message, which is how a later
 * delivery verdict is matched back to the recipient.
 */
export type Proof =
  | { ok: true; ref?: string | null }
  | { ok: false; said: string; again?: boolean };

const RESEND = "https://api.resend.com";

/** Long enough for a mail server on a slow link, short enough to not hang a form. */
const PATIENCE = 10_000;

/**
 * R16.1. Whether a church's own mail server will take a message from us.
 *
 * `verify` opens the session and authenticates without sending anything, which
 * is the only question worth asking at setup time: Google Workspace needs an
 * app password rather than the sign-in password, and Microsoft 365 needs SMTP
 * AUTH enabled for the mailbox. Both fail here, named, rather than silently on
 * the first real send.
 */
export async function proveSmtp(
  settings: SmtpSettings & { password: string },
): Promise<Proof> {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.username, pass: settings.password },
    /*
     * SEC-015, R21.15. The church's own mailbox password is never sent in the
     * clear.
     *
     * `secure: true` is implicit TLS on 465. On 587, which is what most
     * providers tell a church to use, the connection starts in the clear and
     * upgrades, and nodemailer will carry on unencrypted if the server simply
     * does not advertise STARTTLS. That is the one place in the product where a
     * credential a church gave us crosses a wire, so it fails rather than
     * downgrading. The platform's own transport already asks for this.
     */
    requireTLS: !settings.secure,
    connectionTimeout: PATIENCE,
    greetingTimeout: PATIENCE,
    socketTimeout: PATIENCE,
  });

  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, said: said(error) };
  } finally {
    transport.close();
  }
}

/** What a vendor or a socket actually said, trimmed to one line. */
function said(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").trim().slice(0, 300);
}

async function resend(
  key: string,
  path: string,
  init?: { method: string; body?: unknown },
): Promise<{ ok: true; body: unknown } | { ok: false; said: string; again?: boolean }> {
  try {
    const answer = await fetch(`${RESEND}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(PATIENCE),
      cache: "no-store",
    });

    const body: unknown = await answer.json().catch(() => null);
    if (answer.ok) return { ok: true, body };

    /* Resend answers a refusal with its own sentence, which names the problem
       better than a status code does. */
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : `${answer.status}`;

    /* R16.7. Too many at once, or the provider's own fault. Both come round
       again; a refusal naming the address does not. */
    const again = answer.status === 429 || answer.status >= 500;
    return { ok: false, said: message.slice(0, 300), again };
  } catch (error) {
    /* A timeout or a connection that failed is nobody's verdict on the
       address, so it is worth another go. */
    return { ok: false, said: said(error), again: true };
  }
}

/**
 * R16.1. Whether this key is a key, and whether it can do what we need.
 *
 * Reading the domains is the cheapest call that `emails:send` cannot make, so
 * a key that answers it is a key with the access the rest of this screen
 * depends on. A send-only key is refused here rather than at the point the
 * church has typed in its domain and pressed Verify.
 */
export async function proveResend(key: string): Promise<Proof> {
  const read = await resend(key, "/domains");
  return read.ok ? { ok: true } : { ok: false, said: read.said };
}

/** A domain Resend holds for this account. */
export interface ResendDomain {
  id: string;
  name: string;
  records: PlannedRecord[];
}

const PURPOSE: Record<string, PlannedRecord["purpose"]> = {
  dkim: "dkim",
  spf: "spf",
};

/**
 * R16.1. What Resend generated, in the shape a registrar's form asks for.
 *
 * Resend returns the DKIM key at the root and puts its SPF record and its
 * return-path MX on a `send.` subdomain, so the church's own MX, the one
 * pointing at Workspace or 365, is never in the picture. The return path
 * carries bounces and complaints, and dropping it ruins a sending reputation
 * faster than anything else on this screen, so every record Resend asks for is
 * passed through exactly as it came.
 */
function recordsOf(raw: unknown): PlannedRecord[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((one): PlannedRecord[] => {
    if (typeof one !== "object" || one === null) return [];
    const held = one as Record<string, unknown>;
    const type = String(held.type ?? "").toUpperCase();
    if (type !== "TXT" && type !== "MX" && type !== "CNAME") return [];

    const record = String(held.record ?? "").toLowerCase();
    const purpose: PlannedRecord["purpose"] =
      type === "MX" ? "returnPath" : (PURPOSE[record] ?? "spf");

    return [
      {
        type,
        host: String(held.name ?? ""),
        value: String(held.value ?? "") || null,
        ...(held.priority === undefined || held.priority === null
          ? {}
          : { priority: Number(held.priority) }),
        purpose,
      },
    ];
  });
}

/**
 * R16.1. The church's domain on its own Resend account, created if it is new.
 *
 * Registered at the root, so the church sends as `sarah@its-own-domain` with
 * the signature aligned to the address a member reads and DMARC passing on
 * that alignment. Resend's inbound setting is what would take a church's mail,
 * and it is never asked for.
 */
export async function resendDomain(
  key: string,
  domain: string,
): Promise<{ ok: true; domain: ResendDomain } | { ok: false; said: string }> {
  const listed = await resend(key, "/domains");
  if (!listed.ok) return listed;

  const rows =
    typeof listed.body === "object" && listed.body !== null && "data" in listed.body
      ? (listed.body as { data: unknown }).data
      : null;

  const already = Array.isArray(rows)
    ? rows.find(
        (one) =>
          typeof one === "object" &&
          one !== null &&
          String((one as { name?: unknown }).name ?? "").toLowerCase() === domain,
      )
    : undefined;

  let id = already ? String((already as { id?: unknown }).id ?? "") : "";
  if (!id) {
    const made = await resend(key, "/domains", { method: "POST", body: { name: domain } });
    if (!made.ok) return made;
    id = String((made.body as { id?: unknown })?.id ?? "");
  }

  /* Created or found, the records come from the domain's own row: a domain
     this account already held was not created by us and its key is its own. */
  const one = await resend(key, `/domains/${id}`);
  if (!one.ok) return one;

  const body = (one.body ?? {}) as { id?: unknown; name?: unknown; records?: unknown };
  return {
    ok: true,
    domain: {
      id: String(body.id ?? id),
      name: String(body.name ?? domain),
      records: recordsOf(body.records),
    },
  };
}

/**
 * R16.1. Whether the records a church was given are actually published.
 *
 * Read from public DNS rather than from the provider, because public DNS is
 * what every mail server on the internet reads and it needs no credential:
 * nothing sealed is opened to answer the one question the church keeps coming
 * back to this screen for.
 *
 * A TXT record is compared on what it says rather than on the exact string. A
 * registrar wraps a long DKIM key across several strings and some of them add
 * quotes, and none of that is a different record.
 */
export async function recordsPublished(
  records: readonly PlannedRecord[],
  domain: string,
  resolver: Resolver,
): Promise<{ host: string; found: boolean }[]> {
  return Promise.all(
    records.map(async (record) => {
      const want = (record.value ?? "").replace(/\s+/g, "").replace(/"/g, "").toLowerCase();
      if (!want) return { host: record.host, found: false };

      /* A provider writes the name the way a registrar's form asks for it,
         which is the part in front of the domain. DNS wants the whole name. */
      const at = record.host.endsWith(domain) ? record.host : `${record.host}.${domain}`;

      try {
        if (record.type === "MX") {
          const found = await resolver.mx(at);
          return {
            host: record.host,
            found: found.some((one) => one.exchange.toLowerCase().replace(/\.$/, "") === want),
          };
        }

        /* Resend sets a sender up with two CNAMEs rather than an SPF record
           and an MX, which is what "Check again" was reading for and never
           finding. */
        if (record.type === "CNAME") {
          const found = await resolver.cname(at);
          return {
            host: record.host,
            found: found.some((one) => one.toLowerCase().replace(/\.$/, "") === want),
          };
        }

        const found = await resolver.txt(at);
        return {
          host: record.host,
          found: found.some(
            (parts) => parts.join("").replace(/\s+/g, "").toLowerCase() === want,
          ),
        };
      } catch {
        /* A name that does not resolve is a record that is not there yet,
           which is the answer rather than an error worth showing. */
        return { host: record.host, found: false };
      }
    }),
  );
}

/** HRT-290, R16.1. One message, as the church. */
export interface Message {
  from: string;
  to: string;
  subject: string;
  text: string;
  /**
   * R16.4. The same message marked up, where there is one.
   *
   * A reader gets whichever their mail program prefers, and the plain copy
   * exists so the one that prefers text is not handed a page of tags.
   */
  html?: string;
  /**
   * R22.1. Where a reply should go, where that is not the sender.
   *
   * A church writing to support is answered by pressing reply, and the
   * message leaves through the platform's own address rather than theirs.
   */
  replyTo?: string;
}

/** The address a provider wants: the name, then the address in angle brackets. */
export const sender = (name: string | null, address: string): string =>
  name?.trim() ? `${name.trim()} <${address}>` : address;

/** R16.1. Sending through a church's own mail server. */
export async function sendBySmtp(
  settings: SmtpSettings & { password: string },
  message: Message,
): Promise<Proof> {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.username, pass: settings.password },
    /*
     * SEC-015, R21.15. The church's own mailbox password is never sent in the
     * clear.
     *
     * `secure: true` is implicit TLS on 465. On 587, which is what most
     * providers tell a church to use, the connection starts in the clear and
     * upgrades, and nodemailer will carry on unencrypted if the server simply
     * does not advertise STARTTLS. That is the one place in the product where a
     * credential a church gave us crosses a wire, so it fails rather than
     * downgrading. The platform's own transport already asks for this.
     */
    requireTLS: !settings.secure,
    connectionTimeout: PATIENCE,
    greetingTimeout: PATIENCE,
    socketTimeout: PATIENCE,
  });

  try {
    await transport.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, said: said(error) };
  } finally {
    transport.close();
  }
}

/** R16.1. Sending through the church's own Resend account. */
export async function sendByResend(accessToken: string, message: Message): Promise<Proof> {
  const answer = await resend(accessToken, "/emails", {
    method: "POST",
    body: {
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    },
  });

  if (!answer.ok) return answer;

  const body = answer.body as { id?: unknown } | null;
  return { ok: true, ref: typeof body?.id === "string" ? body.id : null };
}

/** R16.7. What became of one copy, as the provider last saw it. */
export type Verdict = "delivered" | "bounced" | "complained" | "sent" | "unknown";

/**
 * R16.7. Asking the provider what happened to a message it accepted.
 *
 * Accepting a message is not delivering it. A provider takes it, tries the
 * other side, and finds there is nobody at that address, and that answer
 * arrives minutes later with nothing to tell us about it unless we ask.
 */
export async function verdictFromResend(
  accessToken: string,
  ref: string,
): Promise<Verdict> {
  const answer = await resend(accessToken, `/emails/${encodeURIComponent(ref)}`);
  if (!answer.ok) return "unknown";

  const body = answer.body as { last_event?: unknown } | null;
  const event = typeof body?.last_event === "string" ? body.last_event : "";

  if (event === "delivered") return "delivered";
  if (event === "bounced") return "bounced";
  if (event === "complained") return "complained";
  if (event === "sent" || event === "delivery_delayed") return "sent";
  return "unknown";
}
