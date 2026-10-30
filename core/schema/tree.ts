import type { ComponentNode } from "./blueprint";

export type TreeNode = ComponentNode & { children: TreeNode[] };

/**
 * 평면 노드 배열을 부모가 자식을 포함하는 트리로 바꾼다(계산 결과일 뿐 저장하지 않는다).
 * 형제는 order 오름차순(같으면 배열 순서). parentId가 null인 노드가 정확히 1개가 아니면 null.
 * 루트에서 도달할 수 없는 노드(연결 안 된 묶음·순환)는 트리에 넣지 않는다(검증을 통과한 설계도에는 없다).
 */
export function buildTree(nodes: readonly ComponentNode[]): TreeNode | null {
  const roots = nodes.filter((n) => n.parentId === null);
  if (roots.length !== 1) return null;

  const byParent = new Map<string, ComponentNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    byParent.set(n.parentId, [...(byParent.get(n.parentId) ?? []), n]);
  }

  const seen = new Set<string>();
  const build = (n: ComponentNode): TreeNode => {
    seen.add(n.id);
    const kids = (byParent.get(n.id) ?? [])
      .filter((c) => !seen.has(c.id)) // 순환·중복 id로 무한 재귀하지 않게 한다
      .map((c, i) => ({ c, i }))
      .sort((a, b) => a.c.order - b.c.order || a.i - b.i)
      .map(({ c }) => c);
    return { ...n, children: kids.map(build) };
  };
  return build(roots[0]);
}
