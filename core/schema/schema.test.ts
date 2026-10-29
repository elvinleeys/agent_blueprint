import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "./blueprint";
import { DesignSystemSpecSchema } from "./design-system";
import { SpecInputSchema } from "./spec-input";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- 테스트용 변형 편의

const load = (): Json =>
  JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"));

// 샘플을 복제해 변형한 뒤 실패해야 하는 케이스들
const invalid: [string, (b: Json) => void][] = [
  ["필수 필드 누락(title)", (b) => delete b.title],
  ["잘못된 enum(framework)", (b) => (b.stack.framework = "vue")],
  ["루트 2개", (b) => (b.nodes[1].parentId = null)],
  ["존재하지 않는 parentId", (b) => (b.nodes[1].parentId = "nope")],
  ["name 중복", (b) => (b.nodes[1].name = b.nodes[0].name)],
  ["id 중복", (b) => (b.nodes[1].id = b.nodes[0].id)],
  ["형제 order 겹침", (b) => (b.nodes[2].order = b.nodes[1].order)],
  ["컴포넌트 이름이 PascalCase 아님", (b) => (b.nodes[1].name = "productGallery")],
  ["훅에 style 지정", (b) => {
    b.nodes[1].kind = "hook";
    b.nodes[1].name = "useGallery";
  }],
  ["flex인데 direction 없음", (b) => (b.nodes[0].layout = { display: "flex", gap: null })],
  ["grid인데 columns 없음", (b) => delete b.nodes[0].layout.columns],
  ["style.properties에 배치 속성(gap)", (b) =>
    b.nodes[0].style.properties.push({ property: "gap", value: "spacing.4", isToken: true })],
  ["style.properties 중복", (b) =>
    b.nodes[0].style.properties.push({ ...b.nodes[0].style.properties[0] })],
  ["FSD 형식 아닌 dir", (b) => (b.nodes[1].location.dir = "components/ui")],
  ["dir이 슬래시로 시작", (b) => (b.nodes[1].location.dir = "/entities/product/ui")],
  ["비-next인데 renderMode 지정", (b) => (b.stack.framework = "react")],
  ["next인데 컴포넌트 renderMode null", (b) => (b.nodes[1].renderMode = null)],
  ["placement인데 부모가 grid 아님", (b) => {
    b.nodes[0].layout = { display: "block", gap: null };
    b.nodes[1].placement = { span: 1 };
  }],
  ["자식이 있는데 layout null", (b) => (b.nodes[0].layout = null)],
  ["입력 없음(hasSpec=false, imageCount=0)", (b) => (b.source = { hasSpec: false, imageCount: 0 })],
  ["imageCount 4", (b) => (b.source.imageCount = 4)],
  ["responsibilities 6개", (b) => (b.nodes[0].responsibilities = ["a", "b", "c", "d", "e", "f"])],
];

describe("BlueprintSchema", () => {
  it("sample-blueprint.json 통과", () => {
    const r = BlueprintSchema.safeParse(load());
    expect(r.success, JSON.stringify(r.error?.issues, null, 2)).toBe(true);
  });

  it.each(invalid)("거부: %s", (_name, mutate) => {
    const b = load();
    mutate(b);
    expect(BlueprintSchema.safeParse(b).success).toBe(false);
  });

  it("거부: 루트에서 닿지 않는 순환", () => {
    const b = load();
    const [x, y] = [b.nodes[1], b.nodes[2]];
    x.parentId = y.id;
    y.parentId = x.id;
    expect(BlueprintSchema.safeParse(b).success).toBe(false);
  });
});

describe("SpecInputSchema", () => {
  it("항목 1개만 있으면 통과", () => {
    expect(SpecInputSchema.safeParse({ version: "1.2", overview: "상품 상세", imageCount: 0 }).success).toBe(true);
  });
  it("이미지만 있어도 통과", () => {
    expect(SpecInputSchema.safeParse({ version: "1.2", imageCount: 1 }).success).toBe(true);
  });
  it("거부: 전부 비어 있고 imageCount 0", () => {
    expect(SpecInputSchema.safeParse({ version: "1.2", overview: " ", imageCount: 0 }).success).toBe(false);
  });
  it("거부: imageCount 4", () => {
    expect(SpecInputSchema.safeParse({ version: "1.2", overview: "x", imageCount: 4 }).success).toBe(false);
  });
});

describe("DesignSystemSpecSchema", () => {
  const ok = {
    version: "1.2",
    components: [{ name: "Button", variants: ["primary"], props: [{ name: "label", type: "string", required: true }] }],
    tokens: { colors: { primary: "#2563EB" }, spacing: { "4": "16px" } },
  };
  it("통과", () => expect(DesignSystemSpecSchema.safeParse(ok).success).toBe(true));
  it("거부: tokens.colors 누락", () =>
    expect(DesignSystemSpecSchema.safeParse({ ...ok, tokens: { spacing: {} } }).success).toBe(false));
  it("거부: prop required 누락", () =>
    expect(
      DesignSystemSpecSchema.safeParse({ ...ok, components: [{ name: "B", variants: [], props: [{ name: "a", type: "t" }] }] }).success,
    ).toBe(false));
});
