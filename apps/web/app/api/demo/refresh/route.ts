import { bearerHolds } from "@connectapp/db";
import { NextResponse, type NextRequest } from "next/server";
import { rebuildDemoTemplate, sweepExpiredDemos } from "@connectapp/db";

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
  const tenantId = await rebuildDemoTemplate();

  return NextResponse.json({ rebuilt: tenantId, swept, tookMs: Date.now() - at });
}
