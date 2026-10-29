import "server-only";
import { NextResponse } from "next/server";
import { safeNextPath } from "../../core/auth/redirect";
import { createClient } from "../supabase/server";

/** GET /auth/callback 본문. code를 세션으로 교환하고, 실패하면 어떤 경우든 /login?error=auth로 보낸다 */
export async function handleAuthCallback(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const fail = () => NextResponse.redirect(`${origin}/login?error=auth`);

  const code = searchParams.get("code");
  if (!code) return fail();
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth callback: code exchange failed:", error.name);
      return fail();
    }
  } catch (e) {
    console.error("auth callback failed:", e instanceof Error ? e.name : "unknown error");
    return fail();
  }
  // next는 같은 사이트 안의 경로만 허용한다
  return NextResponse.redirect(`${origin}${safeNextPath(searchParams.get("next"))}`);
}
