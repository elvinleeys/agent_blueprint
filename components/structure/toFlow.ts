import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import type { ComponentNode } from "../../core/schema/blueprint";
import { buildTree, type TreeNode } from "../../core/schema/tree";

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 64;

export type TreeCardData = { name: string; kind: ComponentNode["kind"]; assumed: boolean };
export type FlowNode = Node<TreeCardData, "card">;

type Layout = { order: string[]; positions: Map<string, { x: number; y: number }>; edges: Edge[] };

/**
 * 트리 모양이 같은지 가르는 키: 노드 id·부모·형제 순서. 이름·책임·스타일 같은 내용 수정으로는 바뀌지 않는다
 * (카드 크기가 고정이라 이름이 달라도 좌표가 같다). 부모 변경·순서 변경·추가·삭제 때만 바뀐다.
 */
export function treeStructureKey(nodes: readonly ComponentNode[]): string {
  return nodes
    .map((n) => `${n.id}:${n.parentId ?? ""}:${n.order}`)
    .sort()
    .join("|");
}

/** dagre로 위→아래 좌표를 계산한다(형제는 order 순으로 왼쪽→오른쪽). 루트가 하나가 아니면 null */
function layoutTree(nodes: readonly ComponentNode[]): Layout | null {
  const tree = buildTree(nodes);
  if (!tree) return null;

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

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of flat) {
    const p = graph.node(n.id); // dagre 좌표는 중심점이다
    positions.set(n.id, { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 });
  }
  return { order: flat.map((n) => n.id), positions, edges };
}

/**
 * 평면 노드를 React Flow의 노드·엣지로 바꾼다. 구조 키가 같으면 이전 배치(좌표·엣지)를 그대로 쓰고
 * 카드에 보일 데이터만 새로 채운다. stats.layouts는 dagre를 실제로 돌린 횟수다.
 */
export function createTreeFlow() {
  let key: string | null = null;
  let layout: Layout | null = null;
  const stats = { layouts: 0 };

  const flow = (nodes: readonly ComponentNode[]): { nodes: FlowNode[]; edges: Edge[] } => {
    const next = treeStructureKey(nodes);
    if (next !== key) {
      layout = layoutTree(nodes);
      key = next;
      stats.layouts++;
    }
    if (!layout) return { nodes: [], edges: [] };
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const flowNodes = layout.order.map((id): FlowNode => {
      const n = byId.get(id)!;
      return { id, type: "card", position: layout!.positions.get(id)!, data: { name: n.name, kind: n.kind, assumed: n.assumed } };
    });
    return { nodes: flowNodes, edges: layout.edges };
  };
  return Object.assign(flow, { stats });
}

/** 한 번만 계산한다(캐시 없음) */
export const toFlow = (nodes: readonly ComponentNode[]) => createTreeFlow()(nodes);
