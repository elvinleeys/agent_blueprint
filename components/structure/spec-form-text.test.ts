import { describe, expect, it } from "vitest";
import { SPEC_TEXT_KEYS } from "../../lib/db/spec-inputs";
import { generateButtonLabel, IMAGE_ONLY_NOTE, MIN_CONDITION, REGENERATE_NOTE, ROUTE_LABEL, SPEC_LABELS } from "./spec-form-text";

describe("스펙 입력 폼 문구", () => {
  it("스펙 7개 항목과 화면 주소의 이름 옆에 (선택)이 붙는다", () => {
    expect(Object.keys(SPEC_LABELS).sort()).toEqual([...SPEC_TEXT_KEYS].sort());
    for (const label of Object.values(SPEC_LABELS)) expect(label.endsWith(" (선택)")).toBe(true);
    expect(ROUTE_LABEL).toBe("화면 주소 (선택)");
  });

  it("이미지만 넣었을 때는 필수가 아니라 권장하는 말투로 안내한다", () => {
    expect(IMAGE_ONLY_NOTE).toBe(
      "이미지만으로도 생성할 수 있어요. 다만 데이터 조회 위치·상태는 이미지에 보이지 않으니, ① 화면 개요와 ⑤ 상태·데이터를 함께 적으면 결과가 더 정확해져요.",
    );
    expect(IMAGE_ONLY_NOTE).not.toContain("채워 주세요");
  });

  it("생성 버튼 근처의 최소 조건 문구", () => {
    expect(MIN_CONDITION).toBe("7개 항목 중 하나 이상, 또는 이미지 1장 이상이면 생성할 수 있어요");
  });

  it("설계도가 없는 새 프로젝트는 '초안 생성', 있으면 '초안 다시 생성', 진행 중에는 '초안 생성 중…'", () => {
    expect(generateButtonLabel(false, false)).toBe("초안 생성");
    expect(generateButtonLabel(false, true)).toBe("초안 다시 생성");
    expect(generateButtonLabel(true, false)).toBe("초안 생성 중…");
    expect(generateButtonLabel(true, true)).toBe("초안 생성 중…");
    expect(REGENERATE_NOTE).toContain("새 판으로 추가되며 기존 초안은 보존됩니다");
  });
});
