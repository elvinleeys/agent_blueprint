import { describe, expect, it, vi } from "vitest";
import { nodesReceiveClicks, treeFlowOptions } from "./tree-options";

describe("treeFlowOptions — 트리 클릭 선택", () => {
  it("노드가 마우스 클릭을 받는다(선택·드래그를 꺼도 onNodeClick이 있어 pointer-events가 막히지 않는다)", () => {
    const options = treeFlowOptions(() => {});
    expect(options.elementsSelectable).toBe(false);
    expect(options.nodesDraggable).toBe(false);
    expect(nodesReceiveClicks(options)).toBe(true);
  });

  it("회귀 확인: 선택·드래그가 모두 꺼지고 클릭 핸들러도 없으면 React Flow가 클릭을 막는다(원래 버그)", () => {
    expect(nodesReceiveClicks({ elementsSelectable: false, nodesDraggable: false })).toBe(false);
  });

  it("노드를 클릭하면 그 노드의 id로 선택 함수를 부른다", () => {
    const select = vi.fn();
    treeFlowOptions(select).onNodeClick({}, { id: "n-info" });
    expect(select).toHaveBeenCalledWith("n-info");
  });

  it("이동·연결·편집은 막혀 있다", () => {
    const o = treeFlowOptions(() => {});
    expect(o).toMatchObject({ nodesDraggable: false, nodesConnectable: false, edgesFocusable: false });
  });
});
