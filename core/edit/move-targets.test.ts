import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../schema/blueprint";
import { moveNode, moveTargets } from "./move-node";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const names = (id: string) => moveTargets(sample(), id).map((t) => t.node.name);

describe("moveTargets", () => {
  it("자기 자신·자손·훅을 빼고 트리 순서(위→아래, 형제는 order 순)로 돌려준다", () => {
    // ProductInfo의 자손(PriceTag·OptionSelector·AddToCartButton·useCart)과 자기 자신이 빠진다
    expect(names("n-info")).toEqual(["ProductDetailPage", "ProductGallery", "ReviewSummary"]);
    // PriceTag는 자기만 빠지고, 훅(useCart)도 뺀다
    expect(names("n-price")).toEqual(["ProductDetailPage", "ProductGallery", "ProductInfo", "OptionSelector", "AddToCartButton", "ReviewSummary"]);
  });

  it("depth는 루트가 0이다", () => {
    const t = moveTargets(sample(), "n-review");
    expect(t.find((x) => x.node.id === "n-page")!.depth).toBe(0);
    expect(t.find((x) => x.node.id === "n-info")!.depth).toBe(1);
    expect(t.find((x) => x.node.id === "n-price")!.depth).toBe(2);
  });

  it("훅도 옮길 수 있고 선택지에는 훅이 없다", () => {
    const t = moveTargets(sample(), "n-use-cart").map((x) => x.node);
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((n) => n.kind !== "hook")).toBe(true);
  });

  it("루트와 없는 노드는 빈 배열이다", () => {
    expect(moveTargets(sample(), "n-page")).toEqual([]);
    expect(moveTargets(sample(), "nope")).toEqual([]);
  });

  it("선택지는 모두 실제로 옮길 수 있고, 선택지에 없는 노드는 거부된다", () => {
    const bp = sample();
    for (const node of bp.nodes.filter((n) => n.parentId !== null)) {
      const allowed = new Set(moveTargets(bp, node.id).map((t) => t.node.id));
      for (const target of bp.nodes) {
        const r = moveNode(bp, node.id, target.id);
        if (allowed.has(target.id)) expect(r.ok, `${node.name} → ${target.name}`).toBe(true);
        else if (target.id !== node.parentId) expect(r.ok, `${node.name} → ${target.name}`).toBe(false);
      }
    }
  });
});
