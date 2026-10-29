import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Proxy에서 세션을 갱신한다. 갱신된 쿠키는 요청과 응답 양쪽에 쓰고, 로그인 여부(claims)를 함께 돌려준다 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getSession()은 서버에서 신뢰할 수 없다. 토큰 서명을 검증하는 getClaims()로 판단한다
  const { data } = await supabase.auth.getClaims();
  return { response, isAuthed: !!data?.claims };
}
