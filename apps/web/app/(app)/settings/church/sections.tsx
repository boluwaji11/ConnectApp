"use client";

import * as React from "react";
import type { Campus } from "@connectapp/db";
import { ChurchForm, type ChurchValues } from "../church-form";
import { Places } from "./places";

/**
 * R1.1. The church profile, which reads until somebody asks to change it.
 *
 * One pencil, on Details, puts every section on this page into editing at once.
 * A church correcting its address is usually correcting its campus name in the
 * same minute, and two pencils on one screen is two decisions about the same
 * thing.
 */
export function ChurchSections({
  values,
  campus,
  canEdit,
  logo,
  heading,
}: {
  values: ChurchValues;
  campus: Campus | null;
  canEdit: boolean;
  logo: React.ReactNode;
  /** The page's title, so the buttons that commit this form can sit beside it. */
  heading: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(false);

  return (
    <>
      {heading}

      {/* R24.6. The church's own details, and where it meets, on one line.
          The second is four words and a name, and a card of its own across the
          full width left a band of nothing beside it. One column on a phone. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(240px,1fr)]">
        <ChurchForm
          values={values}
          campus={campus}
          canEdit={canEdit}
          logo={logo}
          editing={editing}
          onEditing={setEditing}
        />

        <Places campus={campus} canEdit={canEdit} editing={editing} />
      </div>

    </>
  );
}
