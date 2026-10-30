import type { Blueprint, ComponentNode } from "../schema/blueprint";
import { commitNodes, reject, type EditResult } from "./result";
import { defaultLayout, descendantIds, kidsOf, placementFor, underClient, withOrders } from "./structure-utils";

/**
 * 부모 변경의 선택지: 자기 자신, 자기 자손, 훅을 뺀 노드를 트리 순서(위→아래, 형제는 order 순)로 돌려준다. depth는 들여쓰기용.
 * 루트이거나 없는 노드는 옮길 수 없으므로 빈 배열이다.
 */
export function moveTargets(bp: Blueprint, id: string): { node: ComponentNode; depth: number }[] {
  const node = bp.nodes.find((n) => n.id === id);
  const root = bp.nodes.find((n) => n.parentId === null);
  if (!node || node.parentId === null || !root) return [];
  const banned = descendantIds(bp.nodes, id).add(id);
  const out: { node: ComponentNode; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (n: ComponentNode, depth: number) => {
    if (seen.has(n.id)) return; // 검증을 통과한 설계도에는 순환이 없지만 무한 재귀는 막는다
    seen.add(n.id);
    if (!banned.has(n.id) && n.kind !== "hook") out.push({ node: n, depth });
    for (const k of kidsOf(bp.nodes, n.id)) if (!banned.has(n.id)) walk(k, depth + 1);
  };
  walk(root, 0);
  return out;
}

/**
 * 노드를 다른 부모 아래 마지막 자리로 옮긴다. 하위 노드는 그대로 따라간다(parentId만 바뀜).
 * 거부: 루트, 자기 자신·자손 아래, 훅 아래. 옛·새 부모의 형제 order를 0부터 다시 매기고,
 * 새 부모 아래에서 유효하지 않은 차지 칸(부모가 grid가 아니거나 span이 열 수 초과)은 비운다. location은 바꾸지 않는다.
 * 새 부모에 layout이 없으면 세로 flex를 채우고(filledLayout), Next.js에서 새 부모가 client 아래(자신 포함)면
 * 옮긴 노드와 자손 중 server를 client로 바꾼다(toClient). client 밖으로 옮길 때는 바꾸지 않는다.
 */
export function moveNode(bp: Blueprint, id: string, newParentId: string): EditResult {
  const node = bp.nodes.find((n) => n.id === id);
  if (!node) return reject("노드를 찾을 수 없습니다.");
  if (node.parentId === null) return reject("루트는 이동할 수 없습니다.", id, ["parentId"]);
  const parent = bp.nodes.find((n) => n.id === newParentId);
  if (!parent) return reject("새 부모를 찾을 수 없습니다.", id, ["parentId"]);
  const subtree = descendantIds(bp.nodes, id);
  if (parent.id === id || subtree.has(parent.id)) return reject("자기 자신이나 자손 아래로는 옮길 수 없습니다.", id, ["parentId"]);
  if (parent.kind === "hook") return reject("훅 아래로는 옮길 수 없습니다.", id, ["parentId"]);
  if (node.parentId === newParentId) return { ok: true, blueprint: bp };

  subtree.add(id);
  const forceClient = bp.stack.framework === "next" && underClient(bp.nodes, parent);
  const fillLayout = !parent.layout && node.kind !== "hook"; // 훅은 배치 대상이 아니라 스키마가 layout을 요구하지 않는다
  const toClient: string[] = [];

  const oldOrder = kidsOf(bp.nodes, node.parentId).filter((k) => k.id !== id).map((k) => k.id);
  const newOrder = [...kidsOf(bp.nodes, newParentId).map((k) => k.id), id];
  const moved = bp.nodes.map((n) => {
    let next = n;
    if (n.id === id) next = { ...next, parentId: newParentId, placement: placementFor(parent, n.placement) };
    if (n.id === parent.id && fillLayout) next = { ...next, layout: defaultLayout() };
    if (forceClient && subtree.has(n.id) && n.renderMode === "server") {
      next = { ...next, renderMode: "client" };
      toClient.push(n.id);
    }
    return next;
  });

  const r = commitNodes(bp, withOrders(withOrders(moved, oldOrder), newOrder), id);
  if (!r.ok) return r;
  return { ...r, ...(fillLayout ? { filledLayout: [parent.id] } : {}), ...(toClient.length > 0 ? { toClient } : {}) };
}
