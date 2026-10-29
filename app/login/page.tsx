import { Suspense } from "react";
import LoginPanel from "@/components/auth/LoginPanel";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<p>불러오는 중…</p>}>
        <LoginPanel searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
