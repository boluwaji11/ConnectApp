import { t } from "@connectapp/i18n";
import type { MessageKey } from "@connectapp/i18n";

/**
 * R1.4. Leaving, from a screen that is not inside the product yet.
 *
 * A form rather than a link, because `/auth/sign-out` answers POST only: a
 * link to it is an HTTP 405 and a press that does nothing. The confirmation
 * the product's own sign-out asks for is left out here on purpose, since
 * these screens hold nothing anybody can lose.
 */
export function SignOutLink({ label }: { label: MessageKey }) {
  return (
    <form action="/auth/sign-out" method="post" className="inline">
      <button type="submit" className="font-medium text-primary underline-offset-4 hover:underline">
        {t(label)}
      </button>
    </form>
  );
}
