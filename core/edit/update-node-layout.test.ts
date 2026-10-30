import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema, type Blueprint } from "../schema/blueprint";
import { changeDisplay, emptyStyle } from "./layout";
import { updateNode } from "./update-node";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const node = (bp: Blueprint, id: string) => bp.nodes.find((n) => n.id === id)!;
const must = (r: ReturnType<typeof updateNode>) => {
  if (!r.ok) throw new Error(r.reason);
  return r.blueprint;
};
const withNode = (bp: Blueprint, id: string, patch: Partial<Blueprint["nodes"][number]>): Blueprint => ({
  ...bp,
  nodes: bp.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
});

// 샘플: n-page는 2열 grid(반응형 모바일 1열), 자식 n-review는 placement full, n-info·n-option은 flex
describe("배치(layout)", () => {
  it("간격·정렬을 바꾼다", () => {
    const bp = sample();
    const out = node(must(updateNode(bp, "n-page", { layout: { ...node(bp, "n-page").layout!, gap: "spacing.8", align: "center" } })), "n-page");
    expect(out.layout).toMatchObject({ gap: "spacing.8", align: "center", display: "grid", columns: 2 });
  });

  it("flex에 direction이 없으면 direction 칸에 오류를 연결한다", () => {
    expect(updateNode(sample(), "n-page", { layout: { display: "flex", gap: null } })).toMatchObject({ ok: false, nodeId: "n-page", path: ["layout", "direction"] });
  });

  it("반응형 값도 display 규칙을 따른다(grid에 direction 금지)", () => {
    const bp = sample();
    const r = updateNode(bp, "n-page", { layout: { ...node(bp, "n-page").layout!, responsive: [{ breakpoint: "tablet", direction: "row" }] } });
    expect(r).toMatchObject({ ok: false, path: ["layout", "responsive", 0, "direction"] });
  });

  it("훅에는 layout을 둘 수 없다", () => {
    expect(updateNode(sample(), "n-use-cart", { layout: { display: "block", gap: null } })).toMatchObject({ ok: false, path: ["layout"] });
  });

  it("자식이 있는 노드의 layout을 null로 만들 수 없다", () => {
    expect(updateNode(sample(), "n-page", { layout: null })).toMatchObject({ ok: false, path: ["layout"] });
  });

  describe("display 전환", () => {
    it("grid → flex: 방향 기본값 row, 열 수·반응형 제거, 간격 유지, 자식 차지 칸 비움", () => {
      const bp = sample();
      expect(node(bp, "n-review").placement).toEqual({ span: "full" });
      const out = must(changeDisplay(bp, "n-page", "flex"));
      expect(node(out, "n-page").layout).toEqual({ display: "flex", direction: "row", gap: "spacing.6", align: "start" }); // 간격·정렬은 유지, columns·responsive는 없다
      expect(out.nodes.filter((n) => n.parentId === "n-page").every((n) => n.placement === null)).toBe(true);
    });

    it("grid → block도 열 수·반응형을 버리고 자식 차지 칸을 비운다", () => {
      const bp = sample();
      const out = must(changeDisplay(bp, "n-page", "block"));
      expect(node(out, "n-page").layout).toEqual({ display: "block", gap: "spacing.6", align: "start" });
      expect(node(out, "n-review").placement).toBeNull();
    });

    it("flex → grid: 열 수 기본값 2, 방향 제거", () => {
      const out = must(changeDisplay(sample(), "n-info", "grid"));
      expect(node(out, "n-info").layout).toMatchObject({ display: "grid", columns: 2 });
      expect(node(out, "n-info").layout).not.toHaveProperty("direction");
    });

    it("같은 display면 설계도를 그대로 돌려준다(반응형도 유지)", () => {
      const bp = sample();
      expect(changeDisplay(bp, "n-page", "grid")).toEqual({ ok: true, blueprint: bp });
    });

    it("다른 노드 아래의 차지 칸은 건드리지 않는다", () => {
      const bp = withNode(withNode(sample(), "n-option", { layout: { display: "grid", columns: 2, gap: null } }), "n-gallery", { placement: { span: 1 } });
      // n-gallery는 n-page(grid) 자식이고, 여기서는 n-option이 아닌 n-info의 display만 바꾼다
      expect(node(must(changeDisplay(bp, "n-info", "block")), "n-gallery").placement).toEqual({ span: 1 });
    });

    it("노드가 없으면 거부한다", () => {
      expect(changeDisplay(sample(), "nope", "flex").ok).toBe(false);
    });
  });

  describe("열 수", () => {
    it("자식 span이 새 열 수보다 크면 거부하고 자식 이름을 알린다", () => {
      const bp = withNode(sample(), "n-gallery", { placement: { span: 2 } });
      const r = updateNode(bp, "n-page", { layout: { ...node(bp, "n-page").layout!, columns: 1 } });
      expect(r).toMatchObject({ ok: false, nodeId: "n-page", path: ["layout", "columns"] });
      if (!r.ok) expect(r.reason).toContain("ProductGallery");
    });
    it("자식 차지 칸이 모두 full이면 열 수를 줄일 수 있다", () => {
      const bp = sample();
      const out = must(updateNode(bp, "n-page", { layout: { ...node(bp, "n-page").layout!, columns: 1, responsive: undefined } }));
      expect(node(out, "n-page").layout!.columns).toBe(1);
    });
  });
});

