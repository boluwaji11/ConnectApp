"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { platform, platformHealth } from "@connectapp/db";
import { approvedMessage, sendAsPlatform } from "@connectapp/mail";
import { supabaseServer } from "@/lib/supabase/server";
import { requireTeamMember } from "@/lib/admin";
import { factorIsFresh, presentCode } from "@/lib/two-step";

export interface Done {
  error?: string;
  /**
   * HRT-442, R1.8, R21.4. The code is wanted again before this one runs.
   *
   * Only ever "code" here. The portal refuses an operator who has not set
   * two-step up at all, with no grace period, so there is no state in which
   * somebody reaches one of these without a factor to present.
   */
  stepUp?: "code";
}

/**
 * HRT-442, R1.8, R21.4. The guard on the presses that reach every church.
 *
 * The portal already requires a second factor to get in. This is the other
 * question: whether the operator who presented it is still the one at the
 * keyboard, two minutes later rather than fifty.
 */
async function stillYou(): Promise<Done | null> {
  return (await factorIsFresh()) ? null : { stepUp: "code" };
}

const say = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";

/**
 * HRT-396, R21.1. Where the request came from.
 *
 * Vercel sets x-forwarded-for and the left-most entry is the client. It is
 * written down rather than trusted: nothing is decided from it, it is only
 * there so a burst of attempts reads as a burst when somebody looks.
 */
async function from(): Promise<{ ip: string | null; agent: string | null }> {
  const head = await headers();
  const forwarded = head.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? head.get("x-real-ip"),
    agent: head.get("user-agent"),
  };
}

/**
 * HRT-396, R21.x. Signing in to the portal.
 *
 * Three gates. The address has to not be waiting out a lockout, Supabase has
 * to accept the password, and `platform_admins` has to say this account
 * operates the platform. Every attempt is written down, including the ones
 * that fail: this portal reaches every church on the platform, so who has
 * tried the door is worth as much as who got in.
 *
 * The refusals are all the same sentence on purpose. Telling somebody that the
 * password was right but the account is not a team member tells them they have
 * found a real address and that the only thing left to get is a grant.
 */
export async function signIn(_state: Done, data: FormData): Promise<Done> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const password = String(data.get("password") ?? "");
  if (!email || !password) return { error: "Enter an email address and a password." };

  const where = await from();

  const waiting = await platformHealth.waitingOut(email);
  if (waiting > 0) {
    await platformHealth.recordSignIn({ email, outcome: "throttled", ...where });
    return {
      error: `Too many attempts. Try again in ${waiting} minutes.`,
    };
  }

  const refused = "That email address and password don't match a team member's account.";

  const supabase = await supabaseServer();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) {
    await platformHealth.recordSignIn({ email, outcome: "wrong", ...where });
    return { error: refused };
  }

  const admin = await platform.platformAdmin(result.data.user.id);
  if (!admin) {
    /*
     * A real account with a real password that is not a team member. The session
     * is thrown away rather than left behind, because this app's middleware
     * would otherwise treat it as signed in and bounce them round a loop.
     */
    await supabase.auth.signOut();
    await platformHealth.recordSignIn({ email, outcome: "refused", ...where });
    return { error: refused };
  }

  await platformHealth.recordSignIn({ email, outcome: "in", ...where });
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

/** R1.1. A human has looked at this church. */
export async function approveChurch(data: FormData): Promise<Done> {
  const who = await requireTeamMember();
  const id = String(data.get("id"));

  let approvedNow = false;
  try {
    approvedNow = await platform.approve(who.id, id, String(data.get("note") ?? ""));
    revalidatePath("/churches");
  } catch (error) {
    return { error: say(error) };
  }

  /*
   * HRT-388, R1.1, R22.1. The church is told, by the thing that happened.
   *
   * After the write rather than inside it, and outside the try above, because
   * the church is approved either way: a team member who pressed Approve and
   * saw a mail provider's refusal would reasonably press it again.
   *
   * Only on the press that actually approved it. A second press on a church
   * that is already approved sent the owner a second "your church is approved"
   * email, which `approve` now reports so this can skip it.
   */
  if (approvedNow) await tellThemApproved(id);
  return {};
}

/**
 * HRT-388, R1.1. The word to whoever founded the church.
 *
 * The owner's address is what the platform screens already read for this
 * church, so nothing new is looked up. A church with no owner address is a
 * church nobody can be told about, which is quiet rather than a failure.
 */
async function tellThemApproved(id: string): Promise<void> {
  try {
    const who = await requireTeamMember();
    const found = await platform.church(who.id, id);
    if (!found?.ownerEmail) return;

    const sent = await sendAsPlatform(
      approvedMessage({
        to: found.ownerEmail,
        /* The owner's name is held whole, and the greeting wants the first of it. */
        firstName: found.ownerName?.trim().split(/\s+/)[0] ?? null,
        church: found.name,
      }),
    );
    if (!sent.ok && sent.connected) console.error("[approved] not sent", sent.said);
  } catch (error) {
    console.error("[approved] not sent", error);
  }
}

