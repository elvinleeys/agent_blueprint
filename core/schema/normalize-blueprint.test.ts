import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "./blueprint";
import { normalizeBlueprint } from "./normalize-blueprint";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- 테스트용 변형 편의

const sample = (): Json => JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"));
const find = (b: Json, name: string): Json => b.nodes.find((n: Json) => n.name === name);
const issuePaths = (b: unknown) => {
  const r = BlueprintSchema.safeParse(b);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("normalizeBlueprint — 보정", () => {
  it("올바른 설계도는 바꾸지 않고 내역도 없다", () => {
    const b = sample();
    const r = normalizeBlueprint(b);
    expect(r.changes).toEqual([]);
    expect(r.blueprint).toEqual(b);
  });

  it("입력 객체는 변경하지 않는다", () => {
    const b = sample();
    find(b, "ProductDetailPage").layout.direction = "column";
    const before = JSON.stringify(b);
    normalizeBlueprint(b);
    expect(JSON.stringify(b)).toBe(before);
  });

  it("grid의 layout.direction을 제거하고 노드 id·경로·내용을 기록한다", () => {
    const b = sample();
    find(b, "ProductDetailPage").layout.direction = "column";
    expect(issuePaths(b)).toContain("nodes.0.layout.direction");

    const r = normalizeBlueprint(b);
    expect(r.changes).toEqual([
      { nodeId: "n-page", path: "layout.direction", detail: "grid에는 direction을 쓸 수 없어 제거(값: column)" },
    ]);
    expect(BlueprintSchema.safeParse(r.blueprint).success).toBe(true);
  });

  it("grid의 responsive 항목에서 direction을 제거한다", () => {
    const b = sample();
    find(b, "ProductDetailPage").layout.responsive = [{ breakpoint: "mobile", direction: "column" }];
    const r = normalizeBlueprint(b);
    expect(r.changes).toEqual([
      expect.objectContaining({ nodeId: "n-page", path: "layout.responsive.0.direction" }),
    ]);
    expect(BlueprintSchema.safeParse(r.blueprint).success).toBe(true);
  });

  it("flex의 columns를 layout과 responsive 모두에서 제거한다", () => {
    const b = sample();
    const info = find(b, "ProductInfo");
    expect(info.layout.display).toBe("flex");
    info.layout.columns = 2;
    info.layout.responsive = [{ breakpoint: "mobile", direction: "column", columns: 1 }];
    expect(issuePaths(b).length).toBeGreaterThan(0);

    const r = normalizeBlueprint(b);
    expect(r.changes.map((c) => c.path)).toEqual(["layout.columns", "layout.responsive.0.columns"]);
    expect(BlueprintSchema.safeParse(r.blueprint).success).toBe(true);
  });

  it("같은 부모 아래 order가 겹치면 (order, 원래 위치) 순으로 0부터 재정렬한다", () => {
    const b = sample();
    b.nodes[2].order = b.nodes[1].order; // 형제 둘의 order가 같음
    expect(issuePaths(b)).toContain("nodes.2.order");

    const r = normalizeBlueprint(b);
    const siblings = (r.blueprint as Json).nodes.filter((n: Json) => n.parentId === b.nodes[1].parentId);
    expect(siblings.map((n: Json) => n.order).sort()).toEqual(siblings.map((_: Json, i: number) => i));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ nodeId: b.nodes[2].id, path: "order" });
    expect(BlueprintSchema.safeParse(r.blueprint).success).toBe(true);
  });

  it("order는 겹친 형제 그룹만 고치고, 겹치지 않는 틈(0,2,5)은 그대로 둔다", () => {
    const b = sample();
    const sibs = b.nodes.filter((n: Json) => n.parentId === "n-page");
    sibs.forEach((n: Json, i: number) => (n.order = [0, 2, 5][i] ?? 9 + i));
    const r = normalizeBlueprint(b);
    expect(r.changes).toEqual([]);
  });

  it("겹침이 있으면 앞선 order가 먼저 자리를 잡는다 (1,1,0 → 0,1,2)", () => {
    const b = { nodes: [
      { id: "root", parentId: null, order: 0 },
      { id: "a", parentId: "root", order: 1 },
      { id: "b", parentId: "root", order: 1 },
      { id: "c", parentId: "root", order: 0 },
    ] };
    const r = normalizeBlueprint(b);
    const order = Object.fromEntries((r.blueprint as Json).nodes.map((n: Json) => [n.id, n.order]));
    expect(order).toEqual({ root: 0, c: 0, a: 1, b: 2 });
    expect(r.changes).toEqual([expect.objectContaining({ nodeId: "b", path: "order" })]);
  });
});

describe("normalizeBlueprint — 보정하지 않는 것", () => {
  const unchanged = (b: Json) => {
    const r = normalizeBlueprint(b);
    expect(r.changes).toEqual([]);
    expect(r.blueprint).toEqual(b);
    return r;
  };

  it("FSD location 형식 오류", () => {
    const b = sample();
    b.nodes[1].location.dir = "pages/product-detail/page";
    const r = unchanged(b);
    expect(issuePaths(r.blueprint)).toContain("nodes.1.location.dir");
  });

  it("이름 형식·중복", () => {
    const b = sample();
    b.nodes[1].name = "productGallery";
    b.nodes[2].name = b.nodes[3].name;
    const r = unchanged(b);
    expect(issuePaths(r.blueprint)).toEqual(["nodes.1.name", "nodes.3.name"]); // 중복은 나중에 나온 노드에서 보고된다
  });

  it("루트가 둘이면 order가 같아도 건드리지 않는다", () => {
    const b = sample();
    b.nodes[1].parentId = null;
    b.nodes[1].order = 0;
    const r = unchanged(b);
    expect(issuePaths(r.blueprint)).toContain("nodes");
  });

  it("block의 direction·columns는 범위 밖이라 그대로 둔다", () => {
    const b = sample();
    find(b, "ProductGallery").layout = { display: "block", direction: "row", gap: null };
    unchanged(b);
  });

  it("보정 가능한 오류와 불가능한 오류가 섞이면 가능한 것만 고치고 나머지는 남긴다", () => {
    const b = sample();
    find(b, "ProductDetailPage").layout.direction = "row";
    b.nodes[1].name = "productGallery";
    const r = normalizeBlueprint(b);
    expect(r.changes).toHaveLength(1);
    expect(issuePaths(r.blueprint)).toEqual(["nodes.1.name"]);
  });

  it.each([[null], ["x"], [[]], [{}], [{ nodes: "nope" }]])("객체가 아니거나 nodes가 배열이 아니면 그대로 돌려준다: %j", (input) => {
    expect(normalizeBlueprint(input)).toEqual({ blueprint: input, changes: [] });
  });

  it("노드 항목이 객체가 아니어도 던지지 않는다", () => {
    expect(() => normalizeBlueprint({ nodes: [null, 1, { id: "a", parentId: "x", order: 0 }] })).not.toThrow();
  });
});
