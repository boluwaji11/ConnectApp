import { ShieldCheck, Check } from "lucide-react";
import { t, plural } from "@connectapp/i18n";

/**
 * R1.8, R24.6. What this account's sign-in looks like, in one block.
 *
 * The three cards beside it each hold one thing and are shut by default, so
 * without this the answer to "is my account actually protected" was three
 * presses away. It is a reading, not a control: every value here is changed
 * in the card that owns it.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0 last:pb-0 first:pt-0">
      <dt className="text-[13px] text-fg-muted">{label}</dt>
      <dd className="text-[15px] font-semibold break-words text-fg">{children}</dd>
    </div>
  );
}

export function SecurityOverview({
  email,
  twoStepOn,
  codesLeft,
}: {
  email: string;
  twoStepOn: boolean;
  codesLeft: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
        <h3 className="mb-3 text-[15px] font-bold text-fg">{t("security.overview")}</h3>
        <dl className="flex flex-col">
          <Row label={t("email.title")}>{email}</Row>
          <Row label={t("security.overview.password")}>
            {t("security.overview.passwordSet")}
          </Row>
          <Row label={t("security.overview.twoStep")}>
            {twoStepOn ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-[13px] font-semibold text-success-text">
                <Check aria-hidden className="size-3.5" />
                {t("security.overview.enabled")}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-sunken px-2.5 py-0.5 text-[13px] font-semibold text-fg-muted">
                {t("security.overview.notEnabled")}
              </span>
            )}
          </Row>
          <Row label={t("security.overview.codes")}>
            {codesLeft > 0
              ? plural("security.overview.codesLeft", codesLeft)
              : t("security.overview.noCodes")}
          </Row>
        </dl>
      </section>

      <div className="flex items-start gap-3 px-1">
        <ShieldCheck aria-hidden className="mt-0.5 size-[18px] shrink-0 text-primary" />
        <div className="flex flex-col gap-0.5">
          <p className="text-[14px] font-semibold text-fg">{t("security.note.title")}</p>
          <p className="text-[13px] leading-5 text-fg-muted">{t("security.note.body")}</p>
        </div>
      </div>
    </div>
  );
}
