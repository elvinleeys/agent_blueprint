"use client";

import { emptyStyle } from "@/core/edit/layout";
import { isAssumedField, updateNode } from "@/core/edit/update-node";
import type { Blueprint, ComponentNode } from "@/core/schema/blueprint";
import { CheckField } from "./controls";
import { useEditApi } from "./Field";
import { RecordListField, type Column } from "./ListFields";

type PropertyRow = { property: string; value: string; isToken: boolean };

const COLUMNS: Column<PropertyRow>[] = [
  { key: "property", label: "속성", required: true, placeholder: "속성 (예: background-color)" },
  { key: "value", label: "값", required: true, placeholder: "값 (예: color.primary)" },
  { key: "isToken", label: "디자인 토큰 값", kind: "check" },
];

/** 스타일: 이 노드 자신의 모양(속성 목록)과 바깥 여백 소유 여부. 배치 속성은 배치 구역에서 지정한다 */
export default function StyleSection({ bp, node }: { bp: Blueprint; node: ComponentNode }) {
  const { apply } = useEditApi();
  const style = node.style;
  const base = () => style ?? emptyStyle(bp.stack.styling); // 스타일이 아직 없으면 스택에 맞는 빈 스타일에서 시작한다

  return (
    <>
      <RecordListField<PropertyRow>
        fieldKey="style.properties"
        label="스타일 속성"
        itemLabel="속성"
        rows={style?.properties ?? []}
        columns={COLUMNS}
        emptyRow={{ property: "", value: "", isToken: false }}
        rowPath={["style", "properties"]}
        assumed={isAssumedField(node, "style")}
        hint="display·gap·flex-direction 같은 배치 속성은 입력할 수 없습니다. 배치 구역에서 지정하세요."
        onCommit={(properties) => {
          if (!style && properties.length === 0) return { ok: true, blueprint: bp }; // 아직 스타일이 없고 넣을 속성도 없으면 바꿀 것이 없다
          return apply((b) => updateNode(b, node.id, { style: { ...base(), properties } }));
        }}
      />
      <CheckField fieldKey="style.ownsOuterSpacing" label="바깥 여백(margin 등)을 스스로 가짐" checked={style?.ownsOuterSpacing ?? false} hint="여백은 부모의 간격으로 주는 것을 권장합니다." onChange={(ownsOuterSpacing) => apply((b) => updateNode(b, node.id, { style: { ...base(), ownsOuterSpacing } }))} />
    </>
  );
}
