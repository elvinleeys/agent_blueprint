import type { ReactNode } from "react";
import { buildExportPrompt } from "@/core/prompt/export-prompt";
import { checkBlueprint } from "@/core/rules/run";
import { LANDING_BLUEPRINT } from "./landing-blueprint";
import { LandingCheck } from "./LandingExamples";

// GitHub 저장소 주소가 정해지면 여기에 적는다(비어 있으면 자리만 보인다)
export const REPO_URL: string | null = null;

export const FLOW_STEPS = [
  { title: "입력", body: "스펙 7개 항목을 적거나 화면 이미지를 올립니다." },
  { title: "AI 초안", body: "진행 단계를 보며 컴포넌트 구조 초안을 만듭니다." },
  { title: "보기·편집", body: "배치 미리보기와 트리로 보고, 편집 패널에서 고칩니다." },
  { title: "구조 검사", body: "규칙으로 오류와 경고를 표시합니다." },
  { title: "지시서", body: "화면 규칙 파일과 작업 지시서를 내보냅니다." },
] as const;

export const CLEANUP_TEXT = "디자인 시스템과 실제 코드를 비교해 중복·비대 컴포넌트를 찾고, 정리 지시서를 만듭니다.";

const EXCERPT_LINES = 26;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6 border-t border-border py-12 lg:py-16">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-foreground break-keep">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function HomeFlow() {
  return (
    <Section id="flow-title" title="입력부터 지시서까지 다섯 단계">
      <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {FLOW_STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 border-t-2 border-primary pt-3">
            <span className="text-sm font-medium text-primary">{i + 1}단계</span>
            <h3 className="text-base font-semibold text-foreground">{s.title}</h3>
            <p className="text-sm leading-relaxed text-foreground-secondary break-keep">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function HomeExamples() {
  // 예시 설계도로 실제 지시서 생성기를 돌린 결과의 앞부분(템플릿이라 AI 호출 없음, 항상 같은 글)
  const violations = checkBlueprint(LANDING_BLUEPRINT);
  const doc = buildExportPrompt({ blueprint: LANDING_BLUEPRINT, spec: {}, route: LANDING_BLUEPRINT.route, violations, format: "prompt" });
  const lines = doc.split("\n");
  const excerpt = lines.slice(0, EXCERPT_LINES).join("\n") + (lines.length > EXCERPT_LINES ? "\n…" : "");

  return (
    <Section id="example-title" title="검사 결과와 지시서는 이렇게 나옵니다">
      <p className="text-sm text-foreground-tertiary">예시 화면(상품 상세)으로 만든 결과입니다. 실제 프로젝트 데이터가 아닙니다.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">구조 검사 결과</h3>
          <div className="rounded-lg border border-border bg-card p-4">
            <LandingCheck />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">지시서 (앞부분)</h3>
          <pre className="max-h-96 overflow-auto rounded-lg bg-section p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground-secondary">{excerpt}</pre>
        </div>
      </div>
    </Section>
  );
}

export function HomeCleanup() {
  return (
    <Section id="cleanup-title" title="작업 후에는 정리까지">
      <p className="max-w-2xl text-base leading-relaxed text-foreground-secondary break-keep">{CLEANUP_TEXT}</p>
    </Section>
  );
}

export function HomeClosing({ login }: { login: ReactNode }) {
  return (
    <section aria-labelledby="closing-title" className="flex flex-col items-start gap-4 border-t border-border py-12 lg:py-16">
      <h2 id="closing-title" className="text-2xl font-bold tracking-tight text-foreground break-keep">
        구조부터 설계하고 시작하세요
      </h2>
      {login}
      <p className="text-sm text-foreground-tertiary">
        {REPO_URL ? (
          <a href={REPO_URL} className="underline underline-offset-4 hover:text-primary">
            GitHub 저장소
          </a>
        ) : (
          "GitHub 저장소 링크는 공개할 때 여기에 들어갑니다."
        )}
      </p>
    </section>
  );
}
