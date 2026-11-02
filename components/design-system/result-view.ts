import type { Finding } from "@/core/cleanup/compare";

type Of<R extends Finding["rule"]> = Extract<Finding, { rule: R }>;

export const RULE_TITLE: Record<Finding["rule"], string> = {
  "C-01": "공식 목록에 없음",
  "C-02": "합치기 후보",
  "C-03": "나누기 후보",
  "C-05": "공식과 같은 이름의 별도 구현",
};

export type GroupedFindings = {
  /** 맨 위에 보이는 경고: 같은 이름의 별도 구현·합치기·나누기 */
  warnings: Finding[];
  /** 정보 수준의 합치기 후보(공식이 없는 쌍) */
  infoMerge: Of<"C-02">[];
  /** 정보 수준의 "공식 목록에 없음": 개수와 함께 접힌 묶음으로 보인다 */
  notOfficial: Of<"C-01">[];
};

export type FindingCounts = {
  warning: number;
  /** 정보 전체 = infoMerge + notOfficial. 화면의 구역 개수와 맞춰 합계를 설명하는 데 쓴다 */
  info: number;
  infoMerge: number;
  notOfficial: number;
  total: number;
};

export function countFindings(findings: Finding[]): FindingCounts {
  const g = groupFindings(findings);
  return { warning: g.warnings.length, info: g.infoMerge.length + g.notOfficial.length, infoMerge: g.infoMerge.length, notOfficial: g.notOfficial.length, total: findings.length };
}

/** 결과를 화면 구역으로 나눈다. 각 구역 안의 순서는 compare가 정한 순서를 따른다 */
export function groupFindings(findings: Finding[]): GroupedFindings {
  return {
    warnings: findings.filter((f) => f.severity === "warning"),
    infoMerge: findings.filter((f): f is Of<"C-02"> => f.severity === "info" && f.rule === "C-02"),
    notOfficial: findings.filter((f): f is Of<"C-01"> => f.rule === "C-01"),
  };
}
