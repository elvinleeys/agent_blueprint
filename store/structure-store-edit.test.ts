import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addChild } from "../core/edit/add-child";
import { deleteNode } from "../core/edit/delete-node";
import { moveNode } from "../core/edit/move-node";
import { updateNode } from "../core/edit/update-node";
import { BlueprintSchema } from "../core/schema/blueprint";
import { createStructureStore, selectHasUnsaved } from "./structure-store";

const blueprint = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const open = () => createStructureStore({ blueprint: blueprint(), savedInput: null });
const err = { message: "x", retryable: true, needsLogin: false };

describe("structure-store — applyEdit", () => {
  it("성공하면 설계도를 바꾸고 editRevision을 1 올리며 generatedBy가 user가 된다", () => {
    const s = open();
    const r = s.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "PriceLabel" }));
    expect(r.ok).toBe(true);
    expect(s.getState().blueprint?.nodes.find((n) => n.id === "n-price")?.name).toBe("PriceLabel");
    expect(s.getState().blueprint?.generatedBy).toBe("user");
    expect(s.getState().editRevision).toBe(1);
  });

  it("실패하면 설계도·revision을 그대로 두고 이유(노드·경로)를 돌려준다", () => {
    const s = open();
    const before = s.getState().blueprint;
    const r = s.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "ProductGallery" }));
    expect(r).toMatchObject({ ok: false, nodeId: "n-price", path: ["name"] });
    expect(s.getState().blueprint).toBe(before);
    expect(s.getState().editRevision).toBe(0);
  });

  it("바뀐 것이 없으면(같은 값) revision을 올리지 않아 저장도 예약되지 않는다", () => {
    const s = open();
    const r = s.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "PriceTag" }));
    expect(r.ok).toBe(true);
    expect(s.getState().editRevision).toBe(0);
    expect(s.getState().blueprint?.generatedBy).toBe("ai");
  });

  it("설계도가 없으면 거부한다", () => {
    const s = createStructureStore({ blueprint: null, savedInput: null });
    expect(s.getState().applyEdit((bp) => updateNode(bp, "x", { name: "Y" }))).toMatchObject({ ok: false });
    expect(s.getState().editRevision).toBe(0);
  });

  it("초안 생성 중(resizing·running)에는 연산을 실행하지 않고 거부한다", () => {
    for (const resizing of [true, false]) {
      const s = open();
      s.getState().startDraft(1, resizing);
      let called = false;
      const r = s.getState().applyEdit((bp) => {
        called = true;
        return updateNode(bp, "n-price", { name: "PriceLabel" });
      });
      expect(r).toMatchObject({ ok: false });
      expect(called).toBe(false);
      expect(s.getState().editRevision).toBe(0);
    }
  });

  it("초안 생성이 끝나거나 실패하면 다시 편집할 수 있다", () => {
    const s = open();
    s.getState().startDraft(1, false);
    s.getState().failDraft({ ...err, status: 504, code: "ai_timeout" });
    expect(s.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "PriceLabel" })).ok).toBe(true);
  });

  it("selectId가 있으면 그 노드를 선택하고(자식 추가·삭제), 없으면 현재 선택을 유지한다", () => {
    const s = open();
    s.getState().select("n-info");
    const added = s.getState().applyEdit((bp) => addChild(bp, "n-info"));
    expect(added.ok && s.getState().selectedNodeId).toBe(added.ok ? added.selectId : null);
    expect(s.getState().blueprint?.nodes.find((n) => n.id === s.getState().selectedNodeId)?.name).toBe("NewComponent");

    s.getState().select("n-info");
    s.getState().applyEdit((bp) => updateNode(bp, "n-price", { dataFetch: true }));
    expect(s.getState().selectedNodeId).toBe("n-info");

    s.getState().select("n-price");
    s.getState().applyEdit((bp) => deleteNode(bp, "n-price", "cascade"));
    expect(s.getState().selectedNodeId).toBe("n-info"); // 삭제하면 부모가 선택된다
  });

  it("삭제로 사라진 노드를 가리키던 선택은 연산이 selectId를 주지 않아도 해제된다", () => {
    const s = open();
    s.getState().select("n-price");
    s.getState().applyEdit((bp) => ({ ...deleteNode(bp, "n-price", "cascade"), selectId: undefined }));
    expect(s.getState().selectedNodeId).toBeNull();
  });
});

describe("structure-store — 자동으로 바뀐 값 안내(editNotices)", () => {
  it("layout을 채운 편집은 안내를 남기고, 다음 편집이나 닫기로 사라진다", () => {
    const s = open();
    s.getState().applyEdit((bp) => moveNode(bp, "n-price", "n-gallery"));
    expect(s.getState().editNotices).toEqual(["ProductGallery의 배치를 세로 정렬(flex, 간격 없음)로 지정했습니다."]);

    s.getState().applyEdit((bp) => updateNode(bp, "n-option", { dataFetch: true }));
    expect(s.getState().editNotices).toEqual([]);

    s.getState().applyEdit((bp) => moveNode(bp, "n-option", "n-cart-button"));
    expect(s.getState().editNotices).toHaveLength(1);
    s.getState().dismissNotices();
    expect(s.getState().editNotices).toEqual([]);
  });

  it("client로 바뀐 편집은 개수를 안내한다", () => {
    const s = open();
    s.getState().applyEdit((bp) => moveNode(bp, "n-gallery", "n-info"));
    expect(s.getState().editNotices).toEqual(["client 영역 안으로 옮겨져 노드 1개를 client로 바꿨습니다(ProductGallery)."]);
  });

  it("실패한 편집은 이전 안내를 건드리지 않는다", () => {
    const s = open();
    s.getState().applyEdit((bp) => moveNode(bp, "n-gallery", "n-info"));
    s.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "" }));
    expect(s.getState().editNotices).toHaveLength(1);
  });
});

describe("structure-store — 저장 상태와 저장되지 않은 수정", () => {
  it("저장 대기·전송 중·저장 실패는 저장되지 않은 수정이고, 대기·저장됨은 아니다", () => {
    const s = open();
    for (const [status, unsaved] of [["idle", false], ["pending", true], ["saving", true], ["saved", false], ["error", true]] as const) {
      s.getState().setSaveStatus(status);
      expect(selectHasUnsaved(s.getState())).toBe(unsaved);
    }
  });

  it("초안 저장 실패(unsaved)도 저장되지 않은 수정이다", () => {
    const s = open();
    s.getState().startDraft(1, false);
    s.getState().failDraft(err, blueprint());
    expect(s.getState().saveStatus).toBe("idle");
    expect(selectHasUnsaved(s.getState())).toBe(true);
  });

  it("새 초안이 완료되면 이전 편집의 저장 상태와 안내가 사라진다. editRevision은 되돌리지 않는다", () => {
    const s = open();
    s.getState().applyEdit((bp) => moveNode(bp, "n-gallery", "n-info"));
    s.getState().setSaveStatus("error");
    expect(selectHasUnsaved(s.getState())).toBe(true);
    s.getState().startDraft(1, false);
    s.getState().finishDraft(blueprint(), []);
    expect(s.getState()).toMatchObject({ saveStatus: "idle", editNotices: [], editRevision: 1 });
    expect(selectHasUnsaved(s.getState())).toBe(false);
  });
});
