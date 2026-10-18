/**
 * R8.7 to R8.9. Whether a child may go, decided with no database behind it.
 *
 * The questions are asked in this order on purpose. A restriction is checked
 * before the code, because a person a court order names should be stopped
 * whether or not they are holding the right label, and the volunteer should
 * have that conversation once.
 *
 * It is pure so that a station with no network reaches the same answer as the
 * server does, rather than a weaker one.
 */

/**
 * SEC-013. Why a release was stopped, which is also the decision a volunteer
 * has to record to get past it.
 *
 * `unnamed` is the fourth. The three before it all describe a named person who
 * failed a check; this one is nobody having been named at all, for a child
 * whose records say who collects them.
 */
export type OverrideKind = "code" | "pickup" | "restriction" | "unnamed";

export interface ReleaseQuestion {
  /**
   * What the visit is. A child is released on a code. An adult wearing a name
   * badge is not somebody being collected, so there is no code to ask for and
   * none is demanded.
   */
  kind: "child" | "adult";
  /** The code on the visit, which is what was printed on the guardian's label. */
  expected: string | null;
  /** What was typed at the door. */
  typed: string;
  /** Who is collecting, where the church holds a record of them. */
  collectedBy: string | null;
  /** R8.9. People a do-not-contact order names against this child. */
  restricted: string[];
  /** R8.8. Who the church has recorded as allowed to collect. */
  allowed: string[];
  /** A decision somebody made instead of an answer. */
  override: { kind: OverrideKind } | null;
}

/** What stops this release, or null when nothing does. */
export function releaseBlock(q: ReleaseQuestion): OverrideKind | null {
  if (q.collectedBy) {
    if (q.restricted.includes(q.collectedBy) && q.override?.kind !== "restriction") {
      return "restriction";
    }
    if (!q.allowed.includes(q.collectedBy) && q.override?.kind !== "pickup") {
      return "pickup";
    }
  } else if (q.kind !== "adult" && (q.restricted.length > 0 || q.allowed.length > 0)) {
    /*
     * SEC-013, R8.8, R8.9. Neither list can be applied to somebody who has not
     * been named, so the answer is to name them.
     *
     * Both checks above sat inside `if (q.collectedBy)`, and the checkout
     * dialog opens with nobody selected and offers "someone else", which maps
     * to null. So the ordinary path through the screen released a child on the
     * code alone: the authorised pickup list was never consulted, a do-not-
     * contact order was never consulted, and because no override was involved
     * no row was written and no reason was asked for. A person a court order
     * names was released by that path provided they did not volunteer who they
     * were.
     *
     * Only where the church has actually recorded something. A church that has
     * filled in no pickup lists is not asked to justify every release, which
     * is what made "someone else" the habit in the first place. Once a child
     * has a list or a restriction, releasing them to an unnamed adult becomes
     * a decision somebody records rather than a default.
     */
    if (q.override?.kind !== "unnamed") return "unnamed";
  }

  if (q.kind === "adult") return null;

  // A child is released on the code, and a child whose visit carries none is
  // refused until somebody decides otherwise. Silence is not a match.
  const matches = q.expected !== null && q.typed === q.expected;
  if (!matches && q.override?.kind !== "code") return "code";

  return null;
}
