import { Suspense } from "react";
import AccountInfo from "@/components/auth/AccountInfo";

export default function AccountPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Suspense fallback={<p>불러오는 중…</p>}>
        <AccountInfo />
      </Suspense>
    </main>
  );
}
