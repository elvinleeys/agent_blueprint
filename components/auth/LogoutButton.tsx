"use client";

import { useRouter } from "next/navigation";
import { useState, type ComponentProps } from "react";
import { confirmLeave } from "../../lib/client/leave-guard";
import { createClient } from "../../lib/supabase/client";

// 로그아웃 처리는 이 컴포넌트 한 곳에만 둔다(/account 버튼과 헤더 계정 메뉴 항목이 같은 것을 쓴다).
// 나머지 props는 button에 그대로 전달하므로 메뉴 항목의 asChild 안에서도 쓸 수 있다
export default function LogoutButton({
  children = "로그아웃",
  className = "rounded border px-4 py-2",
  ...props
}: Omit<ComponentProps<"button">, "type" | "onClick">) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  async function signOut() {
    // router.replace는 Link의 onNavigate가 닿지 않으므로 여기서 직접 확인한다(저장되지 않은 수정이 있을 때만 묻는다)
    if (!confirmLeave()) return;
    setFailed(false);
    const { error } = await createClient().auth.signOut();
    if (error) return setFailed(true);
    router.replace("/");
    router.refresh(); // 서버에서 만든 화면이 이전 로그인 상태로 남지 않게 한다
  }

  return (
    <>
      <button {...props} type="button" onClick={signOut} className={className}>
        {children}
      </button>
      {failed && <p role="alert" className="mt-2 text-destructive">로그아웃하지 못했습니다. 다시 시도해 주세요.</p>}
    </>
  );
}
