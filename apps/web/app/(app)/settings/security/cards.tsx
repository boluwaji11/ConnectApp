"use client";

import * as React from "react";
import { Security } from "./security";
import { TwoStep } from "./two-step";

/**
 * R24.6. The three cards, as one accordion.
 *
 * Each card used to hold its own open state, so two could be open at once:
 * the password form and the two-step setup side by side, one of them scrolled
 * out of sight. Which one is open is decided here instead, and opening any of
 * them shuts whichever was.
 */
export function SecurityCards({
  email,
  enrolled,
  codesLeft,
}: {
  email: string;
  enrolled: boolean;
  codesLeft: number;
}) {
  const [open, setOpen] = React.useState<"email" | "password" | "twoStep" | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Security
        email={email}
        open={open === "email" || open === "password" ? open : null}
        onOpen={setOpen}
      />
      <TwoStep
        enrolled={enrolled}
        codesLeft={codesLeft}
        open={open === "twoStep"}
        onOpen={(to) => setOpen(to ? "twoStep" : null)}
      />
    </div>
  );
}
