"use client";

import { isAssumedField, updateNode } from "@/core/edit/update-node";
import type { ComponentNode } from "@/core/schema/blueprint";
import { CheckField } from "./controls";
import { useEditApi } from "./Field";
import { RecordListField, StringListField, type Column } from "./ListFields";

type StateRow = { name: string; description: string };
type PropRow = { name: string; type: string };

const STATE_COLUMNS: Column<StateRow>[] = [
  { key: "name", label: "이름", required: true },
  { key: "description", label: "설명" },
];
const PROP_COLUMNS: Column<PropRow>[] = [
  { key: "name", label: "이름", required: true },
  { key: "type", label: "타입", required: true, placeholder: "타입 (예: number)" },
];

/** 역할·데이터: 책임(최대 5), 상태, props, 이벤트, 데이터 조회 */
export default function RoleSection({ node }: { node: ComponentNode }) {
  const { apply } = useEditApi();
  const edit = (patch: Parameters<typeof updateNode>[2]) => apply((b) => updateNode(b, node.id, patch));

  return (
    <>
      <StringListField fieldKey="responsibilities" label="책임" itemLabel="책임" rows={node.responsibilities} max={5} assumed={isAssumedField(node, "responsibilities")} onCommit={(responsibilities) => edit({ responsibilities })} />

      <RecordListField<StateRow>
        fieldKey="state"
        label="상태"
        itemLabel="상태"
        rows={node.state.map((s) => ({ name: s.name, description: s.description ?? "" }))}
        columns={STATE_COLUMNS}
        emptyRow={{ name: "", description: "" }}
        rowPath={["state"]}
        assumed={isAssumedField(node, "state")}
        onCommit={(rows) => edit({ state: rows.map((r) => (r.description.trim() === "" ? { name: r.name } : { name: r.name, description: r.description })) })}
      />

      <RecordListField<PropRow>
        fieldKey="props"
        label="props"
        itemLabel="prop"
        rows={node.props}
        columns={PROP_COLUMNS}
        emptyRow={{ name: "", type: "" }}
        rowPath={["props"]}
        assumed={isAssumedField(node, "props")}
        onCommit={(props) => edit({ props })}
      />

      {node.kind !== "hook" && <StringListField fieldKey="events" label="이벤트" itemLabel="이벤트" rows={node.events} placeholder="예: onClick" assumed={isAssumedField(node, "events")} onCommit={(events) => edit({ events })} />}

      <CheckField fieldKey="dataFetch" label="API 호출 책임이 있음 (데이터 조회)" checked={node.dataFetch} assumed={isAssumedField(node, "dataFetch")} onChange={(dataFetch) => edit({ dataFetch })} />
    </>
  );
}
