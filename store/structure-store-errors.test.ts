import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../core/schema/blueprint";
import { createStructureStore } from "./structure-store";

const open = () => createStructureStore({ blueprint: BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"))), savedInput: null });

describe("structure-store — 입력 오류와 노드 선택 확인", () => {
  it("칸 오류를 쓰고 지운다. 같은 값이면 상태를 바꾸지 않는다", () => {
    const s = open();
    s.getState().setEditError("name", "중복");
    const first = s.getState().editErrors;
    s.getState().setEditError("name", "중복");
    expect(s.getState().editErrors).toBe(first);
    s.getState().setEditError("name", null);
    expect(s.getState().editErrors).toEqual({});
    const empty = s.getState().editErrors;
    s.getState().setEditError("name", null);
    expect(s.getState().editErrors).toBe(empty);
  });

  it("clearEditErrors(키)는 그 칸과 하위 칸(키.…)만 지우고, 비슷한 이름의 다른 칸은 남긴다", () => {
    const s = open();
    for (const k of ["state", "state.0.name", "state.1.type", "stateful", "props.0.name"]) s.getState().setEditError(k, "x");
    s.getState().clearEditErrors("state");
    expect(Object.keys(s.getState().editErrors).sort()).toEqual(["props.0.name", "stateful"]);
    s.getState().clearEditErrors();
    expect(s.getState().editErrors).toEqual({});
  });

  it("오류가 없으면 requestSelect는 바로 선택한다", () => {
    const s = open();
    s.getState().requestSelect("n-info");
    expect(s.getState()).toMatchObject({ selectedNodeId: "n-info", selectRequest: null });
  });

  it("틀린 값이 있으면 선택하지 않고 확인을 기다리며, 취소하면 그대로 남는다", () => {
    const s = open();
    s.getState().select("n-info");
    s.getState().setEditError("name", "이름 형식 오류");
    s.getState().requestSelect("n-price");
    expect(s.getState()).toMatchObject({ selectedNodeId: "n-info", selectRequest: "n-price", editErrors: { name: "이름 형식 오류" } });
    s.getState().cancelSelect();
    expect(s.getState()).toMatchObject({ selectedNodeId: "n-info", selectRequest: null, editErrors: { name: "이름 형식 오류" } });
  });

  it("확인하면 선택을 옮기고 틀린 값(오류)을 버린다", () => {
    const s = open();
    s.getState().select("n-info");
    s.getState().setEditError("name", "x");
    s.getState().requestSelect("n-price");
    s.getState().confirmSelect();
    expect(s.getState()).toMatchObject({ selectedNodeId: "n-price", selectRequest: null, editErrors: {} });
  });

  it("이미 선택된 노드를 다시 고르면 확인을 요청하지 않는다", () => {
    const s = open();
    s.getState().select("n-info");
    s.getState().setEditError("name", "x");
    s.getState().requestSelect("n-info");
    expect(s.getState().selectRequest).toBeNull();
  });

  it("확인 요청이 없을 때 confirmSelect는 아무것도 하지 않는다", () => {
    const s = open();
    s.getState().select("n-info");
    s.getState().confirmSelect();
    expect(s.getState().selectedNodeId).toBe("n-info");
  });

  it("초안 생성을 시작하면 오류와 확인 요청이 사라진다", () => {
    const s = open();
    s.getState().setEditError("name", "x");
    s.getState().requestSelect("n-price");
    s.getState().startDraft(1, false);
    expect(s.getState()).toMatchObject({ editErrors: {}, selectRequest: null });
  });
});
