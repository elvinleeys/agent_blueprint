"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, ReactFlow, type NodeTypes } from "@xyflow/react";
import { useMemo } from "react";
import TreeNodeCard from "./TreeNodeCard";
import { toFlow } from "./toFlow";
import { useStructureStore } from "./StructureStoreProvider";

const nodeTypes: NodeTypes = { card: TreeNodeCard };

// 읽기 전용: 이동·연결·편집은 막고 확대·축소·화면 맞춤만 허용한다. 선택은 카드 안의 button이 맡는다
export default function TreeView() {
  const blueprint = useStructureStore((s) => s.blueprint);
  const { nodes, edges } = useMemo(() => toFlow(blueprint?.nodes ?? []), [blueprint]);

  if (nodes.length === 0) return <p className="text-sm text-foreground-tertiary">트리를 그릴 수 없는 설계도입니다.</p>;
  return (
    <div className="h-160 w-full rounded-lg border border-border bg-section">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
