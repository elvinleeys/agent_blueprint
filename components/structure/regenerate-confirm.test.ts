import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { updateNode } from "../../core/edit/update-node";
import { BlueprintSchema, type Blueprint } from "../../core/schema/blueprint";
import type { SaveStatus } from "../../lib/client/save-queue";
import { createStructureStore } from "../../store/structure-store";
import { regenerateDescription, regenerateReasons } from "./regenerate-confirm";

const ai = (): Blueprint => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const user = (): Blueprint => ({ ...ai(), generatedBy: "user" });
const state = (blueprint: Blueprint | null, saveStatus: SaveStatus = "idle", unsaved = false) => ({ blueprint, saveStatus, unsaved });

describe("regenerateReasons", () => {
  it("설계도가 없으면(첫 생성) 확인하지 않는다", () => {
    expect(regenerateReasons(state(null))).toEqual([]);
  });

  it("최신 판이 AI 초안이고 저장되지 않은 수정도 없으면 확인하지 않는다(idle·saved)", () => {
    expect(regenerateReasons(state(ai(), "idle"))).toEqual([]);
    expect(regenerateReasons(state(ai(), "saved"))).toEqual([]);
  });

  it("저장이 끝났어도 사용자가 고친 설계도(generatedBy user)면 확인한다", () => {
    expect(regenerateReasons(state(user(), "saved"))).toEqual(["user-edited"]);
    expect(regenerateReasons(state(user(), "idle"))).toEqual(["user-edited"]);
  });

  it("저장 대기·전송 중·저장 실패·초안 저장 실패는 저장되지 않은 수정으로 확인한다", () => {
    for (const status of ["pending", "saving", "error"] as const) expect(regenerateReasons(state(ai(), status))).toEqual(["unsaved"]);
    expect(regenerateReasons(state(ai(), "idle", true))).toEqual(["unsaved"]);
  });

  it("사용자가 고친 설계도에 저장되지 않은 수정도 있으면 두 이유를 모두 알린다", () => {
    expect(regenerateReasons(state(user(), "saving"))).toEqual(["unsaved", "user-edited"]);
  });

  it("실제 스토어에서: 편집하면 user가 되고, 새 초안이 완료되면 다시 확인하지 않는다", () => {
    const store = createStructureStore({ blueprint: ai(), savedInput: null });
    expect(regenerateReasons(store.getState())).toEqual([]);

    store.getState().applyEdit((bp) => updateNode(bp, "n-price", { name: "PriceLabel" }));
    expect(regenerateReasons(store.getState())).toEqual(["user-edited"]); // 아직 저장 큐가 연결되지 않아 saveStatus는 idle

    store.getState().setSaveStatus("saving");
    expect(regenerateReasons(store.getState())).toEqual(["unsaved", "user-edited"]);

    store.getState().startDraft(1, false);
    store.getState().finishDraft(ai(), []);
    expect(regenerateReasons(store.getState())).toEqual([]); // 새 AI 초안은 확인 대상이 아니다
  });
});

describe("regenerateDescription", () => {
  it("저장되지 않은 수정 문구는 사라진다는 사실을 밝힌다", () => {
    expect(regenerateDescription(["unsaved"])).toContain("저장되지 않은 수정은 사라집니다");
  });

  it("사용자가 고친 설계도 문구는 요청한 문장 그대로다", () => {
    expect(regenerateDescription(["user-edited"])).toBe("현재 설계도는 이전 판으로 보관되고 새 초안으로 바뀝니다. 판 목록 화면은 아직 없어 지금 화면에서는 볼 수 없습니다.");
  });

  it("둘 다면 저장되지 않은 수정 문구가 먼저 나오고 두 문구가 이어진다", () => {
    const text = regenerateDescription(["unsaved", "user-edited"]);
    expect(text.indexOf("저장되지 않은 수정")).toBeLessThan(text.indexOf("이전 판으로 보관"));
    expect(regenerateDescription([])).toBe("");
  });
});
