import { describe, expect, it } from "vitest";
import { readCodeModel } from "../code-model/facts";
import { AI_LIMITS, buildAiInput, extractSnippet, isEmptyAiInput } from "./ai-input";
import { loadBlueprint, loadCode } from "./load-fixture";
import { checkImplementation } from "./run";
import type { UnitRef } from "./types";

// AI에 보낼 대상 고르기: 확인 필요 짝 후보와 책임만, 함수 조각만, 상한(컴포넌트당 4,000자·합계 30,000자·12개)

const setup = (name: string) => {
  const bp = loadBlueprint("next", name);
  const files = loadCode("next", name);
  return { bp, files, pairing: checkImplementation(bp, readCodeModel(files)).pairing };
};
const unit = (path: string, name: string, over: Partial<UnitRef> = {}): UnitRef => ({ path, name, kind: "component", exported: true, nameSource: "declared", ...over });

describe("보낼 대상(renamed 시험 데이터)", () => {
  const { bp, files, pairing } = setup("renamed");
  const input = buildAiInput(bp, pairing, files);

  it("짝 제안은 확인 필요 노드와 후보 코드만: ProductGallery ↔ ItemImages", () => {
    expect(input.pairTasks).toEqual([
      { nodeId: "n-gallery", nodeName: "ProductGallery", nodeKind: "presentational", responsibilities: ["상품 이미지 목록 표시"], props: ["images"], candidates: [{ path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages" }] },
    ]);
  });

  it("책임 제안은 확실한 짝이 있고 책임이 적힌 노드만(확인 필요 노드 ProductGallery는 빠짐)", () => {
    expect(input.responsibilityTasks.map((t) => t.nodeName).sort()).toEqual(["AddToCartButton", "OptionSelector", "PriceTag", "ProductDetailPage", "ProductInfo", "ReviewSummary", "useCart"]);
    expect(input.responsibilityTasks.some((t) => t.nodeId === "n-gallery")).toBe(false);
    expect(input.omitted).toEqual({ pairNodes: [], responsibilityNodes: [] });
  });

  it("보내는 코드는 대상 컴포넌트·훅의 선언 부분뿐이다(import·다른 파일 내용 없음), 상한 안", () => {
    expect(input.units).toHaveLength(8);
    for (const u of input.units) {
      expect(u.snippet).not.toMatch(/^import /m);
      expect(u.snippet).toContain(u.name);
      expect(u.snippet.length).toBeLessThanOrEqual(AI_LIMITS.perUnitChars);
    }
    expect(input.units.reduce((n, u) => n + u.snippet.length, 0)).toBeLessThanOrEqual(AI_LIMITS.totalChars);
    // 확인 필요 쪽(짝 후보) 조각이 먼저 들어간다
    expect(input.units[0].name).toBe("ItemImages");
  });

  it("같은 입력이면 같은 결과", () => {
    expect(buildAiInput(bp, pairing, files)).toEqual(input);
  });

  it("고칠 것이 없어도(correct) 책임 제안 대상은 있고 짝 제안은 없다", () => {
    const c = setup("correct");
    const i = buildAiInput(c.bp, c.pairing, c.files);
    expect(i.pairTasks).toEqual([]);
    expect(i.responsibilityTasks.length).toBeGreaterThan(0);
    expect(isEmptyAiInput(i)).toBe(false);
  });
});

describe("상한: 넘치는 대상은 통째로 빼고 생략으로 적는다(짝 제안 우선)", () => {
  const { bp, files, pairing } = setup("renamed");

  it("조각 개수 상한: 2개면 짝 후보 1개 + 책임 1건만, 나머지 책임 노드는 생략", () => {
    const i = buildAiInput(bp, pairing, files, { ...AI_LIMITS, maxUnits: 2 });
    expect(i.pairTasks).toHaveLength(1);
    expect(i.responsibilityTasks).toHaveLength(1);
    expect(i.units).toHaveLength(2);
    expect(i.omitted.responsibilityNodes).toHaveLength(6);
  });

  it("합계 상한이 짝 후보 조각보다 작으면 짝 제안도 생략한다", () => {
    const i = buildAiInput(bp, pairing, files, { ...AI_LIMITS, totalChars: 10 });
    expect(i.pairTasks).toEqual([]);
    expect(i.omitted.pairNodes).toEqual(["ProductGallery"]);
    expect(isEmptyAiInput(i)).toBe(true);
  });
});

describe("함수 조각 잘라 내기", () => {
  const files = [
    {
      path: "src/A.tsx",
      content: [
        'import { x } from "./x";',
        "const SECRET_OTHER = 1;",
        "export function Alpha() { return <div>{x}</div>; }",
        "export const Beta = ({ a }: { a: string }) => <p>{a}</p>;",
        "export const Gamma = memo(function Gamma() { return null; });",
        "class Delta extends React.Component { render() { return null; } }",
      ].join("\n"),
    },
    { path: "src/product-card.tsx", content: "export default function () { return <article />; }" },
    { path: "src/big.tsx", content: `export function Big() { return "${"x".repeat(5000)}"; }` },
  ];

  it("function·const 화살표·memo로 감싼 것·class를 찾고, 다른 선언·import는 넣지 않는다", () => {
    expect(extractSnippet(files, unit("src/A.tsx", "Alpha"))?.snippet).toBe("export function Alpha() { return <div>{x}</div>; }");
    expect(extractSnippet(files, unit("src/A.tsx", "Beta"))?.snippet).toBe("export const Beta = ({ a }: { a: string }) => <p>{a}</p>;");
    expect(extractSnippet(files, unit("src/A.tsx", "Gamma"))?.snippet).toContain("memo(function Gamma()");
    expect(extractSnippet(files, unit("src/A.tsx", "Delta"))?.snippet).toContain("class Delta");
    for (const n of ["Alpha", "Beta", "Gamma", "Delta"]) expect(extractSnippet(files, unit("src/A.tsx", n))?.snippet).not.toContain("SECRET_OTHER");
  });

  it("이름 없는 기본 내보내기(파일 이름에서 가져온 이름)는 export default 선언을 쓴다", () => {
    expect(extractSnippet(files, unit("src/product-card.tsx", "ProductCard", { nameSource: "file" }))?.snippet).toBe("export default function () { return <article />; }");
  });

  it("4,000자를 넘으면 자르고 잘렸다고 표시한다. 찾지 못하면 null(보내지 않음)", () => {
    const big = extractSnippet(files, unit("src/big.tsx", "Big"));
    expect(big?.truncated).toBe(true);
    expect(big?.snippet.startsWith("export function Big()")).toBe(true);
    expect(big?.snippet).toContain("…(4,000자를 넘어 잘림)");
    expect(extractSnippet(files, unit("src/A.tsx", "Nope"))).toBeNull();
    expect(extractSnippet(files, unit("src/none.tsx", "Alpha"))).toBeNull();
  });
});
