import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlueprintSchema, type Blueprint } from "@/core/schema/blueprint";
import NodeEditPanel from "../NodeEditPanel";
import { StructureStoreProvider } from "../StructureStoreProvider";
import BasicSection from "./BasicSection";
import LayoutSection from "./LayoutSection";
import RoleSection from "./RoleSection";
import StyleSection from "./StyleSection";

// 서버 렌더링 스모크 테스트: 브라우저 없이 각 구역이 예외 없이 그려지고, 스택·노드에 맞는 칸만 나오는지 본다.
// 입력 동작(타이핑·클릭·포커스)은 확인하지 못한다 — 그것은 브라우저에서 직접 확인한다.
const sample = (): Blueprint => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const node = (bp: Blueprint, id: string) => bp.nodes.find((n) => n.id === id)!;
// 서버 렌더링은 이어진 글자 사이에 <!-- -->를 끼우므로(`{label} 추가` → `책임<!-- --> 추가`) 비교 전에 뺀다. 화면의 글자는 같다
const render = (bp: Blueprint | null, ui: ReactNode) => renderToString(<StructureStoreProvider init={{ blueprint: bp, savedInput: null }}>{ui}</StructureStoreProvider>).replaceAll("<!-- -->", "");
const react = (): Blueprint => {
  const bp = sample();
  return { ...bp, stack: { ...bp.stack, framework: "react" }, nodes: bp.nodes.map((n) => ({ ...n, renderMode: null })) };
};

describe("BasicSection", () => {
  it("Next.js 컴포넌트는 이름·종류·파일 위치·렌더링 방식을 보인다. FSD 형식 안내가 있다", () => {
    const bp = sample();
    const html = render(bp, <BasicSection bp={bp} node={node(bp, "n-info")} />);
    for (const t of ["이름", "종류", "파일 위치", "렌더링 방식", "계층/슬라이스/세그먼트", 'value="ProductInfo"', 'value="widgets/product-info/ui"']) expect(html).toContain(t);
  });
  it("Next.js가 아니면 렌더링 방식을 숨긴다", () => {
    const bp = react();
    expect(render(bp, <BasicSection bp={bp} node={node(bp, "n-info")} />)).not.toContain("렌더링 방식");
  });
  it("훅은 렌더링 방식을 숨기고 종류 변경 대신 안내를 보인다", () => {
    const bp = sample();
    const html = render(bp, <BasicSection bp={bp} node={node(bp, "n-use-cart")} />);
    expect(html).not.toContain("렌더링 방식");
    expect(html).toContain("새 노드로 추가하세요");
  });
  it("AI가 가정한 필드에만 AI 가정 표시가 붙는다", () => {
    const bp = sample();
    expect(render(bp, <RoleSection node={node(bp, "n-review")} />)).toContain("AI 가정");
    expect(render(bp, <RoleSection node={node(bp, "n-info")} />)).not.toContain("AI 가정");
  });
});

describe("RoleSection", () => {
  it("책임은 최대 5개 안내와 추가 버튼, 행마다 이름표와 삭제 버튼이 있다", () => {
    const bp = sample();
    const html = render(bp, <RoleSection node={node(bp, "n-review")} />);
    for (const t of ["최대 5개", "책임 추가", 'aria-label="책임 1"', 'aria-label="책임 1 삭제"', "상태 추가", "prop 추가", "이벤트 추가", "API 호출 책임이 있음"]) expect(html).toContain(t);
  });
  it("책임이 5개면 추가 버튼이 비활성이다", () => {
    const bp = sample();
    const full = { ...node(bp, "n-info"), responsibilities: ["a", "b", "c", "d", "e"] };
    // 버튼 클래스에 'disabled:' 변형이 들어 있어 속성(disabled="")만 찾는다
    const disabledAdd = /<button[^>]*\sdisabled=""[^>]*>책임 추가<\/button>/;
    expect(render(bp, <RoleSection node={full} />)).toMatch(disabledAdd);
    const four = { ...node(bp, "n-info"), responsibilities: ["a", "b", "c", "d"] };
    expect(render(bp, <RoleSection node={four} />)).toContain("책임 추가");
    expect(render(bp, <RoleSection node={four} />)).not.toMatch(disabledAdd);
  });
  it("훅은 이벤트 목록을 숨긴다", () => {
    const bp = sample();
    expect(render(bp, <RoleSection node={node(bp, "n-use-cart")} />)).not.toContain("이벤트 추가");
  });
  it("상태·props 행은 칸마다 이름표를 가진다", () => {
    const bp = sample();
    const html = render(bp, <RoleSection node={node(bp, "n-gallery")} />);
    expect(html).toContain('aria-label="prop 1 이름"');
    expect(html).toContain('aria-label="prop 1 타입"');
  });
});

