import { Suspense } from "react";
import GuardedLink from "./GuardedLink";
import HeaderAccount from "./HeaderAccount";

export default function AppHeader() {
  return (
    <header className="border-b border-border bg-background">
      {/* 화면 전체 폭에 양옆 여백만 고정: 로고는 왼쪽 끝, 계정은 오른쪽 끝 */}
      <div className="flex w-full items-center justify-between px-4 py-3 sm:px-6">
        <GuardedLink href="/projects" className="text-base font-semibold text-foreground">
          AgentBlueprint
        </GuardedLink>
        <Suspense fallback={null}>
          <HeaderAccount />
        </Suspense>
      </div>
    </header>
  );
}
