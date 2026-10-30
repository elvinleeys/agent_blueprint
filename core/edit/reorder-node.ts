import type { Blueprint } from "../schema/blueprint";
import { commitNodes, reject, type EditResult } from "./result";
import { kidsOf, withOrders } from "./structure-utils";

/** 같은 부모 아래에서 한 칸 위·아래로 옮긴다. 형제 order는 0부터 다시 매겨진다 */
export function reorderNode(bp: Blueprint, id: string, direction: "up" | "down"): EditResult {
  const node = bp.nodes.find((n) => n.id === id);
  if (!node) return reject("노드를 찾을 수 없습니다.");
  if (node.parentId === null) return reject("루트는 순서를 바꿀 수 없습니다.", id, ["order"]);

  const ids = kidsOf(bp.nodes, node.parentId).map((k) => k.id);
  const at = ids.indexOf(id);
  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= ids.length) return reject(direction === "up" ? "이미 맨 위입니다." : "이미 맨 아래입니다.", id, ["order"]);
  [ids[at], ids[to]] = [ids[to], ids[at]];
  return commitNodes(bp, withOrders(bp.nodes, ids), id);
}
