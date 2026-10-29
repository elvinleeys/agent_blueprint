"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setFailed(false);
    const { error } = await createClient().auth.signOut();
    if (error) return setFailed(true);
    router.replace("/login");
    router.refresh(); // 서버에서 만든 화면이 이전 로그인 상태로 남지 않게 한다
  }

  return (
    <div>
      <button type="button" onClick={signOut} className="rounded border px-4 py-2">
        로그아웃
      </button>
      {failed && <p role="alert" className="mt-2 text-red-600">로그아웃하지 못했습니다. 다시 시도해 주세요.</p>}
    </div>
  );
}
