import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import LogoutButton from "./LogoutButton";

// 세션을 읽으므로 호출하는 쪽에서 Suspense로 감싼다. Proxy를 거치지 않은 경우를 대비해 여기서도 확인한다
export default async function AccountInfo() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login?next=%2Faccount");

  const meta = claims.user_metadata ?? {};
  const githubName = meta.user_name ?? meta.full_name ?? meta.name ?? "-";
  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-2xl font-bold">계정</h1>
      <dl>
        <dt className="font-semibold">이메일</dt>
        <dd>{claims.email ?? "-"}</dd>
        <dt className="mt-2 font-semibold">GitHub 이름</dt>
        <dd>{String(githubName)}</dd>
      </dl>
      <LogoutButton />
    </div>
  );
}
