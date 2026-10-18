import "server-only";
import { currentUser } from "./session";
import { twoStepFor } from "@connectapp/db";

/**
 * R1.8, R21.4. A fresh factor, for the things that cannot be undone from here.
 *
 * Signing in with a second factor says this is the right person. It says
 * nothing about whether that person is still at the keyboard an hour later,
 * which is the whole of the risk on a shared church laptop: the session is
 * real, the person who opened it has gone to a meeting, and what is reachable
 * is a refund, a bank account, somebody's role, or every record the church
 * holds in one file.
 *
 * So a short list of actions asks for the code again, and nothing else does.
 * The list is in `docs/security/mfa-readiness.md` and it is deliberately
 * short: a product that asks for a code on every press is a product where
 * people keep their authenticator open beside them all day, which is worse
 * than not asking.
 *
 * How it is answered costs nothing. `amr` on the access token carries the
 * second the factor was presented, the token is already verified in
 * `currentUser`, and presenting a code again moves that timestamp. No round
 * trip, nothing held here, nothing to get out of step.
 */

/**
 * How long a presented factor stays fresh.
 *
 * Five minutes is long enough to do the thing somebody came to do, including
 * a refund that needs the amount checked first, and short enough that an
 * abandoned laptop is not a way into any of it.
 */
export const FRESH_FOR_SECONDS = 5 * 60;

/** What the screen has to ask for before the action can be tried again. */
export type StepUp =
  /** They hold a factor and have not presented it lately. */
  | "code"
  /** They hold no factor at all, so there is nothing to present. */
  | "enrol";

/**
 * Whether this session may do something on the list.
 *
 * `{ fresh: true }` or what the screen must ask for. It never throws and never
 * redirects: the actions on this list are pressed from a dialog or a panel,
 * and a redirect out of a server action would lose whatever was typed into it.
 */
export async function freshFactor(): Promise<{ fresh: true } | { fresh: false; need: StepUp }> {
  const user = await currentUser();
  if (!user) return { fresh: false, need: "enrol" };

  if (user.factorAt !== null) {
    const age = Math.floor(Date.now() / 1000) - user.factorAt;
    /*
     * A timestamp in the future is a clock disagreeing, not a fresh factor.
     * Treated as stale, because the refusing direction costs one code and the
     * permitting direction costs whatever the action does.
     */
    if (age >= 0 && age <= FRESH_FOR_SECONDS) return { fresh: true };
    return { fresh: false, need: "code" };
  }

  /*
   * No second factor on this session. Whether they can present one is a
   * question about the account rather than the token, so the mirror answers
   * it: enrolled means the code screen, not enrolled means setting one up.
   *
   * Anybody who can reach one of these actions is required to have two-step
   * under HRT-438, so "enrol" is the answer for an account made before that
   * rule and for nobody else.
   */
  const { enrolledAt } = await twoStepFor(user.id);
  return { fresh: false, need: enrolledAt ? "code" : "enrol" };
}

/**
 * The shape every guarded action adds to what it already returns.
 *
 * A separate field rather than an error string, because this is not a failure
 * and the screen does something different with it: it asks for a code and
 * tries again, with what the person typed still on screen.
 */
export interface MayNeedStepUp {
  stepUp?: StepUp;
}

/**
 * The guard, written the way every one of these actions wants to use it.
 *
 * ```
 * const stop = await stepUpNeeded();
 * if (stop) return stop;
 * ```
 *
 * Null when the session is fresh. Put it above the work, never below it: the
 * point of this is that the money has not moved yet.
 */
export async function stepUpNeeded(): Promise<MayNeedStepUp | null> {
  const answer = await freshFactor();
  return answer.fresh ? null : { stepUp: answer.need };
}
