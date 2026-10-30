import { Suspense } from "react";
import AccountInfo from "@/components/auth/AccountInfo";
import AppHeader from "@/components/layout/AppHeader";

export default function AccountPage() {
  return (
    <>
      <AppHeader />
      <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Suspense fallback={<p>불러오는 중…</p>}>
          <AccountInfo />
        </Suspense>
      </main>
    </>
  );
}
