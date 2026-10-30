"use client";

import { useRef, useState } from "react";
import type { ComponentNode } from "@/core/schema/blueprint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import BasicSection from "./edit/BasicSection";
import { ConfirmDialog } from "./edit/ConfirmDialog";
import LayoutSection from "./edit/LayoutSection";
import RoleSection from "./edit/RoleSection";
import { Section } from "./edit/Section";
import StructureSection from "./edit/StructureSection";
import StyleSection from "./edit/StyleSection";
import { KIND_LABEL } from "./labels";
import { useStructureApi, useStructureStore } from "./StructureStoreProvider";

type SectionId = "basic" | "role" | "layout" | "style" | "structure";
/** 구역이 맡는 입력칸 키의 앞부분. 오류 개수와 "첫 오류로 이동"이 이 표를 쓴다 */
const PREFIXES: Record<SectionId, string[]> = {
  basic: ["name", "kind", "location", "renderMode"],
  role: ["responsibilities", "state", "props", "events", "dataFetch"],
  layout: ["layout", "placement"],
  style: ["style"],
  structure: ["structure"],
};
const ORDER: SectionId[] = ["basic", "role", "layout", "style", "structure"]; // 화면에 나오는 순서
const inSection = (key: string, id: SectionId) => PREFIXES[id].some((p) => key === p || key.startsWith(`${p}.`));

const Guide = ({ children, status }: { children: string; status?: boolean }) => (
  <p role={status ? "status" : undefined} className="text-sm text-foreground-tertiary">
    {children}
  </p>
);

function NodeEditor({ node, open, setOpen }: { node: ComponentNode; open: Record<SectionId, boolean>; setOpen: (id: SectionId, value: boolean) => void }) {
  const blueprint = useStructureStore((s) => s.blueprint)!;
  const errors = useStructureStore((s) => s.editErrors);
  const normalized = useStructureStore((s) => s.normalized);
  const rootRef = useRef<HTMLDivElement>(null);

  const parent = blueprint.nodes.find((n) => n.id === node.parentId);
  const fixes = normalized.filter((c) => c.nodeId === node.id);
  const isHook = node.kind === "hook";
  const errorKeys = Object.keys(errors);
  const count = (id: SectionId) => errorKeys.filter((k) => inSection(k, id)).length;

  function goToFirstError() {
    const first = ORDER.find((id) => count(id) > 0);
    if (first) setOpen(first, true); // 접힌 구역 안의 칸은 포커스를 받을 수 없으므로 먼저 펼친다
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="break-all text-base font-semibold text-foreground">{node.name}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[node.kind]}</Badge>
          {node.assumed && <Badge variant="outline" className="border-dashed border-warning text-warning">AI 가정</Badge>}
        </div>
        <p className="text-xs text-foreground-tertiary">부모: {parent ? parent.name : "없음(루트)"}</p>
        {node.assumed && !node.assumedFields?.length && <p className="text-xs text-foreground-secondary">AI가 입력 없이 채운 값이 있습니다(필드 목록 없음).</p>}
      </div>

      {errorKeys.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive bg-destructive-surface p-3 text-sm">
          <p className="text-destructive">
            설계도에 반영되지 않은 입력 {errorKeys.length}개 · 첫 오류: {errors[errorKeys[0]]}
          </p>
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={goToFirstError}>
            첫 오류로 이동
          </Button>
        </div>
      )}

      <Section title="기본 정보" open={open.basic} onOpenChange={(v) => setOpen("basic", v)} errorCount={count("basic")}>
        <BasicSection bp={blueprint} node={node} />
      </Section>
      <Section title="역할·데이터" open={open.role} onOpenChange={(v) => setOpen("role", v)} errorCount={count("role")}>
        <RoleSection node={node} />
      </Section>
      {!isHook && (
        <>
          <Section title="배치" open={open.layout} onOpenChange={(v) => setOpen("layout", v)} errorCount={count("layout")}>
            <LayoutSection bp={blueprint} node={node} parent={parent} />
          </Section>
          <Section title="스타일" open={open.style} onOpenChange={(v) => setOpen("style", v)} errorCount={count("style")}>
            <StyleSection bp={blueprint} node={node} />
          </Section>
        </>
      )}
      <Section title="구조 편집" open={open.structure} onOpenChange={(v) => setOpen("structure", v)} errorCount={count("structure")}>
        <StructureSection bp={blueprint} node={node} />
      </Section>

      {fixes.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-foreground-tertiary">자동 보정 내역</h4>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {fixes.map((c, i) => (
              <li key={i}>
                {c.path}: {c.detail}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** 오른쪽 편집 패널. 설계도가 없거나 초안을 만드는 중이거나 노드를 고르지 않았으면 안내만 보인다 */
export default function NodeEditPanel() {
  const api = useStructureApi();
  const blueprint = useStructureStore((s) => s.blueprint);
  const selectedId = useStructureStore((s) => s.selectedNodeId);
  const status = useStructureStore((s) => s.status);
  const notices = useStructureStore((s) => s.editNotices);
  const selectRequest = useStructureStore((s) => s.selectRequest);
  // 접힘 상태는 노드를 바꿔도 유지한다
  const [open, setOpenState] = useState<Record<SectionId, boolean>>({ basic: true, role: true, layout: false, style: false, structure: false });
  const setOpen = (id: SectionId, value: boolean) => setOpenState((o) => (o[id] === value ? o : { ...o, [id]: value }));

  const node = blueprint?.nodes.find((n) => n.id === selectedId);
  const generating = status === "resizing" || status === "running";

  return (
    <div className="flex flex-col gap-3">
      {notices.length > 0 && (
        <div role="status" className="flex items-start justify-between gap-2 rounded-lg border border-border bg-section p-3 text-sm">
          <ul className="flex flex-col gap-1 text-foreground">
            {notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <Button type="button" size="sm" variant="ghost" onClick={() => api.getState().dismissNotices()}>
            닫기
          </Button>
        </div>
      )}

      {!blueprint ? (
        <Guide>아직 설계도가 없습니다. 초안을 만든 뒤 노드를 골라 고칠 수 있습니다.</Guide>
      ) : generating ? (
        <Guide status>초안을 만드는 중에는 편집할 수 없습니다. 끝나면 다시 편집할 수 있습니다.</Guide>
      ) : !node ? (
        <Guide>미리보기의 상자나 트리의 노드를 선택하면 여기에서 고칠 수 있습니다.</Guide>
      ) : (
        <NodeEditor key={node.id} node={node} open={open} setOpen={setOpen} />
      )}

      <ConfirmDialog
        open={selectRequest !== null}
        title="저장되지 않은 수정을 취소할까요?"
        description="설계도에 반영되지 않은 입력(오류가 있는 칸)이 있습니다. 다른 노드를 고르면 그 입력은 사라집니다."
        confirmLabel="취소하고 이동"
        cancelLabel="계속 고치기"
        onCancel={() => api.getState().cancelSelect()}
        onConfirm={() => api.getState().confirmSelect()}
      />
    </div>
  );
}
