import type { Blueprint } from "../schema/blueprint";

export type Severity = "error" | "warning" | "info";

/** 검사 결과 한 건. nodeIds의 첫 노드가 화면에서 먼저 선택되는 노드다 */
export type Violation = {
  ruleId: string;
  severity: Severity;
  nodeIds: string[];
  message: string;
};

/** 설계도를 읽기만 하고 위반 목록을 돌려주는 순수 함수 */
export type Rule = (blueprint: Blueprint) => Violation[];
