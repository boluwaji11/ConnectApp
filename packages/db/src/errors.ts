import { t, type MessageKey, type Params } from "@connectapp/i18n";

/**
 * Errors that are outcomes, not faults.
 *
 * A duplicate name and a missing choice are things a person did, and the right
 * response is a sentence next to the field. Everything else is a bug, and a bug
 * reported as a validation message is a bug nobody ever finds. Only these
 * types are turned into user-facing text; anything else is rethrown.
 *
 * Each carries the catalogue key and its values rather than a finished sentence,
 * so the layer that knows the reader's language does the rendering. `message`
 * stays readable in English for logs and stack traces, which are read by us.
 */

export interface UserFacingError {
  readonly key: MessageKey;
  readonly params?: Params;
}

/** The input cannot be accepted, and the message says why in plain words. */
export class InvalidInputError extends Error implements UserFacingError {
  readonly key: MessageKey;
  readonly params: Params | undefined;
  constructor(key: MessageKey, params?: Params) {
    super(t(key, params));
    this.name = "InvalidInputError";
    this.key = key;
    this.params = params;
  }
}

/** A name would collide with something that already exists. */
export class NameTakenError extends Error implements UserFacingError {
  readonly key: MessageKey;
  readonly params: Params;
  readonly existingId: string;
  constructor(key: MessageKey, name: string, existingId: string) {
    super(t(key, { name }));
    this.name = "NameTakenError";
    this.key = key;
    this.params = { name };
    this.existingId = existingId;
  }
}

/**
 * HRT-432. Whether a failed write collided with a named unique constraint.
 *
 * The four callers of this used to match on `error.message`, which held the
 * constraint's name because that is what postgres.js put there. drizzle 0.45
 * wraps a driver error in one of its own and the message becomes "Failed
 * query: insert into ...", so every one of those checks silently stopped
 * matching: a duplicate name went from a sentence the form could show to an
 * unhandled error and a 500.
 *
 * So it reads the driver's own fields instead, down the `cause` chain, which
 * is where the information actually is and is not a string anybody formats.
 * `23505` is unique_violation.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let at: unknown = error, depth = 0; at && depth < 5; depth += 1) {
    const one = at as { code?: unknown; constraint_name?: unknown; message?: unknown; cause?: unknown };
    if (one.code === "23505" && one.constraint_name === constraint) return true;
    /* Older drivers, and anything that only ever had the sentence. */
    if (typeof one.message === "string" && one.message.includes(constraint)) return true;
    at = one.cause;
  }
  return false;
}
