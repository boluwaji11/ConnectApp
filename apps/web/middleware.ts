import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { spanningSubdomains } from "@/lib/cookie-domain";
import { AUTH_BUDGET_MS, budgetedFetch } from "@/lib/budget";
import { DEV_PASS, gated, openInDev, passHolds } from "@/lib/dev-gate";
import { backTo, DEMO_ENTRY, isDemoHost } from "@/lib/demo-host";
import { DEMO_COOKIE } from "@/lib/demo-pass-name";

/**
 * Refreshes the Supabase session on every request, because a Server Component
 * cannot write cookies and an expired token would otherwise log members out
 * mid-task. It authenticates only. Authorization, meaning which church a user
 * may reach and with what role, is decided in the data layer from the database.
 *
 * R24.11. `getClaims` rather than `getUser`. This project signs its tokens with
 * ES256 and publishes the key, so the signature and the expiry are checked here
 * with WebCrypto against a key set held for ten minutes, and nothing leaves the
 * building. `getUser` asked the authentication server on every navigation, and
 * the screen behind it asked a second time. The session is still refreshed when
 * the token is near its end, which is the reason this runs at all.
 */
export async function middleware(request: NextRequest) {
  /*
   * R1.4. The address the request is on, passed through on the request so a
   * server component can read it. A screen cannot see its own URL, and a
   * refusal that cannot name where the reader was going has to send them
   * somewhere arbitrary afterwards.
   */
  const asked = new Headers(request.headers);
  asked.set("x-pathname", request.nextUrl.pathname);
  asked.set("x-search", request.nextUrl.search);

  let response = NextResponse.next({ request: { headers: asked } });

  const supabase = createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
    {
      /* R21.5. A refresh that cannot answer in ten seconds is not going to. */
      global: { fetch: budgetedFetch(AUTH_BUDGET_MS) },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: asked } });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, spanningSubdomains(options ?? {}));
          }
        },
      },
    },
  );

  await supabase.auth.getClaims();

  /*
   * HRT-416. On the demo's own address, arriving is starting.
   *
   * A visitor with no pass is handed a church of their own and put back where
   * they were going. Everything after that is the product, carrying the pass
   * like any other demo.
   *
   * The dev gate does not apply here, and nothing is opened by that: this host
   * serves nothing but demo churches, because a request without a pass never
   * gets past the line below.
   */
  if (isDemoHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"))) {
    const pathname = request.nextUrl.pathname;
    const passing =
      pathname.startsWith(DEMO_ENTRY) ||
      pathname.startsWith("/auth/") ||
      pathname.startsWith("/api/");

    if (!passing && !request.cookies.get(DEMO_COOKIE)?.value) {
      /* The root of this host is the demo, not the marketing site: somebody
         who typed the address in wants to be inside the product. Anywhere
         else is where they were already going. */
      const going = pathname === "/" ? "/dashboard" : pathname + request.nextUrl.search;
      const away = backTo(request.headers, `${DEMO_ENTRY}?next=${encodeURIComponent(going)}`);
      return NextResponse.redirect(away);
    }
    return response;
  }

  /*
   * HRT-402. On the development deployment, everything is behind the team.
   *
   * After the refresh above, so somebody whose pass has run out is still
   * carrying a live session when they reach the door and walks back through
   * it without typing anything.
   */
  if (gated() && !openInDev(request.nextUrl.pathname)) {
    if (!(await passHolds(request.cookies.get(DEV_PASS)?.value))) {
      const away = request.nextUrl.clone();
      away.pathname = "/dev-gate";
      away.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
      return NextResponse.redirect(away);
    }
  }

  return response;
}

export const config = {
  /*
   * HRT-288. The Resend landing is left out. It answers on the parent, where a
   * church's session cookie is never sent, so refreshing a session there finds
   * none and the church was asked to sign in in the middle of connecting. It
   * carries its own proof in a sealed state and needs no session.
   */
  matcher: [
    /*
     * R24.11. The machine routes are left out. The queue worker's tick and
     * Stripe's webhook carry their own proof, a bearer secret and a signature,
     * and hold no session to refresh: every one of them was paying for a round
     * trip to the authentication server to be told there was nobody there.
     */
    /* One string, because Next reads this statically and cannot follow a
       sum of them. */
    "/((?!_next/static|_next/image|favicon.ico|design|api/providers/resend/callback|api/email/drain|api/demo/refresh|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
