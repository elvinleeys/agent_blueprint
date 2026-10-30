import { architectureRules } from "../adapters/architecture";
import { frameworkRules } from "../adapters/framework";
import { stylingRules } from "../adapters/styling";
import type { Blueprint } from "../schema/blueprint";
import { commonRules } from "./common";
import { treeIndex } from "./helpers";
import type { Severity, Violation } from "./types";

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
// 같은 심각도 안에서 먼저 보여 줄 규칙(NX-04 > NX-03 > R-07). 나머지는 규칙 id 순
const PRIORITY = ["NX-04", "NX-03", "R-07"];
const priorityOf = (id: string) => (PRIORITY.includes(id) ? PRIORITY.indexOf(id) : PRIORITY.length);

/**
 * 설계도에 공통 규칙과 스택 어댑터(프레임워크·스타일·디렉토리 구조)의 규칙을 돌려 위반을 모은다.
 * 정렬: 오류 → 경고 → 정보, 같은 심각도 안에서 우선 규칙 → 규칙 id, 같은 규칙 안에서는 트리 순서.
 */
export function checkBlueprint(bp: Blueprint): Violation[] {
  const { framework, styling, architecture } = bp.stack;
  const rules = [...commonRules, ...frameworkRules(framework), ...stylingRules(styling), ...architectureRules(architecture)];
  const at = treeIndex(bp);
  const first = (v: Violation) => at.get(v.nodeIds[0]) ?? 0;
  return rules
    .flatMap((rule) => rule(bp))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        priorityOf(a.ruleId) - priorityOf(b.ruleId) ||
        a.ruleId.localeCompare(b.ruleId) ||
        first(a) - first(b),
    );
}

/** 노드별 오류·경고 개수(정보는 화면에 표시하지 않으므로 제외). 위반이 가리키는 노드마다 1건으로 센다 */
export function countByNode(violations: Violation[]): Map<string, { error: number; warning: number }> {
  const out = new Map<string, { error: number; warning: number }>();
  for (const v of violations) {
    if (v.severity === "info") continue;
    for (const id of new Set(v.nodeIds)) {
      const cur = out.get(id) ?? { error: 0, warning: 0 };
      cur[v.severity] += 1;
      out.set(id, cur);
    }
  }
  return out;
}
