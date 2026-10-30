import type { Blueprint } from "../schema/blueprint";
import { commitNodes, reject, type EditResult } from "./result";
import { descendantIds, kidsOf, placementFor, withOrders } from "./structure-utils";

/** cascade: 자손까지 함께 삭제 / promote: 자식을 삭제된 노드 자리에 순서대로 끼워 상위로 옮김 */
export type DeleteMode = "cascade" | "promote";

/**
 * 노드를 삭제한다. 루트는 삭제할 수 없고, 자식이 없으면 mode는 무시한다. 성공하면 부모를 selectId로 돌려준다.
 * promote: 옮겨진 자식의 차지 칸은 새 부모 아래에서 유효할 때(grid, span ≤ 열 수)만 남긴다. 형제 order는 0부터 다시 매긴다.
 */
export function deleteNode(bp: Blueprint, id: string, mode: DeleteMode): EditResult {
  const node = bp.nodes.find((n) => n.id === id);
  if (!node) return reject("노드를 찾을 수 없습니다.");
  if (node.parentId === null) return reject("루트는 삭제할 수 없습니다.", id);
  const parent = bp.nodes.find((n) => n.id === node.parentId);

  const kids = kidsOf(bp.nodes, id);
  const siblings = kidsOf(bp.nodes, node.parentId).map((k) => k.id);

  let nodes;
  if (kids.length === 0 || mode === "cascade") {
    const gone = new Set([id, ...descendantIds(bp.nodes, id)]);
    nodes = withOrders(bp.nodes.filter((n) => !gone.has(n.id)), siblings.filter((s) => s !== id));
  } else {
    const kidIds = new Set(kids.map((k) => k.id));
    const order = siblings.flatMap((s) => (s === id ? kids.map((k) => k.id) : [s]));
    nodes = withOrders(
      bp.nodes.filter((n) => n.id !== id).map((n) => (kidIds.has(n.id) ? { ...n, parentId: node.parentId, placement: placementFor(parent, n.placement) } : n)),
      order,
    );
  }
  const r = commitNodes(bp, nodes);
  return r.ok ? { ...r, selectId: node.parentId } : r;
}
