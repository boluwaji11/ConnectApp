"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Banner, IconButton, Working } from "@connectapp/ui";
import { t } from "@connectapp/i18n";
import { StepUpDialog } from "@/components/step-up";
import type { StepUp } from "@/lib/step-up";

/**
 * R19.8. One row of the export table, and the wait it puts on the screen.
 *
 * An archive of every person, household and attendance record takes a few
 * seconds to build, and a plain download link spends those seconds looking
 * broken. Fetching the file ourselves means the screen can say what is
 * happening and hand the file over when it arrives.
 */
export function DownloadRow({
  only,
  file,
}: {
  /** Which table, or nothing for the whole archive. */
  only?: string;
  /** The name the file is saved under. */
  file: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  /* R1.8, R21.4. The archive is every record the church holds, so the route
     asks for the code again and answers 428 until it has one. */
  const [need, setNeed] = React.useState<StepUp | null>(null);

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/export${only ? `?only=${only}` : ""}`,
      );
      if (response.status === 428) {
        const asked = (await response.json()) as { stepUp?: StepUp };
        setNeed(asked.stepUp ?? "code");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("settings.export.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Working open={busy} label={t("settings.export.building")} />

      <StepUpDialog
        need={need}
        onDone={() => {
          setNeed(null);
          void run();
        }}
        onCancel={() => setNeed(null)}
      />

      {error ? (
        <Banner tone="danger">{error}</Banner>
      ) : null}

      <IconButton
        label={t("settings.export.download")}
        variant="ghost"
        disabled={busy}
        onClick={() => void run()}
      >
        <Download />
      </IconButton>
    </>
  );
}
