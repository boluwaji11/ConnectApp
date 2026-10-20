import { t } from "@connectapp/i18n";
import { PROVISIONAL_PEOPLE } from "@connectapp/db/rules";
import { aside, button, line, pickOut, sentBy, shell, safe, HOME, SUPPORT } from "./brand";
import type { Message } from "./types";

/**
 * HRT-388, R1.1, R22.1. What a church hears from us, and when.
 *
 * Three messages carry a church from the form to a product it can use, and
 * each one is tied to a thing that actually happened rather than to a timer:
 *
 * 1. **Prove the address.** Supabase Auth sends this one, because it owns the
 *    token behind the link. Nothing here writes it: a second verification mail
 *    would either duplicate the first or sit beside a link that does nothing.
 * 2. **Welcome**, when the church is created, which is after the address is
 *    proved because a church cannot be created without signing in.
 * 3. **Approved**, when a person has read the church and opened it up.
 *
 * Each is sent once, by the event it belongs to. Where approval happens before
 * the welcome has gone, the welcome still goes: it is the message that says
 * what the product is, and the one after it says what changed.
 */

const CHURCH = "\u0000church\u0000";
const APP = "\u0000app\u0000";

/** The first name where we have one, and a plain hello where we do not. */
const greeting = (name: string | null): string =>
  name?.trim() ? t("mail.greeting", { name: name.trim() }) : t("mail.greetingPlain");

/**
 * HRT-388, R22.1. The welcome, sent when a church is created.
 *
 * It answers the question a church has at that moment: whether it can start
 * work. It can. A provisional church works for the person who created it, up
 * to the member cap, so this carries a button rather than asking them to wait.
 * What it cannot do yet is invite anybody, which is stated here rather than
 * left to be discovered on a screen.
 */
export function welcomeMessage(input: {
  to: string;
  firstName: string | null;
  church: string;
}): Omit<Message, "from"> {
  /*
   * Our own front door rather than the church's own address. A church made a
   * minute ago has no portal address yet, and a link that resolves nowhere is
   * worse in an inbox than a link one hop further from the dashboard. Signing
   * in there lands on the church they just made.
   */
  const dashboard = `${HOME}/dashboard`;

  const glad = t("mail.welcome.glad", { church: input.church });
  const opening = t("mail.welcome.opening");
  /* The review sentence is emphasised within its paragraph, so the catalogue
     holds that sentence and the surrounding paragraph as separate keys. */
  const review = t("mail.welcome.underReview");
  const checking = t("mail.welcome.checking", { underReview: CHURCH });
  const checkingPlain = t("mail.welcome.checking", { underReview: review });
  /* The cap can only ever be the one number, so it stays a single string. */
  const meanwhile = t("mail.welcome.meanwhile", { count: String(PROVISIONAL_PEOPLE) });
  const told = t("mail.welcome.told", { church: input.church });

  return {
    to: input.to,
    subject: t("mail.welcome.subject", { church: input.church }),
    /*
     * The plain text carries the address, because a reader with no markup has
     * nothing to press. The markup does not: a button is what somebody reads,
     * and a query string under it is what makes a message look machine-written.
     */
    text: [
      t("mail.welcome.headline"),
      "",
      greeting(input.firstName),
      "",
      glad,
      "",
      opening,
      "",
      checkingPlain,
      "",
      meanwhile,
      "",
      told,
      "",
      `${t("mail.welcome.button")}: ${dashboard}`,
      "",
      t("mail.welcome.sentBy", { app: t("app.name") }),
      t("mail.welcome.because", { church: input.church }),
    ].join("\n"),
    html: shell({
      headline: t("mail.welcome.headline"),
      body:
        line(greeting(input.firstName))
        + line(glad)
        + line(opening)
        + `<p style="margin:18px 0 0;font-size:16px;line-height:1.6">`
        + `${pickOut(checking, CHURCH, review)}</p>`
        + aside(meanwhile)
        + line(told)
        + button(t("mail.welcome.button"), dashboard),
      foot:
        sentBy(t("mail.welcome.sentBy", { app: APP }), APP)
        + `<br>${safe(t("mail.welcome.because", { church: input.church }))}`,
    }),
  };
}

