"use client";

import { useState } from "react";
import { changeDisplay, displayChangeImpact, withResponsive } from "@/core/edit/layout";
import { reject, type EditResult } from "@/core/edit/result";
import { isAssumedField, updateNode } from "@/core/edit/update-node";
import type { Blueprint, ComponentNode } from "@/core/schema/blueprint";
import { SelectField, TextField, type Option } from "./controls";
import { ConfirmDialog } from "./ConfirmDialog";
import { useEditApi } from "./Field";
import { parseIntInRange } from "./list-draft";

type Layout = NonNullable<ComponentNode["layout"]>;
type Display = Layout["display"];
const DEFAULT = "default";

const ALIGN_OPTIONS: Option[] = [
  { value: DEFAULT, label: "지정 안 함" },
  { value: "start", label: "시작" },
  { value: "center", label: "가운데" },
  { value: "end", label: "끝" },
  { value: "stretch", label: "늘이기" },
];
const JUSTIFY_OPTIONS: Option[] = [
  { value: DEFAULT, label: "지정 안 함" },
  { value: "start", label: "시작" },
  { value: "center", label: "가운데" },
  { value: "end", label: "끝" },
  { value: "between", label: "양끝 배분" },
];
const DIRECTION_OPTIONS: Option[] = [
  { value: "row", label: "가로" },
  { value: "column", label: "세로" },
];
const RESPONSIVE_DIRECTION_OPTIONS: Option[] = [{ value: DEFAULT, label: "기본값 그대로" }, ...DIRECTION_OPTIONS];
const BREAKPOINTS = [
  { key: "tablet", label: "태블릿" },
  { key: "mobile", label: "모바일" },
] as const;

function impactText(impact: { placements: number; responsive: boolean }): string {
  const parts = [impact.placements > 0 ? `자식 ${impact.placements}개의 차지 칸` : null, impact.responsive ? "반응형 설정" : null].filter(Boolean);
  return `${parts.join("과 ")}이 초기화됩니다.`;
}

