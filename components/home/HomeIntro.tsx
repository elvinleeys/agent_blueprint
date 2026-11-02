import { Suspense, type ReactNode } from "react";
import { LandingPreview } from "./LandingExamples";

export const HERO_TITLE = "AI 에이전트가 코드를 쓰기 전에, 구조부터 설계하세요";
export const HERO_DESCRIPTION = "화면 스펙이나 시안을 넣으면 컴포넌트 구조 초안을 만들고, 구조 규칙으로 검사한 뒤, 에이전트가 따를 지시서로 내보냅니다.";
export const SIGNUP_NOTE = "계정이 없으면 처음 로그인할 때 자동으로 만들어집니다";

/** 첫 화면. 모바일에서는 설명 아래로 미리보기가 내려가고, 큰 화면에서는 오른쪽에 놓인다. login은 로그인 버튼 자리(next·오류 표시를 호출하는 쪽이 정한다) */
export default function HomeIntro({ login }: { login: ReactNode }) {
  return (
    <section className="grid items-center gap-10 py-10 lg:grid-cols-2 lg:gap-14 lg:py-16">
      <div className="flex min-w-0 flex-col gap-6">
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-foreground break-keep sm:text-4xl lg:text-5xl">{HERO_TITLE}</h1>
        <p className="max-w-xl text-base leading-relaxed text-foreground-secondary break-keep sm:text-lg">{HERO_DESCRIPTION}</p>
        <div className="flex flex-col items-start gap-2">
          <Suspense fallback={null}>{login}</Suspense>
          <p className="text-xs text-foreground-tertiary">{SIGNUP_NOTE}</p>
        </div>
      </div>

      <figure className="flex min-w-0 flex-col gap-2">
        <LandingPreview />
        <figcaption className="text-xs text-foreground-tertiary">예시 화면 · 저장된 프로젝트가 아니며, 상품 상세 화면을 가정한 예시입니다.</figcaption>
      </figure>
    </section>
  );
}
