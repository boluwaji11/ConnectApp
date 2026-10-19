import { bearerHolds } from "@connectapp/db";
import { NextResponse, type NextRequest } from "next/server";
import {
  discardUnclaimedDemos, rebuildDemoTemplate, sweepExpiredDemos, topUpDemoPool,
} from "@connectapp/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * HRT-416, R19.7. Builds the demo's template again, on a clock.
 *
 * A copy carries the dates it was built with. The seed is written against the
 * day it runs, so it holds a service happening today, attendance behind it and
 * a count from last weekend; a template built on Monday and copied on Friday
 * shows a visitor a check-in screen with nothing on today and a diary going
 * stale. Shifting every date on the way out would mean knowing which of four
 * hundred columns are dates and what each one means, so the template is simply
 * made again each night instead.
 *
 * Carries a bearer secret rather than a session, the same as the queue's
 * worker, because the thing calling it is a clock and not a person.
 */
export async function GET(request: NextRequest) {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return new NextResponse("Not configured", { status: 503 });

  const given = request.headers.get("authorization");
  if (!bearerHolds(given, secret)) return new NextResponse("No", { status: 401 });

  const at = Date.now();
  /* Copies already handed out are left alone: somebody is looking at one. They
     go when they run out, the way they always did. */
  const swept = await sweepExpiredDemos();

  /*
   * HRT-462. The standing copies go before the template they were made from,
   * because a copy carries the dates it was built with and this route exists
   * precisely because those dates go stale. Then the pool is filled again from
   * the template just built, so the first visitor of the day is handed one
   * rather than waiting for one.
   */
  const discarded = await discardUnclaimedDemos();
  const tenantId = await rebuildDemoTemplate();
  const pooled = await topUpDemoPool();

  return NextResponse.json({
    rebuilt: tenantId, swept, discarded, pooled, tookMs: Date.now() - at,
  });
}
