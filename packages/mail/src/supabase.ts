import { t } from "@connectapp/i18n";
import { button, line, safe, sentBy, shell } from "./brand";

/**
 * HRT-391, R1.7, R16.4. The three messages Supabase Auth sends, in our brand.
 *
 * Confirming an address, resetting a password and signing in by link are sent
 * by Supabase rather than by this product, because Supabase owns the token in
 * the link. What it does not own is how the message looks, and its default is
 * a line of unstyled text that arrives between an invitation and a welcome
 * drawn like a product.
 *
 * The markup is therefore written here, from the same shell as the rest, and
 * pasted into the project's email templates. The only part that is not ours is
 * the link: `{{ .ConfirmationURL }}` is Supabase's own placeholder and has to
 * reach the template untouched, which is why it is not escaped.
 */

/**
 * Supabase's own placeholder, for the copy that goes in its dashboard.
 *
 * The hook below is given a real address instead. The same markup serves
 * both, so the message a church reads cannot depend on which route sent it.
 */
export const SUPABASE_LINK = "{{ .ConfirmationURL }}";

function message(input: {
  headline: string;
  /** What the message says, a paragraph at a time. */
  says: string[];
  press: string;
  ignore: string;
  /** Where the button goes. */
  link: string;
}): string {
  const APP = "\u0000app\u0000";
  return shell({
    headline: input.headline,
    body: input.says.map(line).join("") + button(input.press, input.link),
    foot: sentBy(t("mail.sentBy", { app: APP }), APP) + `<br>${safe(input.ignore)}`,
  });
}

/** "Confirm signup", which is the first thing anybody gets from us. */
export const verifyMarkup = (link: string = SUPABASE_LINK): string =>
  message({
    link,
    headline: t("mail.verify.headline"),
    says: [t("mail.verify.thanks"), t("mail.verify.opening")],
    press: t("mail.verify.button"),
    ignore: t("mail.verify.ignore"),
  });

/**
 * "Change email address".
 *
 * Its own words rather than the signup's. Supabase calls this
 * `email_change` and it used to fall through to the branch below, so
 * somebody who had been running their church for a month and changed their
 * address was told "Thanks for signing up" and asked to confirm so they
 * could "get started setting up your church".
 */
export const emailChangeMarkup = (link: string = SUPABASE_LINK): string =>
  message({
    link,
    headline: t("mail.emailChange.headline"),
    says: [t("mail.emailChange.opening")],
    press: t("mail.emailChange.button"),
    ignore: t("mail.emailChange.ignore"),
  });

/** "Reset password". */
export const resetMarkup = (link: string = SUPABASE_LINK): string =>
  message({
    link,
    headline: t("mail.reset.headline"),
    says: [t("mail.reset.opening")],
    press: t("mail.reset.button"),
    ignore: t("mail.reset.ignore"),
  });

/** HRT-401. An invitation onto the platform team, which is a magic link with
    the words somebody expecting an invitation needs. */
export const teamInviteMarkup = (link: string = SUPABASE_LINK): string =>
  message({
    link,
    headline: t("mail.teamInvite.headline"),
    says: [t("mail.teamInvite.opening")],
    press: t("mail.teamInvite.button"),
    ignore: t("mail.teamInvite.ignore"),
  });

/** "Magic link". */
export const magicMarkup = (link: string = SUPABASE_LINK): string =>
  message({
    link,
    headline: t("mail.magic.headline"),
    says: [t("mail.magic.opening")],
    press: t("mail.magic.button"),
    ignore: t("mail.magic.ignore"),
  });


/**
 * HRT-392. The same three, whole, for the hook that sends them itself.
 *
 * The markup above is what goes in Supabase's dashboard; this is what goes
 * out through Resend when the hook is on. One wording, one drawing, two ways
 * of reaching an inbox.
 */
export function authMessage(
  action: "signup" | "email_change" | "recovery" | "magiclink" | "teaminvite",
  link: string,
): { subject: string; text: string; html: string } {
  const plain = (headline: string, says: string[], press: string, ignore: string) =>
    [headline, "", ...says, "", `${press}: ${link}`, "", ignore].join("\n");

  if (action === "recovery") {
    return {
      subject: t("mail.reset.subject"),
      text: plain(
        t("mail.reset.headline"),
        [t("mail.reset.opening")],
        t("mail.reset.button"),
        t("mail.reset.ignore"),
      ),
      html: resetMarkup(link),
    };
  }

  if (action === "email_change") {
    return {
      subject: t("mail.emailChange.subject"),
      text: plain(
        t("mail.emailChange.headline"),
        [t("mail.emailChange.opening")],
        t("mail.emailChange.button"),
        t("mail.emailChange.ignore"),
      ),
      html: emailChangeMarkup(link),
    };
  }

  if (action === "teaminvite") {
    return {
      subject: t("mail.teamInvite.subject"),
      text: plain(
        t("mail.teamInvite.headline"),
        [t("mail.teamInvite.opening")],
        t("mail.teamInvite.button"),
        t("mail.teamInvite.ignore"),
      ),
      html: teamInviteMarkup(link),
    };
  }

  if (action === "magiclink") {
    return {
      subject: t("mail.magic.subject"),
      text: plain(
        t("mail.magic.headline"),
        [t("mail.magic.opening")],
        t("mail.magic.button"),
        t("mail.magic.ignore"),
      ),
      html: magicMarkup(link),
    };
  }

  return {
    subject: t("mail.verify.subject"),
    text: plain(
      t("mail.verify.headline"),
      [t("mail.verify.thanks"), t("mail.verify.opening")],
      t("mail.verify.button"),
      t("mail.verify.ignore"),
    ),
    html: verifyMarkup(link),
  };
}
