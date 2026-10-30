"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";
import { useMemo, useState } from "react";
import TreeNodeCard from "./TreeNodeCard";
import { createTreeFlow } from "./toFlow";
import { treeFlowOptions } from "./tree-options";
import { useStructureStore } from "./StructureStoreProvider";

const nodeTypes: NodeTypes = { card: TreeNodeCard };

// 읽기 전용: 이동·연결·편집은 막고 확대·축소·화면 맞춤만 허용한다. 클릭 선택은 onNodeClick, 키보드 선택은 카드 안의 button이 맡는다
export default function TreeView() {
  const blueprint = useStructureStore((s) => s.blueprint);
  const select = useStructureStore((s) => s.requestSelect); // 화면에만 있는 틀린 입력이 있으면 확인을 거친다
  const [flow] = useState(createTreeFlow); // 구조가 같으면 이전 배치를 재사용한다(이름·스타일 수정에는 dagre를 다시 돌리지 않는다)
  const { nodes, edges } = useMemo(() => flow(blueprint?.nodes ?? []), [flow, blueprint]);
  const options = useMemo(() => treeFlowOptions(select), [select]);

  if (nodes.length === 0) return <p className="text-sm text-foreground-tertiary">트리를 그릴 수 없는 설계도입니다.</p>;
  return (
    <div className="h-160 w-full rounded-lg border border-border bg-section">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.2} {...options}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
