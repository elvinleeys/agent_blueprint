import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema, type Blueprint, type ComponentNode } from "../schema/blueprint";
import { addChild } from "./add-child";
import { deleteNode } from "./delete-node";
import { changeDisplay, displayChangeImpact } from "./layout";
import { moveNode } from "./move-node";
import { reorderNode } from "./reorder-node";
import { kidsOf } from "./structure-utils";
import { updateNode } from "./update-node";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const node = (bp: Blueprint, id: string) => bp.nodes.find((n) => n.id === id)!;
const must = (r: { ok: boolean; reason?: string; blueprint?: Blueprint }) => {
  if (!r.ok) throw new Error(r.reason);
  return r.blueprint!;
};
const kidNames = (bp: Blueprint, pid: string) => kidsOf(bp.nodes, pid).map((n) => n.name);
const orders = (bp: Blueprint, pid: string) => kidsOf(bp.nodes, pid).map((n) => n.order);
const withNode = (bp: Blueprint, id: string, patch: Partial<ComponentNode>): Blueprint => ({ ...bp, nodes: bp.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });

// 샘플: n-page(2열 grid) ─ ProductGallery 0, ProductInfo(n-info, flex) 1, ReviewSummary 2(full)
//       n-info ─ PriceTag 0, OptionSelector 1, AddToCartButton 2, useCart(훅) 3. n-price·n-gallery의 layout은 null

describe("moveNode", () => {
  it("새 부모의 마지막 자리로 옮기고 옛 부모의 형제 order를 다시 매긴다", () => {
    const out = must(moveNode(sample(), "n-price", "n-page"));
    expect(node(out, "n-price").parentId).toBe("n-page");
    expect(kidNames(out, "n-page")).toEqual(["ProductGallery", "ProductInfo", "ReviewSummary", "PriceTag"]);
    expect(orders(out, "n-page")).toEqual([0, 1, 2, 3]);
    expect(kidNames(out, "n-info")).toEqual(["OptionSelector", "AddToCartButton", "useCart"]);
    expect(orders(out, "n-info")).toEqual([0, 1, 2]);
    expect(out.generatedBy).toBe("user");
  });

  it("옛 부모의 order 틈(0,2,5)도 0부터 연속으로 다시 매긴다", () => {
    const gappy = withNode(withNode(sample(), "n-option", { order: 2 }), "n-cart-button", { order: 5 });
    const out = must(moveNode(gappy, "n-price", "n-page"));
    expect(orders(out, "n-info")).toEqual([0, 1, 2]);
  });

  it("하위 노드·location은 바꾸지 않고, 입력도 바꾸지 않는다", () => {
    const bp = sample();
    const before = JSON.stringify(bp);
    const out = must(moveNode(bp, "n-info", "n-gallery"));
    expect(JSON.stringify(bp)).toBe(before);
    expect(node(out, "n-info").location).toEqual(node(bp, "n-info").location);
    for (const id of ["n-price", "n-option", "n-cart-button", "n-use-cart"]) expect(node(out, id)).toEqual(node(bp, id));
  });

  it("새 부모가 grid가 아니면 차지 칸을 비운다", () => {
    const bp = withNode(sample(), "n-gallery", { placement: { span: 1 } });
    expect(node(must(moveNode(bp, "n-gallery", "n-info")), "n-gallery").placement).toBeNull();
  });

  it("새 부모가 grid이고 span이 열 수 이하면 차지 칸을 유지한다", () => {
    const grid = must(changeDisplay(sample(), "n-option", "grid")); // 2열
    const moved = must(moveNode(withNode(grid, "n-gallery", { placement: { span: 2 } }), "n-gallery", "n-option"));
    expect(node(moved, "n-gallery").placement).toEqual({ span: 2 });
  });

  it("새 부모 열 수보다 큰 span은 차지 칸을 비운다(그대로 두면 스키마가 거부한다)", () => {
    const grid = must(changeDisplay(sample(), "n-option", "grid")); // 2열
    const wide = { ...grid, nodes: grid.nodes.map((n) => (n.id === "n-page" ? { ...n, layout: { ...n.layout!, columns: 4 } } : n)) };
    const spanned = withNode(wide, "n-gallery", { placement: { span: 3 } });
    expect(node(must(moveNode(spanned, "n-gallery", "n-option")), "n-gallery").placement).toBeNull();
  });

  it("layout이 없는 새 부모에는 block을 채운다", () => {
    expect(node(must(moveNode(sample(), "n-gallery", "n-price")), "n-price").layout).toEqual({ display: "block", gap: null });
  });

  it("훅을 옮겨도 layout 없는 부모에 layout을 만들지 않는다", () => {
    const out = must(moveNode(sample(), "n-use-cart", "n-price"));
    expect(node(out, "n-price").layout).toBeNull();
    expect(node(out, "n-use-cart").parentId).toBe("n-price");
  });

  it("거부: 루트, 자기 자신, 자손, 훅 부모, 없는 노드·부모", () => {
    expect(moveNode(sample(), "n-page", "n-info")).toMatchObject({ ok: false });
    expect(moveNode(sample(), "n-info", "n-info")).toMatchObject({ ok: false, path: ["parentId"] });
    expect(moveNode(sample(), "n-info", "n-price")).toMatchObject({ ok: false, path: ["parentId"] }); // 자손
    expect(moveNode(sample(), "n-price", "n-use-cart")).toMatchObject({ ok: false, path: ["parentId"] });
    expect(moveNode(sample(), "nope", "n-page").ok).toBe(false);
    expect(moveNode(sample(), "n-price", "nope").ok).toBe(false);
  });

  it("같은 부모로 옮기면 설계도를 그대로 돌려준다", () => {
    const bp = sample();
    expect(moveNode(bp, "n-price", "n-info")).toEqual({ ok: true, blueprint: bp });
  });
});

