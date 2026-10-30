import { Suspense } from "react";
import HomeIntro from "@/components/home/HomeIntro";
import HomeLogin from "@/components/home/HomeLogin";

// 로그인 상태의 이동은 proxy.ts가 맡는다
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <HomeIntro />
      <Suspense fallback={null}>
        <HomeLogin searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
