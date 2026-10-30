import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { ComponentNode } from "../../core/schema/blueprint";
import { buildTree, type TreeNode } from "../../core/schema/tree";

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 64;

export type TreeCardData = { name: string; kind: ComponentNode["kind"]; assumed: boolean };
export type FlowNode = Node<TreeCardData, "card">;

/** 평면 노드를 React Flow의 노드·엣지로 바꾸고 dagre로 위→아래 좌표를 계산한다(형제는 order 순으로 왼쪽→오른쪽) */
export function toFlow(nodes: readonly ComponentNode[]): { nodes: FlowNode[]; edges: Edge[] } {
  const tree = buildTree(nodes);
  if (!tree) return { nodes: [], edges: [] };

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 24, ranksep: 56 });
  graph.setDefaultEdgeLabel(() => ({}));

  const flat: TreeNode[] = [];
  const edges: Edge[] = [];
  const walk = (n: TreeNode) => {
    flat.push(n);
    graph.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const c of n.children) {
      graph.setEdge(n.id, c.id);
      edges.push({ id: `${n.id}->${c.id}`, source: n.id, target: c.id });
      walk(c);
    }
  };
  walk(tree);
  dagre.layout(graph);

  const flowNodes = flat.map((n): FlowNode => {
    const p = graph.node(n.id); // dagre 좌표는 중심점이다
    return {
      id: n.id,
      type: "card",
      position: { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 },
      data: { name: n.name, kind: n.kind, assumed: n.assumed },
    };
  });
  return { nodes: flowNodes, edges };
}