describe("차지 칸(placement)", () => {
  it("grid 부모 아래에서 숫자·full·null로 바꾼다", () => {
    expect(node(must(updateNode(sample(), "n-gallery", { placement: { span: 2 } })), "n-gallery").placement).toEqual({ span: 2 });
    expect(node(must(updateNode(sample(), "n-gallery", { placement: { span: "full" } })), "n-gallery").placement).toEqual({ span: "full" });
    expect(node(must(updateNode(sample(), "n-review", { placement: null })), "n-review").placement).toBeNull();
  });
  it("부모 열 수보다 큰 숫자는 거부한다", () => {
    expect(updateNode(sample(), "n-gallery", { placement: { span: 3 } })).toMatchObject({ ok: false, nodeId: "n-gallery", path: ["placement", "span"] });
  });
  it("0이나 13 같은 범위 밖 값은 거부한다", () => {
    expect(updateNode(sample(), "n-gallery", { placement: { span: 0 } }).ok).toBe(false);
    expect(updateNode(sample(), "n-gallery", { placement: { span: 13 } }).ok).toBe(false);
  });
  it("부모가 grid가 아니면 거부한다", () => {
    expect(updateNode(sample(), "n-price", { placement: { span: 1 } })).toMatchObject({ ok: false, nodeId: "n-price", path: ["placement"] });
  });
});

describe("스타일(style)", () => {
  const props = (bp: Blueprint) => node(bp, "n-price").style!.properties;

  it("속성을 추가·삭제한다", () => {
    const bp = sample();
    const style = node(bp, "n-price").style!;
    const added = must(updateNode(bp, "n-price", { style: { ...style, properties: [...style.properties, { property: "opacity", value: "0.5", isToken: false }] } }));
    expect(props(added).at(-1)).toEqual({ property: "opacity", value: "0.5", isToken: false });
    const removed = must(updateNode(added, "n-price", { style: { ...node(added, "n-price").style!, properties: [] } }));
    expect(props(removed)).toEqual([]);
  });
  it("배치 속성은 거부하고 그 줄에 연결한다", () => {
    const bp = sample();
    const style = node(bp, "n-price").style!;
    const i = style.properties.length;
    const r = updateNode(bp, "n-price", { style: { ...style, properties: [...style.properties, { property: "gap", value: "8px", isToken: false }] } });
    expect(r).toMatchObject({ ok: false, nodeId: "n-price", path: ["style", "properties", i, "property"] });
  });
  it("같은 속성의 중복·kebab-case가 아닌 이름은 거부한다", () => {
    const bp = sample();
    const style = node(bp, "n-price").style!;
    expect(updateNode(bp, "n-price", { style: { ...style, properties: [...style.properties, { ...style.properties[0] }] } }).ok).toBe(false);
    expect(updateNode(bp, "n-price", { style: { ...style, properties: [{ property: "fontSize", value: "1rem", isToken: false }] } }).ok).toBe(false);
  });
  it("바깥 여백 소유 여부를 바꾼다", () => {
    const bp = sample();
    const style = node(bp, "n-price").style!;
    expect(node(must(updateNode(bp, "n-price", { style: { ...style, ownsOuterSpacing: true } })), "n-price").style!.ownsOuterSpacing).toBe(true);
  });
  it("훅에는 스타일을 둘 수 없다", () => {
    expect(updateNode(sample(), "n-use-cart", { style: emptyStyle("tailwind") })).toMatchObject({ ok: false, path: ["style"] });
  });
  it("emptyStyle의 scope는 스타일 방식을 따른다", () => {
    expect(emptyStyle("css").scope).toBe("global");
    expect(emptyStyle("css-modules").scope).toBe("module");
    expect(emptyStyle("tailwind")).toEqual({ scope: "utility", properties: [], ownsOuterSpacing: false });
  });
  it("스타일이 null인 노드에 emptyStyle로 시작해 속성을 추가할 수 있다", () => {
    const bp = withNode(sample(), "n-price", { style: null });
    const out = must(updateNode(bp, "n-price", { style: { ...emptyStyle(bp.stack.styling), properties: [{ property: "color", value: "#333", isToken: false }] } }));
    expect(node(out, "n-price").style).toMatchObject({ scope: "module", properties: [{ property: "color" }] });
  });
});
