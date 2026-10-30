"use client";

import LogoutButton from "../auth/LogoutButton";
import GuardedLink from "./GuardedLink";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import type { Profile } from "../../core/auth/profile";

// 프로필(이름·사진, 사진이 없으면 첫 글자)을 누르면 계정 설정·로그아웃 메뉴가 열린다
export default function AccountMenu({ name, avatarUrl, initial }: Profile) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-foreground hover:bg-accent">
        {avatarUrl ? (
          // 외부(GitHub) 주소라 next/image 설정을 늘리지 않고 고정 크기 img를 쓴다
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" width={28} height={28} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" />
        ) : (
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
            {initial}
          </span>
        )}
        <span className="max-w-40 truncate">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <GuardedLink href="/account">계정 설정</GuardedLink>
        </DropdownMenuItem>
        {/* 닫지 않고 두어 로그아웃이 실패하면 안내 문구가 보이게 한다 */}
        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
          <LogoutButton className="w-full text-left" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
