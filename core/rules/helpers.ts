import type { Blueprint, ComponentNode } from "../schema/blueprint";
import { buildTree, type TreeNode } from "../schema/tree";

export type NodeMap = Map<string, ComponentNode>;

export const nodeMap = (bp: Blueprint): NodeMap => new Map(bp.nodes.map((n) => [n.id, n]));

/** 가까운 조상부터 루트까지 */
export function ancestorsOf(map: NodeMap, node: ComponentNode): ComponentNode[] {
  const out: ComponentNode[] = [];
  const seen = new Set<string>([node.id]);
  let cur = node.parentId === null ? undefined : map.get(node.parentId);
  while (cur && !seen.has(cur.id)) {
    out.push(cur);
    seen.add(cur.id);
    cur = cur.parentId === null ? undefined : map.get(cur.parentId);
  }
  return out;
}

export const isAncestorOrDescendant = (map: NodeMap, a: ComponentNode, b: ComponentNode): boolean =>
  ancestorsOf(map, a).some((x) => x.id === b.id) || ancestorsOf(map, b).some((x) => x.id === a.id);

/** 트리 순서(깊이 우선, 형제는 order 순)에서의 자리. 결과를 화면 순서로 정렬할 때 쓴다 */
export function treeIndex(bp: Blueprint): Map<string, number> {
  const out = new Map<string, number>();
  const root = buildTree(bp.nodes);
  const walk = (n: TreeNode) => {
    out.set(n.id, out.size);
    n.children.forEach(walk);
  };
  if (root) walk(root);
  return out;
}

/** 서로 이어진 것끼리 묶는 단순 union-find. 묶음(대표 키 → 원소들)을 돌려준다 */
export function groupConnected(ids: string[], pairs: [string, string][]): string[][] {
  const parent = new Map(ids.map((i) => [i, i]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const [a, b] of pairs) parent.set(find(a), find(b));
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  return [...groups.values()];
}
