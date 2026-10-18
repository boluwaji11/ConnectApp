"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import {
  Button, Dialog, DialogTrigger, DialogContent, DialogClose, DialogFooter, cn,
} from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { clearSectionMemory } from "./shell/section-memory";
import { forgetThisChurch } from "@/app/(app)/checkin/offline/store";

/**
 * Signing out, with a question first.
 *
 * On a shared church computer this is the press that ends somebody else's
 * afternoon of data entry, and it sits next to the name members aim for. The
 * form posts rather than calling an action, so it still works without
 * JavaScript once the dialog is open.
 */
export function SignOutButton({
  label,
  compact,
  icon,
  className,
}: {
  label?: string;
  /** Where a bar wants it smaller than a form's button. */
  compact?: boolean;
  /**
   * The square in the collapsed rail, which carries the icon alone and takes
   * its name from the tooltip beside it.
   */
  icon?: boolean;
  className?: string;
}) {
  const text = label ?? t("action.signOut");
  // The form posts and the browser navigates, so the flag is set on submit
  // rather than read from a transition.
  const [going, setGoing] = React.useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* In the sidebar it is a quiet row rather than a second filled button
            under the person's own name. */}
        {icon ? (
          <button
            type="button"
            aria-label={text}
            className={cn(
              "grid size-9 cursor-pointer place-items-center rounded-lg text-shell-muted",
              "hover:bg-shell-line hover:text-shell-fg",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
              className,
            )}
          >
            <LogOut className="size-[18px]" aria-hidden />
          </button>
        ) : compact ? (
          <Button type="button" variant="ghost" className="h-9 justify-start px-2.5 text-fg-muted">
            <LogOut /> {text}
          </Button>
        ) : (
          <Button type="button" className={className}>
            <LogOut /> {text}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent alert title={t("signOut.confirmTitle")}>
        <p className="mb-5 text-[length:var(--d-text-body)] text-fg">
          {t("signOut.confirmBody")}
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" data-dismiss disabled={going}>{t("signOut.stay")}</Button>
          </DialogClose>
          <form
            action="/auth/sign-out"
            method="post"
            onSubmit={() => {
              setGoing(true);
              clearSectionMemory();
              /*
               * HRT-436, R8.20, R21.2. A check-in tablet is shared, and what
               * it holds is a church's whole roster with every child's name
               * and allergies in it. Signing out leaves none of that behind.
               *
               * Not awaited: the form is posting and the browser is already
               * navigating. The clearing is also done on the way back in,
               * where a snapshot belonging to another station is thrown away
               * rather than drawn, so a tab closed instead of signed out of
               * reaches the same place.
               *
               * Check-ins this station has not sent yet are kept. R8 is
               * safety-critical and an unsent event is a record of a child
               * being handed over.
               */
              void forgetThisChurch();
            }}
          >
            <Button type="submit" variant="danger" loading={going}>
              {going ? null : <LogOut />} {going ? t("common.signingOut") : text}
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
