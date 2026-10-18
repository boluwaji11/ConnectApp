import { NextResponse, type NextRequest } from "next/server";
import { t } from "@connectapp/i18n";
import { ourOrigin, safePath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * HRT-392, R1.7, R17.1. The address in a confirmation email, on our own name.
 *
 * Supabase proves the token on its own host, and a link to it says
 * `nvdovjuqcnxacvhxfrmi.supabase.co` in the status bar of every church that
 * hovers over the button. That is somebody else's name on the one message
 * asking them to trust us, and it is the shape a phishing mail takes.
 *
 * So the button points here and this sends them on. The token is proved in
 * the same place it always was; what changes is the name a reader sees.
 *
 * Nothing here is a control. The token is Supabase's to accept or refuse, and
 * this hands it over untouched.
 */
export async function GET(request: NextRequest) {
  const asked = new URL(request.url);
  const token = asked.searchParams.get("token");
  const type = asked.searchParams.get("type");

  const project = process.env["SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const home = `${asked.protocol}//${asked.host}`;

  /* A link with nothing in it is a link somebody mangled on the way, which is
     what a mail program that breaks a long URL across two lines does. */
  if (!project || !token || !type) {
    return NextResponse.redirect(
      `${home}/sign-in?error=${encodeURIComponent(t("auth.error.partialLink"))}`,
    );
  }

  /*
   * Where Supabase sends them once the token is proved. Our own callback,
   * which is the only thing that knows what to do with what comes back, and
   * ours rather than the church's because the session cookie is set there.
   *
   * SEC-008. Clamped to an address we answer on. Supabase appends the proof of
   * identity to whatever this names once it has spent the token, so an
   * unchecked `redirect_to` carries a live credential wherever it points, and
   * this value is reachable through the authentication API: a `redirect_to`
   * asked for there arrives in the hook, goes into the link a church is
   * emailed, and comes back here. The portal's own copy of this route has
   * clamped it from the start, for the same reason.
   */
  const given = asked.searchParams.get("redirect_to");
  const fallback = `${home}/auth/callback`;
  const back = await (async () => {
    if (!given) return fallback;
    const path = safePath(given);
    if (path) return `${home}${path}`;
    const origin = await ourOrigin(given);
    if (!origin) return fallback;
    const url = new URL(given);
    return `${origin}${url.pathname}${url.search}`;
  })();

  const query = new URLSearchParams({ token, type, redirect_to: back });
  return NextResponse.redirect(`${project.replace(/\/$/, "")}/auth/v1/verify?${query.toString()}`);
}
