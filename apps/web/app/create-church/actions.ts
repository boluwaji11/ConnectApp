"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createChurch } from "@connectapp/db";
import { explain } from "@/lib/explain";
import { currentUser, emailIsVerified } from "@/lib/session";
import { rememberChurch } from "@/lib/church-choice";
import { welcomeMessage, newChurchMessage, sendAsPlatform } from "@connectapp/mail";

export interface CreateResult {
  error?: string;
}

/**
 * Creates a church and makes the signed-in person its Owner.
 *
 * The user comes from the session, never from the form. A church's first Owner
 * is the strongest grant in the product, and a form field is not where that
 * decision gets made.
 */
export async function createChurchAccount(data: FormData): Promise<CreateResult> {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/create-church");

  const name = String(data.get("name") ?? "");
  const timezone = String(data.get("timezone") ?? "");
  const country = String(data.get("country") ?? "");
  const website = String(data.get("website") ?? "");
  /* R22.1. Unanswered stays unanswered: a radio nobody touched is not a no. */
  const asked = String(data.get("hasWebsite") ?? "");
  const hasWebsite = asked === "yes" ? true : asked === "no" ? false : null;

  let slug: string;
  try {
    const church = await createChurch({
      name,
      timezone,
      country,
      website,
      hasWebsite,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: await emailIsVerified(),
      },
    });
    slug = church.slug;
  } catch (error) {
    return { error: explain(error) };
  }

  /*
   * R1.4. The church they just founded is the one they are looking at.
   * Founding a second one would otherwise land on the chooser between them.
   */
  await rememberChurch(slug);

  /*
   * HRT-388, R22.1. The welcome, sent once, by the thing that happened.
   *
   * Here rather than on a timer or on verification: the address was proved
   * before this screen could be reached, and this is the moment there is a
   * church to welcome them to. It says what a provisional church can do, so
   * the cap is read here rather than met on a screen.
   *
   * Nothing waits on it. A church that is through the form is through the
   * form, and a provider having a bad minute is not a reason to hold somebody
   * on a spinner or to lose the church they just made.
   */
  if (user.email) {
    const sent = await sendAsPlatform(
      welcomeMessage({
        to: user.email,
        firstName: user.firstName,
        church: name.trim(),
      }),
    );
    if (!sent.ok && sent.connected) console.error("[welcome] not sent", sent.said);
  }

  /*
   * HRT-464, R1.1. Whoever operates the platform is told a church is waiting.
   *
   * A church is provisional until a person approves it, and nothing said one
   * had arrived: the first a church heard back depended on somebody happening
   * to open the portal. This is that somebody being told.
   *
   * After the response rather than before it. The church is through the form
   * and is not waiting on our mail; `after` runs once the redirect has been
   * sent, so a provider having a bad minute costs a notice and not a sign-up.
   */
  const notice = process.env["OPERATOR_NOTICE_EMAIL"];
  if (notice) {
    /* The portal's own address, which the redirect allow-list already holds. */
    const portal = process.env["PLATFORM_ADMIN_SITE"] ?? "https://admin.connectapp.church";
    after(async () => {
      const sent = await sendAsPlatform(
        newChurchMessage({
          to: notice,
          church: name.trim(),
          slug,
          who: user.fullName,
          email: user.email,
          place: country,
          portal,
        }),
      );
      if (!sent.ok && sent.connected) console.error("[new church] notice not sent", sent.said);
    });
  }

  /*
   * R22.1. Straight into the product, where the guide is already beside the
   * screen on its first step. Setting up used to be a page of its own, which
   * meant a church met a list of links before it had seen the product the
   * links go to.
   */
  redirect("/dashboard");
}
