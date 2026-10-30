import { groupConnected, isAncestorOrDescendant, nodeMap } from "../helpers";
import type { Rule, Violation } from "../types";
import type { ComponentNode } from "../../schema/blueprint";

// 화면 부품마다 따로 갖는 범용 UI 상태 이름. 이런 이름은 조상-자손일 때만 중복으로 본다(형제의 각자 isOpen은 정상)
export const GENERIC_STATE_NAMES = new Set(["isopen", "open", "loading", "isloading", "error", "value", "hovered", "focused", "visible"]);
// 연쇄 전달을 세지 않는 prop 이름
const SKIPPED_PROPS = new Set(["children", "className", "key"]);

/** R-02 오류: 같은 상태가 2개 이상 노드에 선언 (이름은 공백 제거·소문자로 비교) */
export const r02: Rule = (bp) => {
  const map = nodeMap(bp);
  const byName = new Map<string, { label: string; nodes: ComponentNode[] }>();
  for (const n of bp.nodes)
    for (const s of n.state) {
      const key = s.name.trim().toLowerCase();
      const entry = byName.get(key) ?? { label: s.name.trim(), nodes: [] };
      if (!entry.nodes.includes(n)) entry.nodes.push(n);
      byName.set(key, entry);
    }

  return [...byName.entries()].flatMap(([key, { label, nodes }]): Violation[] => {
    if (nodes.length < 2) return [];
    let hit = nodes;
    if (GENERIC_STATE_NAMES.has(key)) {
      hit = nodes.filter((a) => nodes.some((b) => b !== a && isAncestorOrDescendant(map, a, b)));
      if (hit.length < 2) return [];
    }
    return [
      {
        ruleId: "R-02",
        severity: "error",
        nodeIds: hit.map((n) => n.id),
        message: `상태 ${label}이(가) ${hit.map((n) => n.name).join(", ")}에 중복 선언되었습니다. 한 노드가 소유하고 나머지는 props로 받으세요.`,
      },
    ];
  });
};

/** R-03 경고: 같은 prop이 부모-자식 사슬로 3개 이상 노드에 연속 선언(= 두 번 이상 그대로 내려보냄). 훅 제외 */
export const r03: Rule = (bp) => {
  const names = new Set(bp.nodes.filter((n) => n.kind !== "hook").flatMap((n) => n.props.map((p) => p.name)));
  const out: Violation[] = [];
  for (const prop of names) {
    if (SKIPPED_PROPS.has(prop)) continue;
    const has = new Map(bp.nodes.filter((n) => n.kind !== "hook" && n.props.some((p) => p.name === prop)).map((n) => [n.id, n]));
    const pairs = [...has.values()].filter((n) => n.parentId !== null && has.has(n.parentId)).map((n): [string, string] => [n.id, n.parentId!]);
    for (const group of groupConnected([...has.keys()], pairs)) {
      const members = new Set(group);
      const depth = (n: ComponentNode): number => (n.parentId !== null && members.has(n.parentId) ? 1 + depth(has.get(n.parentId)!) : 1);
      if (!group.some((id) => depth(has.get(id)!) >= 3)) continue;
      const nodes = group.map((id) => has.get(id)!);
      out.push({
        ruleId: "R-03",
        severity: "warning",
        nodeIds: group,
        message: `prop ${prop}이(가) ${nodes.map((n) => n.name).join(" → ")}로 3단계 이상 이어서 전달됩니다. 중간 노드가 쓰지 않는다면 context나 상태 위치 조정을 검토하세요.`,
      });
    }
  }
  return out;
};

// ---- R-05 재사용 후보 ----
export const R05_NAME_JACCARD = 0.5;
export const R05_TEXT_DICE = 0.4;

const words = (name: string) => new Set((name.match(/[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? []).map((w) => w.toLowerCase()));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return a.size + b.size - inter === 0 ? 0 : inter / (a.size + b.size - inter);
};
const bigrams = (text: string) => {
  const t = text.replace(/\s+/g, "");
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
  return out;
};
const dice = (a: Map<string, number>, b: Map<string, number>) => {
  let inter = 0;
  let total = 0;
  for (const v of a.values()) total += v;
  for (const v of b.values()) total += v;
  for (const [k, v] of a) inter += Math.min(v, b.get(k) ?? 0);
  return total === 0 ? 0 : (2 * inter) / total;
};

/** R-05 정보: 이름과 책임이 모두 비슷하고 조상-자손이 아닌 노드(훅 제외)는 재사용 후보. 이어진 후보끼리 묶어 1건 */
export const r05: Rule = (bp) => {
  const map = nodeMap(bp);
  const cands = bp.nodes.filter((n) => n.kind !== "hook").map((n) => ({ n, w: words(n.name), g: bigrams(n.responsibilities.join(" ")) }));
  const pairs: [string, string][] = [];
  for (let i = 0; i < cands.length; i++)
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i];
      const b = cands[j];
      if (jaccard(a.w, b.w) < R05_NAME_JACCARD || dice(a.g, b.g) < R05_TEXT_DICE) continue;
      if (isAncestorOrDescendant(map, a.n, b.n)) continue;
      pairs.push([a.n.id, b.n.id]);
    }
  const linked = new Set(pairs.flat());
  return groupConnected([...linked], pairs).map((ids) => ({
    ruleId: "R-05",
    severity: "info" as const,
    nodeIds: ids,
    message: `${ids.map((id) => map.get(id)!.name).join(", ")}은(는) 이름과 책임이 비슷합니다. 하나로 재사용할 수 있는지 확인하세요.`,
  }));
};
