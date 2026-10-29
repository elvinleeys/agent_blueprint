import { NextResponse, type NextRequest } from "next/server";
import { decideRedirect } from "@/core/auth/redirect";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, isAuthed } = await updateSession(request);
  const to = decideRedirect({ pathname: request.nextUrl.pathname, search: request.nextUrl.search, isAuthed });
  if (!to) return response;

  const redirect = NextResponse.redirect(new URL(to, request.url));
  // 갱신된 세션 쿠키를 잃지 않도록 복사한다
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

// 정적 자산은 제외한다. /api는 세션만 갱신하고 이동은 판단하지 않는다(각 라우트가 401)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
