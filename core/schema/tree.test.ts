import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema, type ComponentNode } from "./blueprint";
import { buildTree, type TreeNode } from "./tree";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const names = (t: TreeNode): string[] => [t.name, ...t.children.flatMap(names)];

describe("buildTree", () => {
  it("샘플 설계도를 order 순 트리로 만든다", () => {
    const tree = buildTree(sample().nodes)!;
    expect(tree.name).toBe("ProductDetailPage");
    expect(tree.children.map((c) => c.name)).toEqual(["ProductGallery", "ProductInfo", "ReviewSummary"]);
    expect(tree.children[1].children.map((c) => c.name)).toEqual(["PriceTag", "OptionSelector", "AddToCartButton", "useCart"]);
  });

  it("배열 순서와 상관없이 order로 정렬하고 같은 order는 배열 순서를 유지한다", () => {
    const nodes = sample().nodes;
    const shuffled = [...nodes].reverse();
    expect(names(buildTree(shuffled)!).slice(0, 4)).toEqual(["ProductDetailPage", "ProductGallery", "ProductInfo", "PriceTag"]);
    const tie = nodes.map((n) => (n.parentId === "n-page" ? { ...n, order: 0 } : n));
    expect(buildTree(tie)!.children.map((c) => c.name)).toEqual(["ProductGallery", "ProductInfo", "ReviewSummary"]);
  });

  it("원본 노드를 바꾸지 않고, 노드에 children 필드를 저장하지 않는다", () => {
    const nodes = sample().nodes;
    const before = JSON.stringify(nodes);
    buildTree(nodes);
    expect(JSON.stringify(nodes)).toBe(before);
    expect(nodes.every((n) => !("children" in n))).toBe(true);
  });

  it("루트가 0개거나 2개 이상이면 null", () => {
    const nodes = sample().nodes;
    expect(buildTree([])).toBeNull();
    expect(buildTree(nodes.map((n) => (n.parentId === null ? { ...n, parentId: "n-info" } : n)))).toBeNull();
    expect(buildTree(nodes.map((n) => (n.id === "n-info" ? { ...n, parentId: null } : n)))).toBeNull();
  });

  it("루트에서 도달할 수 없는 노드와 순환은 트리에 넣지 않고 멈추지 않는다", () => {
    const nodes: ComponentNode[] = [
      ...sample().nodes,
      { ...sample().nodes[1], id: "x-a", name: "OrphanA", parentId: "x-b" },
      { ...sample().nodes[1], id: "x-b", name: "OrphanB", parentId: "x-a" },
    ];
    const tree = buildTree(nodes)!;
    expect(names(tree)).not.toContain("OrphanA");
    expect(names(tree)).not.toContain("OrphanB");
    expect(names(tree)).toHaveLength(sample().nodes.length);
  });
});
