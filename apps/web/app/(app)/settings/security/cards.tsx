"use client";

import * as React from "react";
import { Security } from "./security";
import { TwoStep } from "./two-step";
import type { RelyingParty } from "@/lib/passkey-client";

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
  passkey,
  passkeyHeld,
}: {
  email: string;
  enrolled: boolean;
  codesLeft: number;
  passkey: RelyingParty | null;
  passkeyHeld: boolean;
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
        passkey={passkey}
        passkeyHeld={passkeyHeld}
        open={open === "twoStep"}
        onOpen={(to) => setOpen(to ? "twoStep" : null)}
      />
    </div>
  );
}
