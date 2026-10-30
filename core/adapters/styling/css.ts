import { treeIndex } from "../../rules/helpers";
import type { Rule, Violation } from "../../rules/types";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * HC-01 경고: 클래스 명명 규칙(classPattern)이 설계도 안에서 일관되지 않음.
 * 가장 많이 쓰인 값(같으면 트리에서 먼저 나온 값)을 기준으로 다른 값이거나, 스타일이 있는데 값이 없는 노드를 알린다.
 * 아무 노드도 classPattern이 없으면 기준이 없으므로 걸지 않는다.
 */
export const hc01: Rule = (bp) => {
  const order = treeIndex(bp);
  const styled = bp.nodes.filter((n) => n.style !== null).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const counts = new Map<string, number>(); // Map은 처음 넣은 순서를 유지한다
  for (const n of styled) {
    const p = n.style?.classPattern;
    if (p && norm(p)) counts.set(norm(p), (counts.get(norm(p)) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const base = [...counts.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
  return styled.flatMap((n): Violation[] => {
    const p = n.style?.classPattern;
    const value = p && norm(p) ? norm(p) : null;
    if (value === base) return [];
    const message =
      value === null
        ? `${n.name}에 클래스 명명 규칙이 지정되지 않았습니다. 다른 노드는 ${base}을(를) 씁니다.`
        : `${n.name}의 클래스 명명 규칙(${p})이 다른 노드(${base})와 다릅니다.`;
    return [{ ruleId: "HC-01", severity: "warning", nodeIds: [n.id], message }];
  });
};

export const cssRules: Rule[] = [hc01];
