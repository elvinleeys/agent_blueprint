import type { Rule } from "../../rules/types";

/** CM-01 경고: CSS Modules 스택인데 컴포넌트 전용 스타일이 전역(global) 범위 */
export const cm01: Rule = (bp) =>
  bp.nodes
    .filter((n) => n.style?.scope === "global")
    .map((n) => ({
      ruleId: "CM-01",
      severity: "warning",
      nodeIds: [n.id],
      message: `${n.name}의 스타일이 전역 범위입니다. 컴포넌트 전용 스타일은 모듈(${n.name}.module.css)에 두세요.`,
    }));

export const cssModulesRules: Rule[] = [cm01];
