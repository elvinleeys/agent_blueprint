import type { Blueprint } from "../schema/blueprint";
import { commitNodes, reject, type EditResult } from "./result";
import { descendantIds, kidsOf, placementFor, withOrders } from "./structure-utils";

/**
 * 노드를 다른 부모 아래 마지막 자리로 옮긴다. 하위 노드는 그대로 따라간다(parentId만 바뀜).
 * 거부: 루트, 자기 자신·자손 아래, 훅 아래. 옛·새 부모의 형제 order를 0부터 다시 매기고,
 * 새 부모 아래에서 유효하지 않은 차지 칸(부모가 grid가 아니거나 span이 열 수 초과)은 비운다. location은 바꾸지 않는다.
 */
export function moveNode(bp: Blueprint, id: string, newParentId: string): EditResult {
  const node = bp.nodes.find((n) => n.id === id);
  if (!node) return reject("노드를 찾을 수 없습니다.");
  if (node.parentId === null) return reject("루트는 이동할 수 없습니다.", id, ["parentId"]);
  const parent = bp.nodes.find((n) => n.id === newParentId);
  if (!parent) return reject("새 부모를 찾을 수 없습니다.", id, ["parentId"]);
  if (parent.id === id || descendantIds(bp.nodes, id).has(parent.id)) return reject("자기 자신이나 자손 아래로는 옮길 수 없습니다.", id, ["parentId"]);
  if (parent.kind === "hook") return reject("훅 아래로는 옮길 수 없습니다.", id, ["parentId"]);
  if (node.parentId === newParentId) return { ok: true, blueprint: bp };

  const oldOrder = kidsOf(bp.nodes, node.parentId).filter((k) => k.id !== id).map((k) => k.id);
  const newOrder = [...kidsOf(bp.nodes, newParentId).map((k) => k.id), id];
  const moved = bp.nodes.map((n) => {
    if (n.id === id) return { ...n, parentId: newParentId, placement: placementFor(parent, n.placement) };
    // 자식을 배치하는 방식이 없으면 스키마가 거부하므로 기본 block을 채운다(훅은 배치 대상이 아니다)
    if (n.id === parent.id && !n.layout && node.kind !== "hook") return { ...n, layout: { display: "block" as const, gap: null } };
    return n;
  });
  return commitNodes(bp, withOrders(withOrders(moved, oldOrder), newOrder), id);
}
