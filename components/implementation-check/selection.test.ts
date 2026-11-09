import { describe, expect, it } from "vitest";
import { readCodeModel } from "@/core/code-model/facts";
import { loadBlueprint, loadCode } from "@/core/impl-check/load-fixture";
import { checkImplementation } from "@/core/impl-check/run";
import { buildFixPrompt } from "@/core/prompt/fix-prompt";
import { fixPromptInput, includedCount, restoreSelection, toggleIncluded, type Selection } from "./selection";

describe("재검사 뒤 체크 복원(카드 id 기준)", () => {
  const prev: Selection = new Set(["IC-01|a|pair", "IC-06|c|prop:y"]);

  it("같은 카드 id가 다시 나오면 체크를 유지한다", () => {
    expect(restoreSelection(prev, ["IC-01|a|pair", "IC-05|b|state:x", "IC-06|c|prop:y"])).toEqual(prev);
  });

  it("새로 나온 카드는 체크하지 않는다", () => {
    expect(restoreSelection(prev, ["IC-01|a|pair", "IC-09|new|style"])).toEqual(new Set(["IC-01|a|pair"]));
  });

  it("사라진 카드의 체크는 지운다", () => {
    expect(restoreSelection(prev, ["IC-05|b|state:x"])).toEqual(new Set());
  });

  it("카드가 하나도 없으면 체크도 없다", () => {
    expect(restoreSelection(prev, [])).toEqual(new Set());
  });

  it("세 규칙을 한꺼번에: 유지 + 새 카드 체크 안 함 + 사라진 카드 제거", () => {
    expect(restoreSelection(prev, ["IC-06|c|prop:y", "IC-10|z|token"])).toEqual(new Set(["IC-06|c|prop:y"]));
  });

  it("이전 선택을 바꾸지 않는다", () => {
    restoreSelection(prev, []);
    toggleIncluded(prev, "IC-01|a|pair");
    expect(prev).toEqual(new Set(["IC-01|a|pair", "IC-06|c|prop:y"]));
  });
});

describe("체크를 바꾸면 포함 수와 지시서가 바뀐다 (renamed: 확인 필요 카드 3장)", () => {
  const r = checkImplementation(loadBlueprint("next", "renamed"), readCodeModel(loadCode("next", "renamed")));
  const data = { baseline: { revision: 3, source: "export" as const }, result: r };
  const galleryId = "IC-01|n-gallery|pair";
  const promptOf = (sel: Selection) => buildFixPrompt(fixPromptInput(data, sel));

  it("체크하면 포함 수 0→1, 지시서에 '확인 뒤 수정'과 그 항목이 생긴다. 다시 끄면 처음과 같다", () => {
    const none: Selection = new Set();
    const one = toggleIncluded(none, galleryId);
    expect(includedCount(none, data)).toBe(0);
    expect(includedCount(one, data)).toBe(1);
    expect(promptOf(none)).not.toContain("## 확인 뒤 수정");
    expect(promptOf(one)).toContain("### 1. [IC-01 · 짝 확인 필요] ProductGallery ↔ ItemImages");

    const off = toggleIncluded(one, galleryId);
    expect(includedCount(off, data)).toBe(0);
    expect(promptOf(off)).toBe(promptOf(none));
  });

  it("세 장을 모두 체크하면 포함 수 3, 지시서 항목 3개. 머리말 집계는 체크와 무관", () => {
    const all: Selection = new Set(r.findings.filter((f) => f.certainty === "review").map((f) => f.id));
    expect(includedCount(all, data)).toBe(3);
    expect(promptOf(all).match(/^### /gm)).toHaveLength(3);
    const header = (doc: string) => doc.split("\n").find((l) => l.startsWith("> 설계 준수"));
    expect(header(promptOf(all))).toBe(header(promptOf(new Set())));
  });

  it("확인 필요 카드가 아닌 id는 포함 수·지시서 입력에 들어가지 않고, 입력은 정렬된다", () => {
    const sel: Selection = new Set(["없는|카드|id", galleryId]);
    expect(includedCount(sel, data)).toBe(1);
    expect(fixPromptInput(data, sel).include).toEqual([galleryId]);
  });
});
