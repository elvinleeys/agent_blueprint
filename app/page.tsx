import HomeIntro from "@/components/home/HomeIntro";
import HomeLogin from "@/components/home/HomeLogin";
import { HomeCleanup, HomeClosing, HomeExamples, HomeFlow } from "@/components/home/HomeSections";
import LoginButton from "@/components/auth/LoginButton";

// 로그인 상태의 이동은 proxy.ts가 맡는다. 이 화면은 로그인·DB·AI 없이 정적 예시만 그린다
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6">
      <p className="text-base font-semibold text-foreground">AgentBlueprint</p>
      <HomeIntro login={<HomeLogin searchParams={searchParams} />} />
      <HomeFlow />
      <HomeExamples />
      <HomeCleanup />
      <HomeClosing login={<LoginButton />} />
    </main>
  );
}
