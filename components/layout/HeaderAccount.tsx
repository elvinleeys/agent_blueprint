import Link from "next/link";
import { profileFromClaims } from "../../core/auth/profile";
import { createClient } from "../../lib/supabase/server";
import LogoutButton from "../auth/LogoutButton";

// 세션을 읽으므로 호출하는 쪽에서 Suspense로 감싼다. 로그인 확인과 이동은 각 페이지가 맡는다
export default async function HeaderAccount() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims) return null;
  const { name, avatarUrl, initial } = profileFromClaims(data.claims.user_metadata, data.claims.email);

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/account" className="flex items-center gap-2 text-slate-700 hover:text-indigo-600">
        {avatarUrl ? (
          // 외부(GitHub) 주소라 next/image 설정을 늘리지 않고 고정 크기 img를 쓴다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={28} height={28} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
        ) : (
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {initial}
          </span>
        )}
        <span>{name}</span>
      </Link>
      <LogoutButton className="rounded-lg border border-slate-200 px-3 py-1 text-slate-600 hover:text-indigo-600" />
    </div>
  );
}
