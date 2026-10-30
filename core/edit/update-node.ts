import type { Blueprint, ComponentNode } from "../schema/blueprint";
import { commitNodes, reject, type EditResult } from "./result";

export type NodePatch = Partial<
  Pick<ComponentNode, "name" | "kind" | "responsibilities" | "state" | "props" | "events" | "dataFetch" | "renderMode" | "location" | "layout" | "placement" | "style">
>;

// 사용자가 고친 필드는 AI 가정 표시에서 뺀다. assumedFields는 "props"·"layout.gap"처럼 최상위 필드명으로 시작한다
function clearAssumed(node: ComponentNode, keys: string[]): ComponentNode {
  if (!node.assumed || !node.assumedFields?.length) return node; // 가정한 필드를 알 수 없으면 표시를 그대로 둔다
  const left = node.assumedFields.filter((f) => !keys.some((k) => f === k || f.startsWith(`${k}.`) || f.startsWith(`${k}[`)));
  if (left.length === node.assumedFields.length) return node;
  const next: ComponentNode = { ...node, assumedFields: left };
  if (left.length === 0) {
    delete next.assumedFields;
    next.assumed = false;
  }
  return next;
}

/** 노드 한 개의 내용을 고친다. id는 바꿀 수 없다. 값이 그대로면 설계도를 바꾸지 않는다 */
export function updateNode(bp: Blueprint, id: string, patch: NodePatch): EditResult {
  const node = bp.nodes.find((n) => n.id === id);
  if (!node) return reject("노드를 찾을 수 없습니다.");

  const keys = (Object.keys(patch) as (keyof NodePatch)[]).filter((k) => patch[k] !== undefined && JSON.stringify(patch[k]) !== JSON.stringify(node[k]));
  if (keys.length === 0) return { ok: true, blueprint: bp };

  if (patch.kind !== undefined && (patch.kind === "hook") !== (node.kind === "hook"))
    return reject("훅과 컴포넌트 사이로는 종류를 바꿀 수 없습니다. 새 노드로 추가하세요.", id, ["kind"]);
  if (patch.name !== undefined && bp.nodes.some((n) => n.id !== id && n.name === patch.name))
    return reject(`이름 ${patch.name}가 이미 있습니다.`, id, ["name"]);

  const changed = Object.fromEntries(keys.map((k) => [k, patch[k]]));
  const next = clearAssumed({ ...node, ...changed }, keys);

  const columns = next.layout?.display === "grid" ? next.layout.columns : undefined;
  if (columns !== undefined) {
    const tooWide = bp.nodes.filter((c) => c.parentId === id && typeof c.placement?.span === "number" && c.placement.span > columns);
    if (tooWide.length > 0) return reject(`${tooWide.map((c) => c.name).join(", ")}의 차지 칸이 ${columns}열보다 큽니다. 먼저 차지 칸을 줄이세요.`, id, ["layout", "columns"]);
  }
  // grid가 아니게 되면 자식들의 차지 칸은 의미가 없다
  const clearPlacement = node.layout?.display === "grid" && next.layout?.display !== "grid";
  return commitNodes(
    bp,
    bp.nodes.map((n) => (n.id === id ? next : clearPlacement && n.parentId === id && n.placement ? { ...n, placement: null } : n)),
    id,
  );
}