/** 배치: 이 노드가 자식을 놓는 방식(기본값은 데스크톱 기준)과, 부모가 grid일 때 이 노드의 차지 칸 */
export default function LayoutSection({ bp, node, parent }: { bp: Blueprint; node: ComponentNode; parent: ComponentNode | undefined }) {
  const { apply } = useEditApi();
  const [pending, setPending] = useState<Display | "none" | null>(null);
  const layout = node.layout;
  const hasLayoutChild = bp.nodes.some((n) => n.parentId === node.id && n.kind !== "hook");
  const setLayout = (next: Layout): EditResult => apply((b) => updateNode(b, node.id, { layout: next }));
  const withColumns = (text: string, then: (columns: number) => EditResult): EditResult => {
    const parsed = parseIntInRange(text, 1, 12);
    return parsed.ok ? then(parsed.value) : reject(parsed.reason);
  };

  const applyDisplay = (target: Display | null): EditResult => (target === null ? apply((b) => updateNode(b, node.id, { layout: null })) : apply((b) => changeDisplay(b, node.id, target)));
  const impactOf = (v: Display | "none") => displayChangeImpact(bp, node.id, v === "none" ? null : v);

  // 잃는 값이 있으면 바꾸기 전에 확인한다(확인 전에는 설계도를 바꾸지 않는다)
  function chooseDisplay(v: string): EditResult {
    const value = v as Display | "none";
    const impact = impactOf(value);
    if (impact && (impact.placements > 0 || impact.responsive)) {
      setPending(value);
      return { ok: true, blueprint: bp };
    }
    return applyDisplay(value === "none" ? null : value);
  }
  const pendingImpact = pending ? impactOf(pending) : null;

  const parentLayout = parent?.layout;
  const parentColumns = parentLayout?.display === "grid" ? (parentLayout.columns ?? 1) : null;
  const placementOptions: Option[] =
    parentColumns === null
      ? []
      : [{ value: "none", label: "지정 안 함" }, { value: "full", label: "한 줄 전체" }, ...Array.from({ length: parentColumns }, (_, i) => ({ value: String(i + 1), label: `${i + 1}칸` }))];

  return (
    <>
      <h4 className="text-xs font-semibold text-foreground">이 노드가 자식을 놓는 방식</h4>
      <SelectField
        fieldKey="layout.display"
        label="배치 방식"
        value={layout?.display ?? "none"}
        assumed={isAssumedField(node, "layout")}
        hint={hasLayoutChild ? "자식 노드가 있어 '지정 안 함'은 고를 수 없습니다." : "기본값은 데스크톱 기준입니다."}
        options={[
          { value: "none", label: "지정 안 함", disabled: hasLayoutChild },
          { value: "block", label: "block (위에서 아래로)" },
          { value: "flex", label: "flex" },
          { value: "grid", label: "grid" },
        ]}
        onChange={chooseDisplay}
      />

      {layout?.display === "flex" && (
        <SelectField fieldKey="layout.direction" label="방향" value={layout.direction ?? "row"} options={DIRECTION_OPTIONS} onChange={(direction) => setLayout({ ...layout, direction: direction as "row" | "column" })} />
      )}
      {layout?.display === "grid" && (
        <TextField fieldKey="layout.columns" label="열 수" value={String(layout.columns ?? "")} hint="1~12" onChange={(text) => withColumns(text, (columns) => setLayout({ ...layout, columns }))} />
      )}

      {layout && (
        <>
          <TextField fieldKey="layout.gap" label="간격 토큰" value={layout.gap ?? ""} mono placeholder="예: spacing.4" hint="비우면 간격 없음" onChange={(text) => setLayout({ ...layout, gap: text.trim() === "" ? null : text.trim() })} />

          {layout.display !== "block" && (
            <SelectField
              fieldKey="layout.align"
              label="교차축 정렬"
              value={layout.align ?? DEFAULT}
              options={ALIGN_OPTIONS}
              onChange={(v) => {
                const next: Layout = { ...layout };
                if (v === DEFAULT) delete next.align;
                else next.align = v as NonNullable<Layout["align"]>;
                return setLayout(next);
              }}
            />
          )}
          {layout.display === "flex" && (
            <SelectField
              fieldKey="layout.justify"
              label="주축 정렬"
              value={layout.justify ?? DEFAULT}
              options={JUSTIFY_OPTIONS}
              onChange={(v) => {
                const next: Layout = { ...layout };
                if (v === DEFAULT) delete next.justify;
                else next.justify = v as NonNullable<Layout["justify"]>;
                return setLayout(next);
              }}
            />
          )}

          {layout.display !== "block" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-xs font-medium text-foreground-secondary">반응형 (기본값과 달라질 때만)</legend>
              {BREAKPOINTS.map(({ key, label }) => {
                const line = layout.responsive?.find((r) => r.breakpoint === key);
                return layout.display === "flex" ? (
                  <SelectField
                    key={key}
                    fieldKey={`layout.responsive.${key}`}
                    label={`${label} 방향`}
                    value={line?.direction ?? DEFAULT}
                    options={RESPONSIVE_DIRECTION_OPTIONS}
                    onChange={(v) => setLayout(withResponsive(layout, key, v === DEFAULT ? null : { direction: v as "row" | "column" }))}
                  />
                ) : (
                  <TextField
                    key={key}
                    fieldKey={`layout.responsive.${key}`}
                    label={`${label} 열 수`}
                    value={line?.columns === undefined ? "" : String(line.columns)}
                    hint="비우면 기본값 그대로 (1~12)"
                    onChange={(text) => (text.trim() === "" ? setLayout(withResponsive(layout, key, null)) : withColumns(text, (columns) => setLayout(withResponsive(layout, key, { columns }))))}
                  />
                );
              })}
            </fieldset>
          )}
        </>
      )}

      {parentColumns !== null && (
        <>
          <h4 className="text-xs font-semibold text-foreground">부모 그리드 안의 자리</h4>
          <SelectField
            fieldKey="placement"
            label="차지 칸"
            value={node.placement === null ? "none" : String(node.placement.span)}
            options={placementOptions}
            assumed={isAssumedField(node, "placement")}
            hint={`부모는 ${parentColumns}열 그리드입니다.`}
            onChange={(v) => apply((b) => updateNode(b, node.id, { placement: v === "none" ? null : { span: v === "full" ? "full" : Number(v) } }))}
          />
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="배치 방식을 바꿀까요?"
        description={pendingImpact ? impactText(pendingImpact) : ""}
        confirmLabel="바꾸기"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) applyDisplay(pending === "none" ? null : pending);
          setPending(null);
        }}
      />
    </>
  );
}
