import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { blueprint, NEXT_TAILWIND } from "@/core/rules/fixture";
import { checkBlueprint } from "@/core/rules/run";
import type { Blueprint } from "@/core/schema/blueprint";
import CheckResults, { CHECK_EMPTY_CLEAN, CHECK_EMPTY_NO_BLUEPRINT, countSummary } from "./CheckResults";
import PreviewCanvas from "./PreviewCanvas";
import { StructureStoreProvider } from "./StructureStoreProvider";
import { ViolationsProvider } from "./ViolationsProvider";
import { violationMark } from "./violation-mark";

// 서버 렌더링 스모크 테스트: 구성과 표시 규칙만 본다. 항목 클릭 선택·실시간 갱신은 브라우저에서 확인한다
const render = (bp: Blueprint | null, ui: ReactNode) =>
  renderToString(
    <StructureStoreProvider init={{ blueprint: bp, savedInput: null }}>
      <ViolationsProvider>{ui}</ViolationsProvider>
    </StructureStoreProvider>,
  ).replaceAll("<!-- -->", "");

const errorBp = () => blueprint([{ id: "a", kind: "presentational", dataFetch: true }]); // R-04 오류(a)
const warnBp = () => blueprint([{ id: "a", responsibilities: ["1", "2", "3", "4"] }]); // R-01 경고(a)
const firstButton = (html: string, name: string) => html.match(new RegExp(`<div role="button"[^>]*aria-label="${name}[^"]*"[^>]*>`))?.[0] ?? "";

describe("CheckResults", () => {
  it("설계도가 없을 때와 위반이 0건일 때 문구가 다르다", () => {
    expect(render(null, <CheckResults />)).toContain(CHECK_EMPTY_NO_BLUEPRINT);
    const clean = blueprint([]);
    expect(checkBlueprint(clean)).toEqual([]);
    const html = render(clean, <CheckResults />);
    expect(html).toContain(CHECK_EMPTY_CLEAN);
    expect(html).not.toContain(CHECK_EMPTY_NO_BLUEPRINT);
  });

  it("심각도별로 묶고 개수·규칙 id·노드 이름 버튼을 보인다. 0건인 묶음은 생략한다", () => {
    const html = render(errorBp(), <CheckResults />);
    for (const t of ["오류 1", "R-04", ">A</button>"]) expect(html).toContain(t);
    expect(html).not.toContain("경고 ");
    expect(html).not.toContain("정보 ");
  });

  it("제목용 개수 문구는 0건 묶음을 빼고 오류·경고·정보 순이다", () => {
    expect(countSummary([])).toBe("");
    const v = checkBlueprint(blueprint([{ id: "a", kind: "presentational", dataFetch: true, responsibilities: ["1", "2", "3", "4"] }], NEXT_TAILWIND, { dataFetch: true }));
    expect(countSummary(v)).toBe("오류 1 · 경고 1");
  });
});

describe("미리보기 위반 표시", () => {
  it("오류 노드는 빨강 실선과 '오류 N' 글자, aria-label에도 표시한다", () => {
    const html = render(errorBp(), <PreviewCanvas />);
    const box = firstButton(html, "A");
    expect(box).toContain("border-destructive");
    expect(box).toContain("오류 1");
    expect(html).toContain("오류 1</span>");
  });
  it("경고만 있으면 주황 실선과 '경고 N'", () => {
    const html = render(warnBp(), <PreviewCanvas />);
    expect(firstButton(html, "A")).toContain("border-warning");
    expect(html).toContain("경고 1</span>");
  });
  it("위반이 없는 AI 가정 노드는 회색 점선이고, 주황을 쓰지 않는다", () => {
    const bp = blueprint([{ id: "a", assumed: true }]);
    const box = firstButton(render(bp, <PreviewCanvas />), "A");
    expect(box).toContain("border-dashed");
    expect(box).toContain("border-foreground-tertiary");
    expect(box).not.toContain("border-warning");
  });
  it("AI 가정이면서 오류이면 위반 색 실선이 우선하고 'AI 가정' 글자도 함께 보인다", () => {
    const bp = blueprint([{ id: "a", assumed: true, kind: "presentational", dataFetch: true }]);
    const html = render(bp, <PreviewCanvas />);
    const box = firstButton(html, "A");
    expect(box).toContain("border-destructive");
    expect(box).not.toContain("border-dashed");
    expect(html).toContain("AI 가정</span>");
  });
});

describe("violationMark", () => {
  it("오류가 경고보다 우선하고, 없으면 null", () => {
    expect(violationMark({ error: 2, warning: 3 })?.label).toBe("오류 2");
    expect(violationMark({ error: 0, warning: 3 })?.label).toBe("경고 3");
    expect(violationMark({ error: 0, warning: 0 })).toBeNull();
    expect(violationMark(undefined)).toBeNull();
  });
});
