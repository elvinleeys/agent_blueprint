import type { Rule, Violation } from "../../rules/types";

/** TW-01 경고: 토큰 대신 임의값 사용. 노드당 1건 */
export const tw01: Rule = (bp) =>
  bp.nodes.flatMap((n): Violation[] => {
    const raw = n.style?.properties.filter((p) => !p.isToken) ?? [];
    if (raw.length === 0) return [];
    const list = raw.map((p) => `${p.property}: ${p.value}`).join(", ");
    return [{ ruleId: "TW-01", severity: "warning", nodeIds: [n.id], message: `${n.name}이(가) 토큰 대신 직접 쓴 값을 씁니다(${list}). 디자인 토큰으로 바꿀 수 있는지 확인하세요.` }];
  });

/** TW-02 정보: (속성, 값) 쌍이 2개 이상인 같은 스타일 묶음이 3개 이상 노드에 반복 */
export const tw02: Rule = (bp) => {
  const groups = new Map<string, typeof bp.nodes>();
  for (const n of bp.nodes) {
    const pairs = [...new Set(n.style?.properties.map((p) => `${p.property}:${p.value}`) ?? [])].sort();
    if (pairs.length < 2) continue; // 한 줄짜리 반복은 묶어도 이득이 작다
    const key = pairs.join(";");
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 3)
    .map((g) => ({
      ruleId: "TW-02",
      severity: "info",
      nodeIds: g.map((n) => n.id),
      message: `${g.map((n) => n.name).join(", ")}이(가) 같은 스타일 묶음을 반복합니다. 공통 컴포넌트나 클래스로 묶을 수 있는지 확인하세요.`,
    }));
};

export const tailwindRules: Rule[] = [tw01, tw02];
