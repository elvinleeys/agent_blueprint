"use client";

import { SPEC_TEXT_KEYS } from "@/lib/db/spec-inputs";
import { useStructureStore } from "./StructureStoreProvider";

const LABELS: Record<(typeof SPEC_TEXT_KEYS)[number], string> = {
  overview: "① 화면 개요",
  tokens: "② 디자인 토큰",
  layout: "③ 레이아웃·반응형",
  componentRules: "④ 컴포넌트 규칙",
  stateData: "⑤ 상태·데이터",
  accessibility: "⑥ 접근성",
  constraints: "⑦ 금지·제약 사항",
};

// 임시: 저장된 스펙 입력을 읽기만 한다. 입력 폼(스펙 7개 항목·화면 주소·이미지)은 다음 단계에서 만든다
export default function SpecSummary() {
  const saved = useStructureStore((s) => s.savedInput);
  if (!saved) return <p className="text-sm text-foreground-tertiary">저장된 스펙 입력이 없습니다.</p>;

  const filled = SPEC_TEXT_KEYS.filter((k) => saved.spec[k]);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {filled.length === 0 && <p className="text-foreground-tertiary">텍스트 항목 없이 이미지로만 만든 초안입니다.</p>}
      {filled.map((k) => (
        <section key={k}>
          <h4 className="text-xs font-medium text-foreground-tertiary">{LABELS[k]}</h4>
          <p className="whitespace-pre-wrap break-words text-foreground">{saved.spec[k]}</p>
        </section>
      ))}
      <section>
        <h4 className="text-xs font-medium text-foreground-tertiary">화면 주소</h4>
        <p className="break-all text-foreground">{saved.route ?? "없음"}</p>
      </section>
      <p className="text-xs text-foreground-tertiary">
        {saved.imageCount > 0 ? `이미지 ${saved.imageCount}장을 사용했습니다. 이미지는 저장하지 않아 다시 첨부해야 합니다.` : "이미지 없음"}
      </p>
    </div>
  );
}
