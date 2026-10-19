import { NextResponse, after, type NextRequest } from "next/server";
import { createDemoChurch, topUpDemoPool } from "@connectapp/db";
import { issueDemoPass, newDemoUserId } from "@/lib/demo-pass";
import { backTo, isDemoHost } from "@/lib/demo-host";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * HRT-416, R19.7. The door to the demo, which opens by being walked through.
 *
 * The middleware sends anybody arriving on the demo's own address here when
 * they carry no pass. This builds them a church, hands them the pass, and puts
 * them back where they were going, so the first thing a visitor sees is the
 * product rather than a page asking them to press something.
 *
 * A GET that writes, which is usually wrong. It is right here because the
 * visitor never asked for this address and nothing is at stake in it: the
 * church it creates is invented records belonging to nobody, thrown away a day
 * later, and the worst a repeated request can do is leave one more of those to
 * be swept.
 */
export async function GET(request: NextRequest) {
  if (!isDemoHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))) {
    /* Reachable only from the address it belongs to, so this cannot be used
       to mint demo churches against the product's own domain. */
    return new NextResponse("Not here", { status: 404 });
  }

  const asked = request.nextUrl.searchParams.get("next");
  /*
   * Somewhere inside this product and nowhere else. A `next` of
   * `//example.org` is a redirect off the site, which is worth refusing even
   * on a demo.
   */
  const next = asked && asked.startsWith("/") && !asked.startsWith("//") ? asked : "/dashboard";

  /*
   * HRT-457, SEC-026. The ceiling that used to be here is gone.
   *
   * It allowed twenty demos every ten minutes and it counted them for the
   * whole platform rather than per visitor, so one person opening the demo a
   * few times turned it off for everybody else. Past it, a visitor was
   * redirected to the marketing page with `?demo=busy`, which reads exactly
   * like a product that does not work. Writing a demo church is the most
   * expensive thing an unauthenticated request can ask of this product, and
   * the answer to that is not a number that turns real visitors away.
   *
   * What still bounds it: a demo church lives for a day and the nightly sweep
   * removes it, the host check above means only the demo's own address
   * reaches here, and the pass is written on the way out so an ordinary
   * visitor creates one church and then carries it.
   *
   * What is left open, and named rather than implied: somebody who wants to
   * can ask for a church in a loop and fill a day's worth before the sweep
   * runs. A per-visitor ceiling generous enough that nobody real ever meets
   * it is the thing to put back, and it is HRT-458 rather than a number
   * picked in a hurry.
   */

  const userId = newDemoUserId();
  const demo = await createDemoChurch(userId);
  await issueDemoPass(demo.tenantId, userId, demo.expiresAt);

  /*
   * HRT-462. The copy this visitor took is replaced after they have been
   * answered, not before. Refilling costs about a second of database work per
   * church, and a second spent here is a second the visitor spends looking at
   * nothing.
   */
  after(async () => {
    try {
      await topUpDemoPool();
    } catch {
      /* The next visitor or the nightly run refills it. A pool one short
         costs somebody a copy they wait for; a throw here would be an
         unhandled rejection in a request that has already answered. */
    }
  });

  /* Built from the host the visitor arrived on. A redirect to the bare
     product is a redirect to somewhere their new pass is not sent. */
  return NextResponse.redirect(backTo(request.headers, next));
}
