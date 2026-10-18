import * as React from "react";
import { whereWeAre } from "@connectapp/env";
import { Brand } from "@/components/brand";
import { EnvironmentBar } from "@/components/environment-bar";

/**
 * HRT-439. The same frame the portal's own door uses.
 *
 * Both screens here are the door: somebody signed in and not yet through it.
 * Drawing them inside the portal's shell would put the churches in the
 * navigation beside a screen that exists to stop them reaching the churches.
 */
export function Door({
  title,
  lede,
  children,
  foot,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  const here = whereWeAre();

  return (
    <main className="site-wash flex min-h-dvh flex-col">
      <EnvironmentBar environment={here.environment} productionData={here.productionData} />

      <div className="grid flex-1 place-items-center px-6 py-10">
        <div className="flex w-full max-w-[420px] flex-col gap-6">
          <div className="flex items-center justify-center gap-2.5">
            <Brand size="md" />
          </div>

          <div className="rounded-lg border border-line bg-surface p-[var(--d-pad-card)]">
            <h1 className="text-title font-semibold text-fg">{title}</h1>
            <p className="mt-1 mb-5 text-caption text-fg-muted">{lede}</p>
            {children}
          </div>

          {foot ? <div className="text-center text-caption text-fg-muted">{foot}</div> : null}
        </div>
      </div>
    </main>
  );
}
