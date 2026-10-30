import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../core/schema/blueprint";
import { createStructureStore } from "./structure-store";

const blueprint = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const img = (name: string) => new File([new Uint8Array([1])], name, { type: "image/png" });
const err = { message: "x", retryable: true, needsLogin: false };

describe("structure-store — 보기·선택", () => {
  it("초기값: 설계도·저장된 입력, 데스크톱·미리보기, 선택 없음", () => {
    const store = createStructureStore({ blueprint: blueprint(), savedInput: { spec: { overview: "x" }, route: "/p", imageCount: 0 } });
    expect(store.getState()).toMatchObject({ viewport: "desktop", view: "preview", selectedNodeId: null, normalized: [], status: "idle" });
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
    expect(s.getState()).toMatchObject({ selectedNodeId: "n-info", normalized: [change] });

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

describe("structure-store — 입력", () => {
  it("저장된 스펙 입력과 화면 주소가 입력칸의 초기값이 되고, 저장이 없으면 비어 있다", () => {
    const saved = createStructureStore({ blueprint: null, savedInput: { spec: { overview: "상품", stateData: "장바구니" }, route: "/p/[id]", imageCount: 2 } });
    expect(saved.getState()).toMatchObject({ spec: { overview: "상품", stateData: "장바구니" }, route: "/p/[id]", images: [] }); // 이미지는 저장하지 않아 비어 있다
    const empty = createStructureStore({ blueprint: null, savedInput: null });
    expect(empty.getState()).toMatchObject({ spec: {}, route: "" });
  });

  it("항목·화면 주소·이미지를 바꾼다(이미지는 순서대로 쌓고 지울 수 있다)", () => {
    const s = createStructureStore({ blueprint: null, savedInput: null });
    s.getState().setSpecField("overview", "A");
    s.getState().setRoute("/x");
    s.getState().addImages([img("1.png"), img("2.png")]);
    s.getState().addImages([img("3.png")]);
    s.getState().removeImage(1);
    expect(s.getState().spec).toEqual({ overview: "A" });
    expect(s.getState().route).toBe("/x");
    expect(s.getState().images.map((f) => f.name)).toEqual(["1.png", "3.png"]);
  });
});

describe("structure-store — 초안 생성 진행", () => {
  const filled = () => {
    const s = createStructureStore({ blueprint: null, savedInput: null });
    s.getState().setSpecField("overview", "A");
    s.getState().setRoute(" /x ");
    s.getState().addImages([img("1.png")]);
    return s;
  };

  it("시작 → 단계 쌓기 → 완료: 설계도가 바뀌고 보낸 입력이 저장된 입력이 된다", () => {
    const s = filled();
    s.getState().startDraft(1000, true);
    expect(s.getState()).toMatchObject({ status: "resizing", startedAt: 1000, stages: [], error: null });
    s.getState().setRunning();
    s.getState().addStage({ stage: "accepted" });
    s.getState().addStage({ stage: "generating", attempt: 1 });
    expect(s.getState()).toMatchObject({ status: "running", stages: [{ stage: "accepted" }, { stage: "generating", attempt: 1 }] });

    const change = { nodeId: "n-page", path: "order", detail: "d" };
    s.getState().finishDraft(blueprint(), [change]);
    expect(s.getState()).toMatchObject({ status: "done", normalized: [change], unsaved: false });
    expect(s.getState().blueprint?.title).toBe(blueprint().title);
    expect(s.getState().savedInput).toEqual({ spec: { overview: "A" }, route: "/x", imageCount: 1 });
  });

  it("진행 중에 다시 시작해도 무시한다(중복 호출 방지)", () => {
    const s = filled();
    s.getState().startDraft(1000, false);
    s.getState().addStage({ stage: "accepted" });
    s.getState().startDraft(2000, true);
    expect(s.getState()).toMatchObject({ status: "running", startedAt: 1000, stages: [{ stage: "accepted" }] });
  });

  it("실패해도 입력(항목·화면 주소·이미지)은 그대로이고, 다시 시작하면 오류가 지워진다", () => {
    const s = filled();
    s.getState().startDraft(1000, false);
    s.getState().failDraft({ ...err, status: 504, code: "ai_timeout" });
    expect(s.getState()).toMatchObject({ status: "error", error: { status: 504 }, spec: { overview: "A" }, route: " /x " });
    expect(s.getState().images).toHaveLength(1);
    expect(s.getState().blueprint).toBeNull();

    s.getState().startDraft(3000, false);
    expect(s.getState()).toMatchObject({ status: "running", error: null, startedAt: 3000 });
  });

  it("저장만 실패한 경우 초안을 보여 주되 저장되지 않음 표시를 켠다. 다음 시작에서 꺼진다", () => {
    const s = filled();
    s.getState().startDraft(1000, false);
    s.getState().failDraft(err, blueprint());
    expect(s.getState()).toMatchObject({ status: "error", unsaved: true });
    expect(s.getState().blueprint).not.toBeNull();
    s.getState().startDraft(2000, false);
    expect(s.getState().unsaved).toBe(false);
  });
});
