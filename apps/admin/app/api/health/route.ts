import { bearerHolds } from "@connectapp/db";
import { NextResponse } from "next/server";
import { platformHealth } from "@connectapp/db";
import { environment } from "@connectapp/env";
import { probeEverything, within } from "@/lib/probes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/*
 * Every probe answers inside its own deadline, so this is the net under the
 * net. A route that can run until the platform kills it is a route whose
 * failures are invisible.
 */
export const maxDuration = 30;

/**
 * HRT-394, N3. The probes, on a clock.
 *
 * Opening the status screen runs them too, but a status screen only knows
 * about the minutes somebody was looking at it. A thing that fails at three in
 * the morning and recovers by eight leaves no trace unless something was
 * asking while nobody was. This is what asks.
 *
 * Called every fifteen minutes by .github/workflows/health.yml, for the same
 * reason the send queue's worker lives there: Vercel's Hobby plan runs a cron
 * once a day, and a service checked once a day is not a service being watched.
 *
 * Protected by CRON_SECRET. It writes rows and makes seven outbound API calls,
 * so it is not left unauthenticated.
 */
export async function GET(request: Request) {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const given = request.headers.get("authorization");
  if (!bearerHolds(given, secret)) {
    return NextResponse.json({ error: "No" }, { status: 401 });
  }

  const env = environment();
  const probes = await probeEverything();

  /*
   * Writing the readings down is a side effect, and a side effect must never
   * be the reason this route cannot answer. Keeping the record is worth less
   * than saying what the services just said, so the write gets a deadline of
   * its own and the answer goes out either way.
   *
   * This is not hypothetical. The first version awaited these writes with no
   * ceiling, the owner connection did not come back, and the route returned
   * nothing at all for five minutes: a health check that cannot report that
   * the database is unreachable because it is waiting on the database.
   */
  const recording = await within(8_000, platformHealth.watching().catch(() => false), false);

  const kept = await within(
    8_000,
    (async () => {
      await Promise.all(
        probes.map((one) =>
          platformHealth.recordCheck(
            { service: one.service, state: one.state, tookMs: one.tookMs, said: one.said },
            env,
          ),
        ),
      );
      /* Thirty days is as far back as anybody has looked, and pruning here
         means there is no second schedule to notice has stopped. */
      await platformHealth.pruneChecks();
      return true;
    })().catch(() => false),
    false,
  );

  const bad = probes.filter((one) => one.state === "fail");

  /*
   * The status code is the answer, so the workflow that calls this goes red
   * without anybody having to read its output. A warning is not a failure:
   * something slow at three in the morning should not page anybody.
   */
  return NextResponse.json(
    {
      environment: env,
      checked: probes.length,
      /* Whether the readings are being kept. False where migration 0163 has
         not been applied, which is a fact worth returning rather than a
         silence: the bars on the status screen stay empty until it is. */
      recording,
      kept: recording && kept,
      services: probes.map((one) => ({ service: one.service, state: one.state, tookMs: one.tookMs })),
      failing: bad.map((one) => ({ service: one.service, said: one.said })),
    },
    { status: bad.length > 0 ? 503 : 200 },
  );
}
