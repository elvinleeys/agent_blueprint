import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 요청마다 새로 만든다(쿠키가 요청별이다). 서버에서 사용자를 확인할 때는 getSession()이 아니라 getClaims()를 쓴다.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서는 쿠키를 쓸 수 없다. 세션 갱신은 로그인 흐름의 Proxy가 맡는다
        }
      },
    },
  });
}
