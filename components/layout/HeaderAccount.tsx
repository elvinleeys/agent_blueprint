import { profileFromClaims } from "../../core/auth/profile";
import { createClient } from "../../lib/supabase/server";
import AccountMenu from "./AccountMenu";

// 세션을 읽으므로 호출하는 쪽에서 Suspense로 감싼다. 로그인 확인과 이동은 각 페이지가 맡는다
export default async function HeaderAccount() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims) return null;
  return <AccountMenu {...profileFromClaims(data.claims.user_metadata, data.claims.email)} />;
}
