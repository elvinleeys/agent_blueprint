"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createClient } from "../../lib/supabase/client";

// 로그아웃 처리는 이 컴포넌트 한 곳에만 둔다(헤더·/account 공용, 메뉴 항목에서도 같은 것을 쓴다)
export default function LogoutButton({ children = "로그아웃", className = "rounded border px-4 py-2" }: { children?: ReactNode; className?: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    const { error } = await createClient().auth.signOut();
    if (error) return setFailed(true);
    router.replace("/");
    router.refresh(); // 서버에서 만든 화면이 이전 로그인 상태로 남지 않게 한다
  }

  return (
    <div>
      <button type="button" onClick={signOut} className={className}>
        {children}
      </button>
      {failed && <p role="alert" className="mt-2 text-red-600">로그아웃하지 못했습니다. 다시 시도해 주세요.</p>}
    </div>
  );
}
