import { describe, expect, it } from "vitest";
import { buildExportPrompt } from "@/core/prompt/export-prompt";
import { checkBlueprint } from "@/core/rules/run";
import { LANDING_BLUEPRINT } from "./landing-blueprint";

describe("랜딩 예시 설계도", () => {
  const violations = checkBlueprint(LANDING_BLUEPRINT);

  it("경고가 정확히 2건(R-03, R-06)이고 오류는 없다", () => {
    expect(violations.map((v) => `${v.severity}:${v.ruleId}`).sort()).toEqual(["warning:R-03", "warning:R-06"]);
  });

  it("지시서를 템플릿으로 만들 수 있다(AI 호출 없음)", () => {
    const text = buildExportPrompt({ blueprint: LANDING_BLUEPRINT, spec: {}, route: "/products/[id]", violations, format: "prompt" });
    expect(text).toContain("ProductPage");
  });
});