describe("LayoutSection", () => {
  it("grid는 열 수와 반응형 열 수를 보이고 방향은 숨긴다", () => {
    const bp = sample();
    const html = render(bp, <LayoutSection bp={bp} node={node(bp, "n-page")} parent={undefined} />);
    for (const t of ["배치 방식", "열 수", "태블릿 열 수", "모바일 열 수", "간격 토큰", "교차축 정렬"]) expect(html).toContain(t);
    expect(html).not.toContain("방향");
    expect(html).not.toContain("주축 정렬");
  });
  it("flex는 방향·주축 정렬·반응형 방향을 보이고 열 수는 숨긴다", () => {
    const bp = sample();
    const html = render(bp, <LayoutSection bp={bp} node={node(bp, "n-info")} parent={node(bp, "n-page")} />);
    for (const t of ["방향", "주축 정렬", "태블릿 방향", "모바일 방향"]) expect(html).toContain(t);
    expect(html).not.toContain("열 수");
  });
  it("배치가 없는 노드는 배치 방식만 보인다", () => {
    const bp = sample();
    const html = render(bp, <LayoutSection bp={bp} node={node(bp, "n-price")} parent={node(bp, "n-info")} />);
    expect(html).toContain("배치 방식");
    expect(html).not.toContain("간격 토큰");
    expect(html).not.toContain("반응형");
  });
  it("자식이 있는 노드는 '지정 안 함'을 고를 수 없다는 안내를 보인다", () => {
    const bp = sample();
    expect(render(bp, <LayoutSection bp={bp} node={node(bp, "n-info")} parent={node(bp, "n-page")} />)).toContain("자식 노드가 있어");
  });
  it("차지 칸은 부모가 grid일 때만 보이고 부모 열 수를 안내한다", () => {
    const bp = sample();
    const inGrid = render(bp, <LayoutSection bp={bp} node={node(bp, "n-gallery")} parent={node(bp, "n-page")} />);
    expect(inGrid).toContain("차지 칸");
    expect(inGrid).toContain("부모는 2열 그리드입니다");
    expect(render(bp, <LayoutSection bp={bp} node={node(bp, "n-price")} parent={node(bp, "n-info")} />)).not.toContain("차지 칸");
    expect(render(bp, <LayoutSection bp={bp} node={node(bp, "n-page")} parent={undefined} />)).not.toContain("차지 칸");
  });
});

describe("StyleSection", () => {
  it("속성 행과 바깥 여백 체크 상자를 보인다", () => {
    const bp = sample();
    const html = render(bp, <StyleSection bp={bp} node={node(bp, "n-price")} />);
    for (const t of ['aria-label="속성 1 속성"', 'value="color"', 'value="color.primary"', "디자인 토큰 값", "바깥 여백", "속성 추가", "배치 구역"]) expect(html).toContain(t);
  });
  it("스타일이 없는 노드도 그려진다", () => {
    const bp = sample();
    const html = render(bp, <StyleSection bp={bp} node={{ ...node(bp, "n-price"), style: null }} />);
    expect(html).toContain("속성 추가");
    expect(html).toContain("없음");
  });
});

describe("NodeEditPanel 안내 문구", () => {
  it("설계도가 없으면 안내만 보인다", () => {
    expect(render(null, <NodeEditPanel />)).toContain("아직 설계도가 없습니다");
  });
  it("노드를 고르지 않았으면 선택 안내를 보인다", () => {
    expect(render(sample(), <NodeEditPanel />)).toContain("노드를 선택하면 여기에서 고칠 수 있습니다");
  });
});
