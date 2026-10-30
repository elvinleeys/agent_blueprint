import { Suspense } from "react";
import GuardedLink from "./GuardedLink";
import HeaderAccount from "./HeaderAccount";

export default function AppHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
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
