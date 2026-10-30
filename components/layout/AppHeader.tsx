import Link from "next/link";
import { Suspense } from "react";
import HeaderAccount from "./HeaderAccount";

export default function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/projects" className="text-base font-semibold text-slate-900">
          AgentBlueprint
        </Link>
        <Suspense fallback={null}>
          <HeaderAccount />
        </Suspense>
      </div>
    </header>
  );
}
