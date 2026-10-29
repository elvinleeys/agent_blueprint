import { createBrowserClient } from "@supabase/ssr";

// 브라우저에서는 NEXT_PUBLIC_ 값(publishable key)만 쓴다. service role key는 여기서 참조하지 않는다
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
