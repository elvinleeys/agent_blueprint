"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { confirmLeave } from "@/lib/client/leave-guard";

/**
 * 저장되지 않은 수정이 있을 때 클라이언트 이동 전에 확인을 거치는 링크(Next의 onNavigate).
 * 한계: Ctrl/Cmd+클릭(새 탭)·외부 주소·download 링크에는 onNavigate가 불리지 않는다(새 탭은 지금 탭의 편집을 잃지 않는다).
 */
export default function GuardedLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onNavigate={(e) => {
        if (!confirmLeave()) return e.preventDefault();
        onNavigate?.(e);
      }}
    />
  );
}
