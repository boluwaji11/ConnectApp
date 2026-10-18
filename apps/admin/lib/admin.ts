import { cache } from "react";
import { redirect } from "next/navigation";
import { platform } from "@connectapp/db";
import { supabaseServer } from "@/lib/supabase/server";
import { standing } from "@/lib/two-step";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

/**
 * R21.x. Who is at the keyboard, and whether they may be here at all.
 *
 * Two gates rather than one: Supabase says the session is real, and
 * platform_admins says this account operates the platform. A church's owner
 * has the first and not the second, so signing in with an ordinary account
 * lands on the door rather than on the churches.
 *
 * HRT-393, R24.11. Held for the length of one request. The portal's layout
 * asks, and then the screen inside it asks again for the id it reads with;
 * without this that is two sessions resolved and two queries to answer one
 * question. `cache` is per request and per render, so nothing is held between
 * one team member's request and the next.
 */
export const teamMember = cache(async (): Promise<TeamMember | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const admin = await platform.platformAdmin(user.id);
  if (!admin) return null;

  return { id: admin.id, name: admin.name, email: user.email ?? "" };
});

/**
 * The same check, for a page that cannot render without one.
 *
 * HRT-439, R1.8, R21.4. And a third gate: a second factor, required with no
 * grace period. This is the one account in the product that reaches every
 * church's records, there are nine of them rather than nine hundred churches,
 * and there is no sign-up funnel to protect. An operator who has not set it
 * up gets the setup screen and nothing else; one who has gets the code
 * screen.
 *
 * Checked here rather than in the layout, because a server action is a way in
 * that no layout renders for.
 */
export async function requireTeamMember(): Promise<TeamMember> {
  const who = await teamMember();
  if (!who) redirect("/sign-in");

  const two = await standing(who.id);
  if (!two.enrolled) redirect("/two-step/set-up");
  if (!two.presented) redirect("/two-step");

  return who;
}

/**
 * Who is at the keyboard, without the second-factor gate.
 *
 * For the two screens that exist to get past that gate, which cannot use the
 * check they are the answer to.
 */
export async function teamMemberBeforeTwoStep(): Promise<TeamMember> {
  const who = await teamMember();
  if (!who) redirect("/sign-in");
  return who;
}
