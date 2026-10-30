"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { KIND_LABEL } from "./labels";
import { NODE_HEIGHT, NODE_WIDTH, type FlowNode } from "./toFlow";
import { useStructureStore } from "./StructureStoreProvider";

// 카드 안의 button이 키보드(Tab·Enter·Space)와 클릭 선택을 맡는다. React Flow의 노드 자체 포커스는 꺼 두어 탭 정지가 겹치지 않게 한다
export default function TreeNodeCard({ id, data }: NodeProps<FlowNode>) {
  const selected = useStructureStore((s) => s.selectedNodeId === id);
  const select = useStructureStore((s) => s.select);

  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${data.name}, ${KIND_LABEL[data.kind]}${data.assumed ? ", AI 가정" : ""}`}
        onClick={() => select(id)}
        className={cn(
          "flex h-16 w-44 flex-col items-start justify-center gap-1 rounded-lg border bg-card px-3 text-left outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          data.assumed ? "border-dashed border-warning" : "border-border",
          selected && "ring-2 ring-primary",
        )}
        data-width={NODE_WIDTH}
        data-height={NODE_HEIGHT}
      >
        <span className="w-full truncate text-sm font-medium text-foreground">{data.name}</span>
        <span className="flex items-center gap-1">
          <Badge variant="secondary">{KIND_LABEL[data.kind]}</Badge>
          {data.assumed && <span className="text-xs text-warning">AI 가정</span>}
        </span>
      </button>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </>
  );
}
