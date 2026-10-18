/**
 * HRT-437, R1.7, R16.4. Every message ConnectApp sends, checked as a set.
 *
 * These are the only emails that go out under our own name: a church's own
 * messages to its members go through the church's provider and are the
 * church's words, not ours. What is asserted here is the part a reader
 * notices before they read a word of it: that it is drawn like the product,
 * that the link goes to a name they recognise, and that the voice is the one
 * docs/ux-writing.md describes.
 */
import { describe, it, expect } from "vitest";
import {
  verifyMarkup, resetMarkup, magicMarkup, teamInviteMarkup, emailChangeMarkup,
  authMessage, welcomeMessage, approvedMessage, HOME,
} from "../src";

const LINK = `${HOME}/auth/verify?token=x&type=signup`;

/** The auth messages, which are the ones Supabase would otherwise have sent. */
const auth = [
  ["signup", verifyMarkup(LINK)],
  ["recovery", resetMarkup(LINK)],
  ["magiclink", magicMarkup(LINK)],
  ["teaminvite", teamInviteMarkup(LINK)],
  ["email_change", emailChangeMarkup(LINK)],
] as const;

/** The two this product sends itself. */
const own = [
  ["welcome", welcomeMessage({
    church: "Test Church", slug: "test", to: "a@example.test", approved: false, cap: 25,
  })],
  ["approved", approvedMessage({ church: "Test Church", slug: "test", to: "a@example.test" })],
] as const;

const everything = [
  ...auth.map(([name, html]) => [name, html] as const),
  ...own.map(([name, msg]) => [name, msg.html] as const),
];

describe("every message is drawn like the product", () => {
  it.each(everything)("%s uses the brand shell", (_name, html) => {
    /* The card, the wordmark and the footer rule the shell writes. */
    expect(html).toContain("max-width:560px");
    expect(html).toContain("border-radius:14px");
  });

  it.each(everything)("%s names ConnectApp", (_name, html) => {
    expect(html).toContain("ConnectApp");
  });
});

describe("the link goes to a name a church recognises", () => {
  /*
   * The one message asking somebody to trust us must not read
   * `<project>.supabase.co`, which is the shape a phishing mail takes. The
   * send hook builds every link on our own site; this is what keeps a later
   * change from quietly handing the job back to Supabase.
   */
  it.each(everything)("%s carries no Supabase host", (_name, html) => {
    expect(html).not.toContain("supabase.co");
    expect(html).not.toContain("supabase.in");
  });

  it.each(auth)("%s points its button at our own site", (_name, html) => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith(HOME) || href.startsWith("mailto:")).toBe(true);
    }
  });
});

describe("the voice is the one the writing guide describes", () => {
  const subjects = (
    ["signup", "recovery", "magiclink", "teaminvite", "email_change"] as const
  ).map((action) => [action, authMessage(action, LINK).subject] as const);

  it.each(subjects)("%s has a subject under fifty characters", (_action, subject) => {
    expect(subject.length).toBeLessThanOrEqual(50);
  });

  it.each(subjects)("%s does not suffix the product name", (_action, subject) => {
    /* Seven of the nine carried no suffix, so the two that did were the odd
       ones out rather than the convention. */
    expect(subject).not.toContain("| ConnectApp");
  });

  it.each(subjects)("%s uses no em dash or en dash", (_action, subject) => {
    expect(subject).not.toMatch(/[–—]/);
  });

  /*
   * "No exclamation marks except in a genuine welcome" (docs/ux-writing.md).
   * A verification, a password reset and an approval are not welcomes.
   */
  it.each(auth)("%s carries no exclamation mark", (_name, html) => {
    expect(html).not.toContain("!");
  });

  it("allows the welcome exactly one", () => {
    const [, hello] = own[0];
    expect((hello.html.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe("changing an email address has words of its own", () => {
  /*
   * `email_change` fell through to the signup branch, so somebody who had been
   * running their church for a month and changed their address was thanked for
   * signing up and asked to confirm so they could start setting up their
   * church.
   */
  it("does not thank them for signing up", () => {
    const message = authMessage("email_change", LINK);
    expect(message.html).not.toContain("signing up");
    expect(message.subject).not.toBe(authMessage("signup", LINK).subject);
  });

  it("says what confirming will do", () => {
    expect(authMessage("email_change", LINK).html).toContain("sign in to ConnectApp with it");
  });

  it("carries the same words in the plain text alternative", () => {
    const message = authMessage("email_change", LINK);
    expect(message.text).toContain("Confirm your new email address");
    expect(message.text).toContain(LINK);
  });
});
