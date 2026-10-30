import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../../core/schema/blueprint";
import { toFlow } from "./toFlow";

const nodes = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"))).nodes;

describe("toFlow", () => {
  it("노드 수만큼 노드가, 루트를 뺀 수만큼 엣지가 만들어진다", () => {
    const { nodes: n, edges } = toFlow(nodes());
    expect(n).toHaveLength(nodes().length);
    expect(edges).toHaveLength(nodes().length - 1);
    expect(edges).toContainEqual({ id: "n-page->n-info", source: "n-page", target: "n-info" });
  });

  it("부모는 자식보다 위에 있다", () => {
    const { nodes: flow } = toFlow(nodes());
    const y = (id: string) => flow.find((f) => f.id === id)!.position.y;
    for (const node of nodes()) if (node.parentId) expect(y(node.parentId)).toBeLessThan(y(node.id));
  });

  it("형제는 order 순서로 왼쪽에서 오른쪽에 놓인다", () => {
    const { nodes: flow } = toFlow(nodes());
    const x = (id: string) => flow.find((f) => f.id === id)!.position.x;
    expect(x("n-gallery")).toBeLessThan(x("n-info"));
    expect(x("n-info")).toBeLessThan(x("n-review"));
  });

  it("카드에 보일 이름·종류·가정 여부를 담고, 모든 노드가 겹치지 않는 좌표를 가진다", () => {
    const { nodes: flow } = toFlow(nodes());
    expect(flow.find((f) => f.id === "n-use-cart")!.data).toEqual({ name: "useCart", kind: "hook", assumed: false });
    const keys = new Set(flow.map((f) => `${Math.round(f.position.x)},${Math.round(f.position.y)}`));
    expect(keys.size).toBe(flow.length);
    expect(flow.every((f) => Number.isFinite(f.position.x) && Number.isFinite(f.position.y))).toBe(true);
  });

  it("루트가 하나가 아니면 빈 결과", () => {
    expect(toFlow([])).toEqual({ nodes: [], edges: [] });
  });
});