describe("reorderNode", () => {
  it("한 칸 위·아래로 옮기고 order를 0부터 연속으로 맞춘다", () => {
    const down = must(reorderNode(sample(), "n-price", "down"));
    expect(kidNames(down, "n-info")).toEqual(["OptionSelector", "PriceTag", "AddToCartButton", "useCart"]);
    expect(orders(down, "n-info")).toEqual([0, 1, 2, 3]);
    const up = must(reorderNode(down, "n-price", "up"));
    expect(kidNames(up, "n-info")).toEqual(["PriceTag", "OptionSelector", "AddToCartButton", "useCart"]);
  });
  it("order에 틈이 있어도 연속으로 정리한다", () => {
    const gappy = withNode(withNode(withNode(sample(), "n-option", { order: 4 }), "n-cart-button", { order: 9 }), "n-use-cart", { order: 12 });
    const out = must(reorderNode(gappy, "n-price", "down"));
    expect(kidNames(out, "n-info")).toEqual(["OptionSelector", "PriceTag", "AddToCartButton", "useCart"]);
    expect(orders(out, "n-info")).toEqual([0, 1, 2, 3]);
  });
  it("맨 위·맨 아래·루트는 거부한다", () => {
    expect(reorderNode(sample(), "n-price", "up")).toMatchObject({ ok: false, path: ["order"] });
    expect(reorderNode(sample(), "n-use-cart", "down")).toMatchObject({ ok: false, path: ["order"] });
    expect(reorderNode(sample(), "n-page", "down").ok).toBe(false);
  });
  it("다른 부모의 형제와 하위 노드는 바꾸지 않는다", () => {
    const bp = sample();
    const out = must(reorderNode(bp, "n-price", "down"));
    expect(kidNames(out, "n-page")).toEqual(kidNames(bp, "n-page"));
    expect(node(out, "n-info")).toEqual(node(bp, "n-info"));
  });
});

describe("addChild", () => {
  it("기본값으로 마지막 자리에 추가하고 selectId를 돌려준다", () => {
    const r = addChild(sample(), "n-info");
    expect(r.ok && r.selectId).toBeTruthy();
    const out = must(r);
    const added = node(out, r.ok ? r.selectId! : "");
    expect(added).toMatchObject({
      name: "NewComponent", parentId: "n-info", order: 4, kind: "presentational", dataFetch: false, assumed: false,
      responsibilities: [], state: [], props: [], events: [], layout: null, placement: null, style: null,
      location: { dir: node(sample(), "n-info").location.dir },
    });
    expect(kidNames(out, "n-info").at(-1)).toBe("NewComponent");
    expect(out.generatedBy).toBe("user");
  });
  it("이름이 겹치면 숫자를 붙이고 id도 겹치지 않는다", () => {
    const first = must(addChild(sample(), "n-page"));
    const second = addChild(first, "n-page");
    const out = must(second);
    expect(kidNames(out, "n-page").slice(-2)).toEqual(["NewComponent", "NewComponent2"]);
    expect(new Set(out.nodes.map((n) => n.id)).size).toBe(out.nodes.length);
  });
  it("Next.js: 조상(부모 포함) 중 client가 있으면 client, 없으면 server", () => {
    const renderOf = (parent: string) => {
      const r = addChild(sample(), parent);
      return node(must(r), r.ok ? r.selectId! : "").renderMode;
    };
    expect(renderOf("n-page")).toBe("server");
    expect(renderOf("n-gallery")).toBe("server");
    expect(renderOf("n-info")).toBe("client"); // 부모가 client
    expect(renderOf("n-price")).toBe("client"); // 조상이 client
    expect(renderOf("n-option")).toBe("client");
  });
  it("Next.js가 아니면 renderMode는 null", () => {
    const bp = sample();
    const react = { ...bp, stack: { ...bp.stack, framework: "react" as const }, nodes: bp.nodes.map((n) => ({ ...n, renderMode: null })) };
    const r = addChild(react, "n-page");
    expect(node(must(r), r.ok ? r.selectId! : "").renderMode).toBeNull();
  });
  it("layout이 없는 부모에는 block을 채운다", () => {
    expect(node(must(addChild(sample(), "n-price")), "n-price").layout).toEqual({ display: "block", gap: null });
  });
  it("훅과 없는 부모에는 추가할 수 없다", () => {
    expect(addChild(sample(), "n-use-cart")).toMatchObject({ ok: false });
    expect(addChild(sample(), "nope").ok).toBe(false);
  });
  it("order에 틈이 있어도 마지막 order 다음에 놓는다", () => {
    const gappy = withNode(sample(), "n-cart-button", { order: 9 });
    const r = addChild(gappy, "n-info");
    expect(node(must(r), r.ok ? r.selectId! : "").order).toBe(10);
  });
});

