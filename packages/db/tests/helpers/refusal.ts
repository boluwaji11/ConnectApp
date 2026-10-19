/**
 * HRT-432. What the database said, out from under the wrapper drizzle puts on it.
 *
 * These assertions check that Postgres refused a write for the right reason:
 * row-level security, or a missing privilege. The reason matters. A test that
 * only checks "this threw" passes just as happily when the write fails on a
 * typo, and the whole point of the isolation suite is that the refusal came
 * from the tenant boundary.
 *
 * Up to drizzle 0.38 the thrown error carried the driver's own sentence, so
 * matching on the message worked. 0.45 wraps it in a `DrizzleQueryError` whose
 * message is "Failed query: insert into ..." and keeps the real one on `cause`.
 * Loosening the assertion to match the wrapper would have turned three tenant
 * isolation tests into tests of nothing, which is the one change this suite
 * must never accept.
 *
 * So the cause chain is walked and the driver's message is what gets asserted.
 */
export function refusal(error: unknown): string {
  const seen: string[] = [];
  for (let at: unknown = error, depth = 0; at && depth < 5; depth += 1) {
    const one = at as { message?: unknown; code?: unknown; cause?: unknown };
    if (typeof one.message === "string") seen.push(one.message);
    at = one.cause;
  }
  return seen.join(" | ");
}

/**
 * Runs the write and hands back why the database refused it.
 *
 * Fails loudly when it was not refused at all, because a write that succeeded
 * is the finding, and `expect(refusal(...))` on an empty string would read as
 * an ordinary mismatch.
 */
export async function whyRefused(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return refusal(error);
  }
  throw new Error("The database allowed this. It was supposed to refuse it.");
}
