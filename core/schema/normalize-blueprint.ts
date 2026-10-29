export type NormalizeChange = { nodeId: string; path: string; detail: string };
export type NormalizeResult = { blueprint: unknown; changes: NormalizeChange[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * AI가 만든 설계도에서 기계적으로 고칠 수 있는 오류만 보정한다. 스키마 검증 전의 원시 JSON을 받고 입력은 바꾸지 않는다.
 * 보정: grid의 layout·responsive에 있는 direction 제거(responsive 항목에 breakpoint만 남으면 항목 삭제, '의도 확인 필요' 표시), flex의 columns 제거, 같은 부모 아래 order 중복 시 0부터 재정렬.
 * 보정하지 않음: FSD location 형식, 이름 형식·중복, 루트 개수 등 의미 판단이 필요한 오류(모델이 다시 만들어야 한다).
 */
export function normalizeBlueprint(input: unknown): NormalizeResult {
  if (!isObj(input) || !Array.isArray(input.nodes)) return { blueprint: input, changes: [] };

  const changes: NormalizeChange[] = [];
  const nodes: unknown[] = input.nodes.map((n) => (isObj(n) ? structuredClone(n) : n));
  const idOf = (n: Obj, index: number) => (typeof n.id === "string" ? n.id : `nodes[${index}]`);

  // display와 맞지 않는 방향·열 수 필드를 제거한다 (layout 본체와 responsive 항목에 같은 규칙)
  const stripMismatch = (target: Obj, display: unknown, path: string, nodeId: string) => {
    if (display === "grid" && target.direction !== undefined) {
      changes.push({ nodeId, path: `${path}.direction`, detail: `grid에는 direction을 쓸 수 없어 제거(값: ${String(target.direction)})` });
      delete target.direction;
    }
    if (display === "flex" && target.columns !== undefined) {
      changes.push({ nodeId, path: `${path}.columns`, detail: `flex에는 columns를 쓸 수 없어 제거(값: ${String(target.columns)})` });
      delete target.columns;
    }
  };

  nodes.forEach((n, i) => {
    if (!isObj(n) || !isObj(n.layout)) return;
    const nodeId = idOf(n, i);
    stripMismatch(n.layout, n.layout.display, "layout", nodeId);
    const layout = n.layout;
    if (Array.isArray(layout.responsive)) {
      layout.responsive = layout.responsive.filter((r, k) => {
        if (!isObj(r)) return true;
        const hadDirection = r.direction !== undefined;
        stripMismatch(r, layout.display, `layout.responsive.${k}`, nodeId);
        // grid에서 direction만 있던 항목은 breakpoint만 남는다. columns로 바꾸는 추측은 하지 않고 항목을 지운다
        if (layout.display === "grid" && hadDirection && Object.keys(r).length === 1 && r.breakpoint !== undefined) {
          changes.push({ nodeId, path: `layout.responsive.${k}`, detail: `direction 제거 후 breakpoint(${String(r.breakpoint)})만 남아 항목 삭제 — 의도 확인 필요(columns를 의도했을 수 있음)` });
          return false;
        }
        return true;
      });
    }
  });

  // 같은 부모 아래 order가 겹치면 (order, 원래 위치) 순으로 0부터 다시 매긴다. 겹치지 않는 틈(0,2,5)은 그대로 둔다.
  // 루트(parentId null)는 루트 개수 문제와 얽혀 있어 건드리지 않는다.
  const siblings = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    if (isObj(n) && typeof n.parentId === "string" && typeof n.order === "number") {
      siblings.set(n.parentId, [...(siblings.get(n.parentId) ?? []), i]);
    }
  });
  for (const [parentId, indexes] of siblings) {
    const orders = indexes.map((i) => (nodes[i] as Obj).order as number);
    if (new Set(orders).size === orders.length) continue;
    const sorted = [...indexes].sort((a, b) => ((nodes[a] as Obj).order as number) - ((nodes[b] as Obj).order as number) || a - b);
    sorted.forEach((i, rank) => {
      const n = nodes[i] as Obj;
      if (n.order !== rank) {
        changes.push({ nodeId: idOf(n, i), path: "order", detail: `같은 부모(${parentId}) 아래 order가 겹쳐 ${String(n.order)} → ${rank}로 재정렬` });
        n.order = rank;
      }
    });
  }

  return { blueprint: { ...input, nodes }, changes };
}
