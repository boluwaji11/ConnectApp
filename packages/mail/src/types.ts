/** One message, in the few fields every transport here needs. */
export interface Message {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /**
   * Who else is on the message, visibly.
   *
   * Only for mail the platform sends to itself, where everybody on it is the
   * same operator reading two mailboxes. A message to a church or a member
   * carries one address, because a second name in the header shows that
   * person's address to the first.
   */
  cc?: string[];
}

/** Whether it went, and what the provider said where it did not. */
export type Sent =
  | { ok: true }
  | { ok: false; connected: boolean; said?: string };
