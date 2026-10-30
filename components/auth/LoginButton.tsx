"use client";

import { useState } from "react";
import { safeNextPath } from "../../core/auth/redirect";
import { createClient } from "../../lib/supabase/client";

export default function LoginButton({ next }: { next?: string }) {
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setFailed(false);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
    const { error } = await createClient().auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
    if (error) setFailed(true); // 성공하면 브라우저가 GitHub로 이동한다
  }

  return (
    <div>
      <button type="button" onClick={signIn} className="rounded bg-primary hover:bg-primary-hover active:bg-primary-active px-4 py-2 text-primary-foreground">
        GitHub로 시작하기
      </button>
      {failed && <p role="alert" className="mt-2 text-destructive">로그인을 시작하지 못했습니다. 다시 시도해 주세요.</p>}
    </div>
  );
}
