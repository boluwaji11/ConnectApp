import { NextResponse, type NextRequest } from "next/server";
import { createDemoChurch } from "@connectapp/db";
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

  const userId = newDemoUserId();
  const demo = await createDemoChurch(userId);
  await issueDemoPass(demo.tenantId, userId, demo.expiresAt);

  /* Built from the host the visitor arrived on. A redirect to the bare
     product is a redirect to somewhere their new pass is not sent. */
  return NextResponse.redirect(backTo(request.headers, next));
}
