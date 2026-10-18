import { NextResponse, type NextRequest } from "next/server";
import { canManageChurch, canManageEvents } from "@connectapp/db";
import { requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { refused } from "@/lib/refuse";

export const dynamic = "force-dynamic";

/**
 * R4.1. Opening a file somebody attached to a form.
 *
 * The bucket is private, so this signs a link that lives a few minutes and
 * sends the reader to it. The key is checked against the church in the session
 * before anything is signed: a key is a path, and a path in a query string is
 * whatever the caller typed.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const session = await requireSession();

  /*
   * Whoever may read what came in. A form's responses are the church's, and an
   * event's roster carries the same answers, so the person running the camp
   * can open what was attached to it without being given the whole church.
   */
  if (!canManageChurch(session) && !canManageEvents(session)) {
    return refused(session.role, "manageForms");
  }
  /*
   * SEC-017. The whole shape of the key, not just how it begins.
   *
   * `startsWith` was the entire check, and a key is a path.
   * `riverside/form_answer/../../other/logo/x.png` begins exactly as required
   * and then leaves. Whether Supabase Storage resolves `..` in an object key
   * or treats it as a literal decides whether that reads another church's
   * file, and a check that depends on the answer is the wrong check.
   *
   * The sibling route that serves website media already matches a full shape,
   * which is the pattern copied here: one slug, the one purpose this route is
   * for, a uuid, and an extension from the list the upload accepts.
   */
  const KEY = /^[a-z0-9][a-z0-9-]{0,62}\/form_answer\/[a-f0-9-]{36}\.[a-z0-9]{1,8}$/;
  if (!KEY.test(key) || !key.startsWith(`${session.tenantSlug}/form_answer/`)) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await supabaseServer();
  const signed = await supabase.storage.from("church").createSignedUrl(key, 300);
  if (!signed.data?.signedUrl) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(signed.data.signedUrl);
}