export async function unapproveChurch(data: FormData): Promise<Done> {
  const who = await requireTeamMember();
  try {
    await platform.unapprove(who.id, String(data.get("id")), String(data.get("note") ?? ""));
    revalidatePath("/churches");
    return {};
  } catch (error) {
    return { error: say(error) };
  }
}

/** R21.x. Out of service, with every record it holds kept. */
export async function archiveChurch(data: FormData): Promise<Done> {
  const who = await requireTeamMember();
  try {
    await platform.archive(who.id, String(data.get("id")), String(data.get("note") ?? ""));
    revalidatePath("/churches");
    return {};
  } catch (error) {
    return { error: say(error) };
  }
}

export async function restoreChurch(data: FormData): Promise<Done> {
  const who = await requireTeamMember();
  try {
    await platform.restore(who.id, String(data.get("id")), String(data.get("note") ?? ""));
    revalidatePath("/churches");
    return {};
  } catch (error) {
    return { error: say(error) };
  }
}

export async function revokeAdmin(userId: string): Promise<Done> {
  const who = await requireTeamMember();

  /* R1.8, R21.4. Taking the portal off somebody, or putting it on them, is cross-church reach changing hands. */
  const stop = await stillYou();
  if (stop) return stop;
  try {
    await platform.revoke(who.id, userId);
    revalidatePath("/team");
    return {};
  } catch (error) {
    return { error: say(error) };
  }
}

/**
 * HRT-401, R21.x. Asking somebody onto the team who has no account yet.
 *
 * One email and one press. The invitation row is written first, then Supabase
 * is asked to send a sign-in link to that address with our `/join` as the
 * place it lands. Supabase owns the token in that link and will not hand it to
 * anything without the service role key, which never appears in a request
 * path; its send hook draws the message in our brand on the way out.
 *
 * So there is one message rather than two, and the person is signed in and on
 * the team by the time they have pressed it once.
 */
export async function inviteTeamMember(data: FormData): Promise<Done> {
  const who = await requireTeamMember();

  /* R1.8, R21.4. An invitation to the portal is an invitation to every church's records. */
  const stop = await stillYou();
  if (stop) return stop;
  const email = String(data.get("email") ?? "");
  const name = String(data.get("name") ?? "");

  try {
    const asked = await platform.inviteTeamMember(who.id, email, name);

    const head = await headers();
    const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:4489";
    const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const link = `${proto}://${host}/join?t=${asked.token}`;

    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithOtp({
      email: asked.email,
      options: { shouldCreateUser: true, emailRedirectTo: link },
    });

    if (error) {
      /* The row would otherwise sit there promising a link nobody has. */
      const waiting = await platform.teamInvites(who.id);
      const mine = waiting.find((one) => one.email === asked.email);
      if (mine) await platform.revokeInvite(who.id, mine.id);
      return { error: `The invitation could not be sent: ${error.message}` };
    }

    revalidatePath("/team");
    return {};
  } catch (error) {
    return { error: say(error) };
  }
}

/** R21.x. Withdraws an invitation before it has been opened. */
export async function withdrawInvite(id: string): Promise<Done> {
  const who = await requireTeamMember();
  try {
    await platform.revokeInvite(who.id, id);
    revalidatePath("/team");
    return {};
  } catch (error) {
    return { error: say(error) };
  }
}

/**
 * R1.8, R21.4. Finding an account that cannot get past its own second factor.
 *
 * Looked up by the address somebody locked out can give over the phone. It
 * answers the same way for an address with no account, so this is not a way
 * to find out who holds one.
 */
export async function findTwoStep(
  data: FormData,
): Promise<Done & { found?: platform.TwoStepLookup | null }> {
  const who = await requireTeamMember();
  try {
    const found = await platform.twoStepFor(who.id, String(data.get("email") ?? ""));
    return { found };
  } catch (error) {
    return { error: say(error) };
  }
}

/**
 * R1.8, R21.4. Turning an account's second factor off, as the last resort.
 *
 * It lets nobody in. It puts the account back to a password and asks them to
 * set two-step up again, and it writes a row naming the address and the
 * reason into the log no application role can edit.
 */
export async function clearTwoStep(userId: string, reason: string): Promise<Done> {
  const who = await requireTeamMember();

  /* R1.8, R21.4. Taking an account's second factor off is the one press here that weakens somebody else's security. */
  const stop = await stillYou();
  if (stop) return stop;
  try {
    await platform.clearTwoStep(who.id, userId, reason);
    revalidatePath("/security");
    return {};
  } catch (error) {
    return { error: say(error) };
  }
}


/**
 * HRT-442, R1.8, R21.4. The code again, in front of a press that reaches
 * every church.
 *
 * The same challenge the door makes, against the same factor, read from
 * Supabase rather than taken from the form. What it changes is the `amr`
 * timestamp on the token, which is what `factorIsFresh` reads, so the press
 * behind the box can simply be repeated.
 */
export async function proveItIsStillYou(data: FormData): Promise<Done> {
  await requireTeamMember();
  const result = await presentCode(String(data.get("code") ?? ""));
  return result.error ? { error: result.error } : {};
}
