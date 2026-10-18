import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/supabase/cookie-name";

/**
 * HRT-396, R21.1. Refreshes the session, and turns away anybody without one.
 *
 * Two jobs, and the order matters. A Server Component cannot write cookies, so
 * an expired token would otherwise sign a team member out mid-task; that is what
 * the refresh is for and it is unchanged.
 *
 * What is new is the second half. The portal's own layout holds the real gate,
 * because deciding whether an account operates the platform means reading the
 * database and middleware runs where that connection does not belong. This is
 * the cheaper gate in front of it: a request carrying no session at all never
 * reaches a render. Defence in depth rather than the control itself.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
    {
      // HRT-405. The same name the server client uses, so the refresh here and
      // the read there are the same session. See lib/supabase/cookie-name.ts.
      cookieOptions: { name: ADMIN_AUTH_COOKIE },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();

  /*
   * HRT-306, SEC-020. The portal is for the operators and nothing frames it.
   *
   * Written here rather than imported from the product, because the two apps
   * deploy separately and the portal's answer is the simple one: nothing it
   * serves is ever embedded, so there is no route rule to get wrong.
   */
  const stamp = <T extends NextResponse>(answer: T): T => {
    answer.headers.set(
      "Content-Security-Policy",
      "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    answer.headers.set("X-Frame-Options", "DENY");
    answer.headers.set("X-Content-Type-Options", "nosniff");
    answer.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    answer.headers.set("Strict-Transport-Security", "max-age=63072000");
    return answer;
  };

  const path = request.nextUrl.pathname;
  /*
   * The door itself, the route the cron calls, which carries its own secret
   * and has no session to carry, and the two halves of an invitation link,
   * which are walked by somebody who has no session yet and is about to get
   * one (HRT-401).
   *
   * SEC-021. The cron route is named rather than matched by prefix. `/api/` as
   * a prefix opened a whole namespace that sits outside the `(portal)` route
   * group, so it has no layout gate either: a second API route added here would
   * be reachable with no session and no platform_admins check unless its author
   * remembered both. There is one, and it carries its own bearer.
   */
  const open =
    path === "/sign-in" ||
    path === "/join" ||
    path.startsWith("/auth/") ||
    path === "/api/health";

  if (!data.user && !open) {
    const away = request.nextUrl.clone();
    away.pathname = "/sign-in";
    away.search = "";
    return stamp(NextResponse.redirect(away));
  }

  return stamp(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
