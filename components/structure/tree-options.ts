/**
 * 트리 보기(React Flow)의 읽기 전용 옵션. 이동·연결·편집은 막고 클릭만 선택으로 받는다.
 *
 * 주의: React Flow는 노드가 선택 가능·드래그 가능하지 않고 클릭 핸들러도 없으면 노드 래퍼에 `pointer-events: none`을 준다
 * (그러면 카드 안의 button도 마우스 클릭을 받지 못한다). 그래서 선택·드래그를 끄는 대신 onNodeClick을 반드시 넘긴다.
 */
export function treeFlowOptions(select: (id: string) => void) {
  return {
    nodesDraggable: false,
    nodesConnectable: false,
    nodesFocusable: false, // 키보드 포커스는 카드 안의 button이 맡는다
    edgesFocusable: false,
    elementsSelectable: false,
    onNodeClick: (_event: unknown, node: { id: string }) => select(node.id),
  };
}

/** React Flow가 노드에 마우스 이벤트를 전달하는 조건(@xyflow/react NodeWrapper의 hasPointerEvents와 같은 규칙) */
export const nodesReceiveClicks = (o: { elementsSelectable?: boolean; nodesDraggable?: boolean; onNodeClick?: unknown }) =>
  Boolean(o.elementsSelectable || o.nodesDraggable || o.onNodeClick);
