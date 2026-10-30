import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema, type ComponentNode } from "../schema/blueprint";
import { buildPreview, type PreviewBox } from "./preview";

const nodes = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"))).nodes;
const get = (b: PreviewBox, name: string): PreviewBox | undefined =>
  b.name === name ? b : b.children.map((c) => get(c, name)).find(Boolean);
const edit = (id: string, patch: Partial<ComponentNode>) => nodes().map((n) => (n.id === id ? { ...n, ...patch } : n));

describe("buildPreview — 샘플 설계도", () => {
  it("데스크톱: 페이지는 2열 grid, 리뷰는 전체 줄, 정보는 세로 flex", () => {
    const { root } = buildPreview(nodes(), "desktop")!;
    expect(root).toMatchObject({ name: "ProductDetailPage", display: "grid", columns: 2, gap: 6, layoutLabel: "grid 2열", align: "start" });
    expect(root.children.map((c) => c.name)).toEqual(["ProductGallery", "ProductInfo", "ReviewSummary"]);
    expect(get(root, "ReviewSummary")).toMatchObject({ span: "full", placementLabel: "전체 줄" });
    expect(get(root, "ProductGallery")).toMatchObject({ display: null, span: null, layoutLabel: "" }); // 단말, placement 없음
    expect(get(root, "ProductInfo")).toMatchObject({ display: "flex", direction: "column", gap: 4, layoutLabel: "flex 세로", align: "stretch" });
  });

  it("모바일: responsive mobile 오버라이드로 1열이 된다", () => {
    const { root } = buildPreview(nodes(), "mobile")!;
    expect(root).toMatchObject({ columns: 1, layoutLabel: "grid 1열" });
    expect(get(root, "ProductInfo")).toMatchObject({ direction: "column" }); // 오버라이드가 없는 노드는 그대로
  });

  it("훅은 상자로 그리지 않고 목록으로 분리한다(부모 이름, dataFetch)", () => {
    const { root, hooks } = buildPreview(nodes(), "desktop")!;
    expect(get(root, "useCart")).toBeUndefined();
    expect(hooks).toEqual([{ id: "n-use-cart", name: "useCart", parentName: "ProductInfo", dataFetch: true }]);
  });

  it("자식 없는 노드는 layout이 있어도 안쪽을 그리지 않고 배치 방식만 라벨로 둔다", () => {
    const opt = get(buildPreview(nodes(), "desktop")!.root, "OptionSelector")!;
    expect(opt).toMatchObject({ children: [], display: "flex", direction: "row", layoutLabel: "flex 가로", gap: 2 });
  });
});

describe("buildPreview — 변환 규칙", () => {
  it("형제는 order 순서로 놓는다", () => {
    const reordered = nodes().map((n) => (n.id === "n-gallery" ? { ...n, order: 5 } : n));
    expect(buildPreview(reordered, "desktop")!.root.children.map((c) => c.name)).toEqual(["ProductInfo", "ReviewSummary", "ProductGallery"]);
  });

  it("반응형은 데스크톱 우선: 모바일은 tablet → mobile 순서로 덮어쓰고, 데스크톱은 desktop만 적용한다", () => {
    const layout = {
      display: "grid" as const,
      columns: 4,
      gap: null,
      responsive: [
        { breakpoint: "tablet" as const, columns: 2 },
        { breakpoint: "mobile" as const, columns: 1 },
        { breakpoint: "desktop" as const, columns: 6 },
      ],
    };
    const n = edit("n-page", { layout });
    expect(buildPreview(n, "desktop")!.root.columns).toBe(6);
    expect(buildPreview(n, "mobile")!.root.columns).toBe(1);
    const tabletOnly = edit("n-page", { layout: { ...layout, responsive: [{ breakpoint: "tablet", columns: 2 }] } });
    expect(buildPreview(tabletOnly, "mobile")!.root.columns).toBe(2); // 모바일은 tablet 값을 이어받는다
    expect(buildPreview(tabletOnly, "desktop")!.root.columns).toBe(4);
  });

  it("flex는 direction만 오버라이드한다", () => {
    const flex = edit("n-info", { layout: { display: "flex", direction: "column", gap: "spacing.4", responsive: [{ breakpoint: "mobile", direction: "row" }] } });
    expect(get(buildPreview(flex, "mobile")!.root, "ProductInfo")).toMatchObject({ direction: "row", layoutLabel: "flex 가로" });
  });

  it("열이 줄어든 보기에서 열 수보다 큰 span은 열 수로 줄인다", () => {
    const n = nodes().map((x) => (x.id === "n-gallery" ? { ...x, placement: { span: 2 } } : x));
    expect(get(buildPreview(n, "desktop")!.root, "ProductGallery")).toMatchObject({ span: 2, placementLabel: "2칸" });
    expect(get(buildPreview(n, "mobile")!.root, "ProductGallery")).toMatchObject({ span: 1, placementLabel: "1칸" });
  });

  it("placement는 부모가 grid일 때만 쓴다", () => {
    const n = nodes().map((x) => (x.id === "n-price" ? { ...x, placement: { span: 2 } } : x)); // 부모(ProductInfo)는 flex
    expect(get(buildPreview(n, "desktop")!.root, "PriceTag")).toMatchObject({ span: null, placementLabel: null });
  });

  it.each([
    ["spacing.6", 6, false],
    ["spacing.0", 0, false],
    ["spacing.16", 12, false], // 12 초과는 12로
    ["spacing.md", 4, true],
    ["gap.4", 4, true],
    [null, 0, false],
  ])("gap %j → %i단계(추정 %s)", (token, step, estimated) => {
    const n = edit("n-page", { layout: { display: "grid", columns: 2, gap: token } });
    expect(buildPreview(n, "desktop")!.root).toMatchObject({ gap: step, gapEstimated: estimated });
  });

  it("그려지는 자식이 있는데 layout이 없으면 block으로 쌓고 표시한다(검증을 통과하지 못한 입력 방어)", () => {
    const n = edit("n-info", { layout: null });
    expect(get(buildPreview(n, "desktop")!.root, "ProductInfo")).toMatchObject({ display: "block", layoutMissing: true });
  });

  it("루트가 하나가 아니면 null", () => {
    expect(buildPreview([], "desktop")).toBeNull();
  });

  it("입력 노드를 바꾸지 않는다", () => {
    const n = nodes();
    const before = JSON.stringify(n);
    buildPreview(n, "mobile");
    expect(JSON.stringify(n)).toBe(before);
  });
});
