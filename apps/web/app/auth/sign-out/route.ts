import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { clearDemoPass } from "@/lib/demo-pass";
import { forgetChurch } from "@/lib/church-choice";
import { DEV_PASS } from "@/lib/dev-gate";
import { afterSignOut } from "@/lib/demo-host";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  // A demo visitor has no Supabase session to end, only the pass they carry.
  await clearDemoPass();
  // R1.4. The church they were looking at goes with the session.
  await forgetChurch();
  /*
   * HRT-402. The sandbox pass goes with the session too.
   *
   * It was minted for one account after reading the team list, so leaving it
   * behind means signing out and still being inside: the next request walks
   * past the gate on a pass belonging to somebody who has just left, and
   * lands on the marketing page rather than the door.
   */
  (await cookies()).delete(DEV_PASS);

  /*
   * HRT-416. Leaving the demo leaves its address.
   *
   * Signing out on `demo.connectapp.church` sent them to the root of that
   * host, where the middleware hands anybody without a pass a fresh demo
   * church: a sign-out that signs you straight back in. They go to the
   * product's own site instead, which is what somebody who has finished
   * looking around wants to see.
   */
  /*
   * R17.1, HRT-306. Back to the address the browser is actually on.
   *
   * `new URL(request.url).origin` is the host this handler was reached at
   * after Next resolved it, which is not the host the person typed: signing
   * out on `riverside.connectapp.church` sent them to the bare product.
   *
   * That became visible rather than merely wrong once the CSP arrived.
   * `form-action 'self'` is checked against a redirect as well as against the
   * form's own target, so a sign-out that crossed from a church's address to
   * ours was blocked by the browser and the press did nothing at all.
   */
  const away = afterSignOut(request.headers);

  /*
   * 303, not the 307 this used to send. A 307 keeps the method, so the
   * browser posted the sign-out form again at wherever it was sent. On the
   * demo that landed on a route with no POST handler and the visitor met
   * HTTP 405 rather than a signed-out screen.
   */
  return NextResponse.redirect(away, 303);
}