describe("deleteNode", () => {
  it("잎 노드를 삭제하고 형제 order를 다시 매긴다(mode 무시)", () => {
    for (const mode of ["cascade", "promote"] as const) {
      const out = must(deleteNode(sample(), "n-price", mode));
      expect(out.nodes.some((n) => n.id === "n-price")).toBe(false);
      expect(orders(out, "n-info")).toEqual([0, 1, 2]);
      expect(out.nodes).toHaveLength(sample().nodes.length - 1);
    }
  });
  it("성공하면 부모를 선택하도록 알린다", () => {
    const r = deleteNode(sample(), "n-price", "cascade");
    expect(r.ok && r.selectId).toBe("n-info");
  });
  it("cascade: 자손까지 모두 삭제한다", () => {
    const out = must(deleteNode(sample(), "n-info", "cascade"));
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["n-gallery", "n-page", "n-review"]);
    expect(kidNames(out, "n-page")).toEqual(["ProductGallery", "ReviewSummary"]);
    expect(orders(out, "n-page")).toEqual([0, 1]);
  });
  it("promote: 자식이 삭제된 노드 자리에 순서대로 들어간다", () => {
    const out = must(deleteNode(sample(), "n-info", "promote"));
    expect(kidNames(out, "n-page")).toEqual(["ProductGallery", "PriceTag", "OptionSelector", "AddToCartButton", "useCart", "ReviewSummary"]);
    expect(orders(out, "n-page")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.nodes.some((n) => n.id === "n-info")).toBe(false);
    expect(out.nodes).toHaveLength(sample().nodes.length - 1);
  });
  it("promote: 새 부모가 grid가 아니면 자식의 차지 칸을 비운다", () => {
    let bp = must(changeDisplay(sample(), "n-info", "grid"));
    bp = withNode(bp, "n-price", { placement: { span: 1 } });
    bp = must(changeDisplay(bp, "n-page", "flex")); // n-page는 flex가 되어 n-info의 자식이 옮겨 가도 차지 칸이 없다
    expect(node(bp, "n-price").placement).toEqual({ span: 1 });
    expect(node(must(deleteNode(bp, "n-info", "promote")), "n-price").placement).toBeNull();
  });
  it("promote: 새 부모가 grid면 열 수 이하 차지 칸은 유지하고 초과는 비운다", () => {
    let bp = must(changeDisplay(sample(), "n-info", "grid"));
    bp = must(updateNode(bp, "n-info", { layout: { ...node(bp, "n-info").layout!, columns: 3 } }));
    bp = withNode(withNode(bp, "n-price", { placement: { span: 2 } }), "n-option", { placement: { span: 3 } });
    const out = must(deleteNode(bp, "n-info", "promote")); // n-page는 2열
    expect(node(out, "n-price").placement).toEqual({ span: 2 });
    expect(node(out, "n-option").placement).toBeNull();
  });
  it("거부: 루트, 없는 노드", () => {
    expect(deleteNode(sample(), "n-page", "cascade")).toMatchObject({ ok: false });
    expect(deleteNode(sample(), "nope", "promote").ok).toBe(false);
  });
  it("입력을 바꾸지 않는다", () => {
    const bp = sample();
    const before = JSON.stringify(bp);
    deleteNode(bp, "n-info", "promote");
    deleteNode(bp, "n-info", "cascade");
    expect(JSON.stringify(bp)).toBe(before);
  });
});

describe("displayChangeImpact", () => {
  it("grid를 벗어나면 차지 칸이 있는 자식 수와 반응형 유무를 알려 준다", () => {
    expect(displayChangeImpact(sample(), "n-page", "flex")).toEqual({ placements: 1, responsive: true }); // ReviewSummary(full), 모바일 1열
  });
  it("차지 칸이 없고 반응형도 없으면 영향이 0이다", () => {
    expect(displayChangeImpact(sample(), "n-info", "grid")).toEqual({ placements: 0, responsive: false });
  });
  it("flex → block은 반응형만 영향이 있을 수 있다", () => {
    const bp = sample();
    const flex = withNode(bp, "n-info", { layout: { display: "flex", direction: "row", gap: null, responsive: [{ breakpoint: "mobile", direction: "column" }] } });
    expect(displayChangeImpact(flex, "n-info", "block")).toEqual({ placements: 0, responsive: true });
  });
  it("같은 display나 없는 노드는 null", () => {
    expect(displayChangeImpact(sample(), "n-page", "grid")).toBeNull();
    expect(displayChangeImpact(sample(), "nope", "grid")).toBeNull();
  });
});
