import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addChild } from "../../core/edit/add-child";
import { deleteNode } from "../../core/edit/delete-node";
import { moveNode } from "../../core/edit/move-node";
import { reorderNode } from "../../core/edit/reorder-node";
import { updateNode } from "../../core/edit/update-node";
import { BlueprintSchema, type Blueprint } from "../../core/schema/blueprint";
import { createTreeFlow, toFlow, treeStructureKey } from "./toFlow";

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

describe("createTreeFlow — 구조가 바뀔 때만 dagre를 다시 돌린다", () => {
  const bp = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
  const run = (flow: ReturnType<typeof createTreeFlow>, r: ReturnType<typeof updateNode>) => {
    if (!r.ok) throw new Error(r.reason);
    return flow(r.blueprint.nodes);
  };

  it("처음 한 번 계산하고, 같은 설계도를 다시 넣어도 계산하지 않는다", () => {
    const flow = createTreeFlow();
    flow(bp().nodes);
    flow(bp().nodes);
    expect(flow.stats.layouts).toBe(1);
  });

  it("이름·책임·상태·스타일·배치·종류 수정은 다시 계산하지 않고, 카드 데이터만 바뀐다", () => {
    const flow = createTreeFlow();
    const first = flow(bp().nodes);
    let cur = bp();
    const edits: ((b: Blueprint) => ReturnType<typeof updateNode>)[] = [
      (b) => updateNode(b, "n-price", { name: "PriceLabelWithAVeryLongNameThatWouldNotFitInTheCard" }),
      (b) => updateNode(b, "n-price", { responsibilities: ["가격 표시"] }),
      (b) => updateNode(b, "n-price", { state: [{ name: "open" }] }),
      (b) => updateNode(b, "n-price", { kind: "container" }),
      (b) => updateNode(b, "n-page", { layout: { ...b.nodes[0].layout!, gap: "spacing.8" } }),
      (b) => updateNode(b, "n-price", { style: { scope: "module", properties: [{ property: "opacity", value: "0.5", isToken: false }], ownsOuterSpacing: false } }),
      (b) => updateNode(b, "n-gallery", { placement: { span: 2 } }),
    ];
    let last = first;
    for (const edit of edits) {
      const r = edit(cur);
      last = run(flow, r);
      if (r.ok) cur = r.blueprint;
    }
    expect(flow.stats.layouts).toBe(1);
    expect(last.nodes.find((n) => n.id === "n-price")!.data.name).toBe("PriceLabelWithAVeryLongNameThatWouldNotFitInTheCard");
    expect(last.nodes.find((n) => n.id === "n-price")!.data.kind).toBe("container");
    expect(last.nodes.map((n) => n.position)).toEqual(first.nodes.map((n) => n.position)); // 좌표는 그대로
    expect(last.edges).toBe(first.edges); // 엣지 배열도 같은 것을 재사용한다
  });

  it("부모 변경·순서 변경·자식 추가·삭제는 각각 다시 계산한다", () => {
    const flow = createTreeFlow();
    let cur = bp();
    flow(cur.nodes);
    const structural = [
      (b: Blueprint) => moveNode(b, "n-price", "n-page"),
      (b: Blueprint) => reorderNode(b, "n-option", "down"),
      (b: Blueprint) => addChild(b, "n-info"),
      (b: Blueprint) => deleteNode(b, "n-review", "cascade"),
    ];
    structural.forEach((edit, i) => {
      const r = edit(cur);
      if (!r.ok) throw new Error(r.reason);
      cur = r.blueprint;
      flow(cur.nodes);
      expect(flow.stats.layouts).toBe(i + 2);
    });
  });

  it("구조가 바뀌면 새 좌표를 쓴다(자식이 늘면 자식 위에서 가운데 정렬되는 루트 위치가 달라진다)", () => {
    const flow = createTreeFlow();
    const before = flow(bp().nodes);
    const added = addChild(bp(), "n-page");
    if (!added.ok) throw new Error(added.reason);
    const after = flow(added.blueprint.nodes);
    expect(after.nodes).toHaveLength(before.nodes.length + 1);
    expect(after.nodes.find((n) => n.id === "n-page")!.position.x).not.toBe(before.nodes.find((n) => n.id === "n-page")!.position.x);
  });

  it("treeStructureKey는 배열 순서와 상관없다", () => {
    const nodes = bp().nodes;
    expect(treeStructureKey([...nodes].reverse())).toBe(treeStructureKey(nodes));
  });
});
