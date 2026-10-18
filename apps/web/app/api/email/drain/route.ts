import { bearerHolds } from "@connectapp/db";
import { drain, checkVerdicts, keepGrantsAlive } from "@/lib/send-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * HRT-141, R16.6. The worker, on a schedule.
 *
 * A send queued while nobody is looking, and a send whose time has come, both
 * leave through here. The kick a church's own press gives is the same work in
 * the same place; this is what catches whatever that kick did not finish.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];
  if (!secret || !bearerHolds(request.headers.get("authorization"), secret)) {
    return new Response(null, { status: 401 });
  }

  /* R16.7. What is waiting to go, then what became of what went. The second
     is cheap and only asks about copies sent in the last day and a half. */
  const sent = await drain();
  const checked = await checkVerdicts();

  /* HRT-387, R16.1. A church that has sent nothing for two months would lose
     its Resend grant, and nothing on this side can get it back. This renews
     the ones near the end, which is usually none of them. */
  const grants = await keepGrantsAlive();

  return Response.json({ ...sent, ...checked, ...grants });
}