/**
 * HRT-388, R1.1. The word that a person has read the church and opened it up.
 *
 * The cap, the invitations and the join link all turn on this moment, so the
 * message says what the church can do now that it could not do an hour ago
 * rather than congratulating it.
 */
export function approvedMessage(input: {
  to: string;
  firstName: string | null;
  church: string;
}): Omit<Message, "from"> {
  const dashboard = `${HOME}/dashboard`;

  /* "{church} has been approved" is the phrase picked out of the sentence,
     so the catalogue holds both and the emphasis goes in after escaping. */
  const approved = t("mail.approved.approved", { church: input.church });
  const opening = t("mail.approved.opening", { approved: CHURCH });
  const plain = t("mail.approved.opening", { approved });

  return {
    to: input.to,
    subject: t("mail.approved.subject", { church: input.church }),
    /* This one asks for a reply, so it says where a reply is read. */
    replyTo: SUPPORT,
    text: [
      t("mail.approved.headline", { church: input.church }),
      "",
      greeting(input.firstName),
      "",
      plain,
      "",
      t("mail.approved.what"),
      "",
      t("mail.approved.guide"),
      "",
      `${t("mail.approved.button")}: ${dashboard}`,
      "",
      t("mail.approved.sentBy", { app: t("app.name") }),
      t("mail.approved.help"),
    ].join("\n"),
    html: shell({
      headline: t("mail.approved.headline", { church: input.church }),
      body:
        line(greeting(input.firstName))
        + `<p style="margin:18px 0 0;font-size:16px;line-height:1.6">`
        + `${pickOut(opening, CHURCH, approved)}</p>`
        + line(t("mail.approved.what"))
        + aside(t("mail.approved.guide"))
        + button(t("mail.approved.button"), dashboard),
      foot:
        sentBy(t("mail.approved.sentBy", { app: APP }), APP)
        + `<br>${safe(t("mail.approved.help"))}`,
    }),
  };
}

/**
 * HRT-464, R1.1, R22.1. The word to whoever operates the platform that a
 * church is sitting in the queue.
 *
 * A church is provisional from the moment it is created: capped at the member
 * limit, no invitations, no join link. Nothing lifts that but a person opening
 * the portal and approving it, and until now nothing said a church was
 * waiting. The first a church heard back depended on somebody happening to
 * look.
 *
 * It goes to the operator rather than to the church, so it carries no
 * unsubscribe: it is not a mailing list, it is the platform telling its own
 * operator that work has arrived. It says what is held back while the church
 * waits, because that is what makes it worth opening now rather than later.
 */
export function newChurchMessage(input: {
  to: string;
  church: string;
  slug: string;
  who: string | null;
  email: string | null;
  place: string | null;
  portal: string;
}): Omit<Message, "from"> {
  const open = `${input.portal}/churches`;
  const who = input.who?.trim() || input.email || t("mail.greetingPlain");

  const lines = [
    t("mail.newChurch.opening", { church: input.church }),
    input.email ? t("mail.newChurch.who", { who, email: input.email }) : null,
    input.place ? t("mail.newChurch.where", { place: input.place, slug: input.slug }) : null,
    t("mail.newChurch.held", { count: String(PROVISIONAL_PEOPLE) }),
  ].filter((one): one is string => one !== null);

  return {
    to: input.to,
    subject: t("mail.newChurch.subject", { church: input.church }),
    replyTo: SUPPORT,
    text: [...lines, "", `${t("mail.newChurch.button")}: ${open}`].join("\n"),
    html: shell({
      headline: t("mail.newChurch.headline"),
      body: lines.map((one, at) => (at === lines.length - 1 ? aside(one) : line(one))).join("")
        + button(t("mail.newChurch.button"), open),
      foot: safe(t("mail.newChurch.because")),
    }),
  };
}
