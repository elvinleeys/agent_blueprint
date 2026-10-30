"use client";

import { isAssumedField, updateNode } from "@/core/edit/update-node";
import type { Blueprint, ComponentNode } from "@/core/schema/blueprint";
import { KIND_LABEL } from "../labels";
import { SelectField, TextField, type Option } from "./controls";
import { useEditApi } from "./Field";

const KIND_OPTIONS: Option[] = (["page", "container", "presentational"] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }));
const RENDER_OPTIONS: Option[] = [
  { value: "server", label: "Server Component" },
  { value: "client", label: "Client Component" },
];
const LOCATION_HINT: Record<Blueprint["stack"]["architecture"], string> = {
  fsd: "계층/슬라이스/세그먼트 형식입니다. 예: features/add-to-cart/ui, shared/ui",
  "type-based": "유형별 폴더입니다. 예: components, hooks",
  "feature-based": "기능별 폴더입니다. 예: features/cart/components",
};

/** 기본 정보: 이름, 종류, 파일 위치, 렌더링 방식(Next.js 컴포넌트만) */
export default function BasicSection({ bp, node }: { bp: Blueprint; node: ComponentNode }) {
  const { apply } = useEditApi();
  const isHook = node.kind === "hook";
  const edit = (patch: Parameters<typeof updateNode>[2]) => apply((b) => updateNode(b, node.id, patch));

  return (
    <>
      <TextField fieldKey="name" label="이름" value={node.name} mono assumed={isAssumedField(node, "name")} hint={isHook ? "use로 시작하는 PascalCase (예: useCart)" : "PascalCase (예: ProductCard). 설계도 안에서 겹치면 안 됩니다."} onChange={(name) => edit({ name })} />

      {isHook ? (
        <p className="text-sm text-foreground-secondary">종류: {KIND_LABEL.hook} (훅은 컴포넌트로 바꿀 수 없습니다. 필요하면 새 노드로 추가하세요.)</p>
      ) : (
        <SelectField fieldKey="kind" label="종류" value={node.kind} options={KIND_OPTIONS} assumed={isAssumedField(node, "kind")} hint="훅은 컴포넌트로, 컴포넌트는 훅으로 바꿀 수 없습니다. 새 노드로 추가하세요." onChange={(kind) => edit({ kind: kind as ComponentNode["kind"] })} />
      )}

      <TextField fieldKey="location" label="파일 위치" value={node.location.dir} mono assumed={isAssumedField(node, "location")} hint={LOCATION_HINT[bp.stack.architecture]} onChange={(dir) => edit({ location: { dir } })} />

      {bp.stack.framework === "next" && !isHook && node.renderMode !== null && (
        <SelectField fieldKey="renderMode" label="렌더링 방식" value={node.renderMode} options={RENDER_OPTIONS} assumed={isAssumedField(node, "renderMode")} onChange={(renderMode) => edit({ renderMode: renderMode as "server" | "client" })} />
      )}
    </>
  );
}
