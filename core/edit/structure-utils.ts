import type { ComponentNode } from "../schema/blueprint";

/** 한 부모의 자식을 order 순(같으면 배열 순서)으로 돌려준다 */
export function kidsOf(nodes: readonly ComponentNode[], parentId: string | null): ComponentNode[] {
  return nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.parentId === parentId)
    .sort((a, b) => a.n.order - b.n.order || a.i - b.i)
    .map(({ n }) => n);
}

export function descendantIds(nodes: readonly ComponentNode[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (pid: string) => {
    for (const n of nodes) {
      if (n.parentId !== pid || out.has(n.id)) continue;
      out.add(n.id);
      walk(n.id);
    }
  };
  walk(id);
  return out;
}

/** ids의 순서대로 order를 0부터 다시 매긴다(ids에 없는 노드는 그대로) */
export function withOrders(nodes: ComponentNode[], ids: string[]): ComponentNode[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return nodes.map((n) => (rank.has(n.id) && n.order !== rank.get(n.id) ? { ...n, order: rank.get(n.id)! } : n));
}

/** 자식을 처음 받는 노드에 채우는 기본 배치: 세로 flex, 간격 없음 */
export const defaultLayout = (): NonNullable<ComponentNode["layout"]> => ({ display: "flex", direction: "column", gap: null });

/** 노드 자신 또는 조상 중에 client가 있는지(client 파일이 불러온 컴포넌트는 server로 남을 수 없다) */
export function underClient(nodes: readonly ComponentNode[], node: ComponentNode | undefined): boolean {
  for (let cur = node; cur; cur = nodes.find((n) => n.id === cur!.parentId)) if (cur.renderMode === "client") return true;
  return false;
}

/** 새 부모 아래에서도 유효한 차지 칸만 남긴다: 부모가 grid이고 span이 열 수 이하일 때 */
export function placementFor(parent: ComponentNode | undefined, placement: ComponentNode["placement"]): ComponentNode["placement"] {
  const layout = parent?.layout;
  if (!placement || layout?.display !== "grid") return null;
  return typeof placement.span === "number" && placement.span > (layout.columns ?? 0) ? null : placement;
}
