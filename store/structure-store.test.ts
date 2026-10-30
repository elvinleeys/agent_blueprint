import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../core/schema/blueprint";
import { createStructureStore } from "./structure-store";

const blueprint = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));

describe("structure-store", () => {
  it("초기값: 설계도·저장된 입력, 데스크톱·미리보기, 선택 없음", () => {
    const store = createStructureStore({ blueprint: blueprint(), savedInput: { spec: { overview: "x" }, route: "/p", imageCount: 0 } });
    expect(store.getState()).toMatchObject({ viewport: "desktop", view: "preview", selectedNodeId: null, normalized: [] });
    expect(store.getState().savedInput?.route).toBe("/p");
  });

  it("선택·보기·뷰포트를 바꾼다", () => {
    const s = createStructureStore({ blueprint: blueprint(), savedInput: null });
    s.getState().select("n-info");
    s.getState().setViewport("mobile");
    s.getState().setView("tree");
    expect(s.getState()).toMatchObject({ selectedNodeId: "n-info", viewport: "mobile", view: "tree" });
  });

  it("새 설계도로 바꾸면 보정 내역을 담고, 사라진 노드를 가리키는 선택은 해제한다", () => {
    const s = createStructureStore({ blueprint: blueprint(), savedInput: null });
    s.getState().select("n-info");
    const change = { nodeId: "n-page", path: "order", detail: "d" };
    s.getState().setBlueprint(blueprint(), [change]);
    expect(s.getState()).toMatchObject({ selectedNodeId: "n-info", normalized: [change] }); // 노드가 그대로 있으면 유지

    const smaller = blueprint();
    smaller.nodes = smaller.nodes.filter((n) => n.id !== "n-info" && n.parentId !== "n-info");
    s.getState().setBlueprint(smaller);
    expect(s.getState().selectedNodeId).toBeNull();
    expect(s.getState().normalized).toEqual([]);
  });

  it("작업공간마다 독립된 스토어다", () => {
    const a = createStructureStore({ blueprint: null, savedInput: null });
    const b = createStructureStore({ blueprint: null, savedInput: null });
    a.getState().select("x");
    expect(b.getState().selectedNodeId).toBeNull();
  });
});
