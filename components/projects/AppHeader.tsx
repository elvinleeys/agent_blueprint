import Link from "next/link";
import LogoutButton from "../auth/LogoutButton";

export default function AppHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/projects" className="text-base font-semibold text-slate-900">
          AgentBlueprint
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/account" className="text-slate-600 hover:text-indigo-600">
            계정
          </Link>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
