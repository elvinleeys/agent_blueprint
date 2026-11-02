"use client";

import { useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { buildPreview, type PreviewBox } from "@/core/preview/preview";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ALIGN_ITEMS, COL_SPAN, COL_SPAN_FULL, GAP, GRID_COLS, JUSTIFY } from "./preview-classes";
import { useStructureStore } from "./StructureStoreProvider";
import { useViolations } from "./ViolationsProvider";
import { ASSUMED_BORDER, ASSUMED_TEXT, violationMark } from "./violation-mark";

function childrenLayout(box: PreviewBox): string {
  const gap = GAP[box.gap];
  const align = box.align ? ALIGN_ITEMS[box.align] : "";
  if (box.display === "grid") return cn("grid", GRID_COLS[box.columns ?? 1], gap, align);
  const justify = box.justify ? JUSTIFY[box.justify] : "";
  if (box.display === "flex") return cn("flex", box.direction === "column" ? "flex-col" : "flex-row", gap, align, justify);
  return cn("flex flex-col", gap); // block은 위에서 아래로 쌓는다
}

const spanClass = (span: PreviewBox["span"]) => (span === null ? "" : span === "full" ? COL_SPAN_FULL : COL_SPAN[span]);

type BoxProps = { box: PreviewBox; selectedId: string | null; onSelect: (id: string) => void; readOnly?: boolean; depth?: number };

function BoxView({ box, selectedId, onSelect, readOnly = false, depth = 0 }: BoxProps) {
  const selected = box.id === selectedId;
  const choose = () => onSelect(box.id);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation(); // 안쪽 상자의 키 입력이 바깥 상자까지 선택하지 않게 한다
    choose();
  };
  const caption = [box.layoutLabel, box.placementLabel].filter(Boolean).join(" · ");
  const mark = violationMark(useViolations().counts.get(box.id));

  return (
    <div
      // 읽기 전용(홈 랜딩 예시): 선택·키 조작 없이 그리기만 하고, 차례로 나타나는 CSS 애니메이션(globals.css의 data-reveal)만 붙인다
      {...(readOnly
        ? { "data-reveal": "", "data-depth": depth }
        : {
            role: "button",
            tabIndex: 0,
            "aria-pressed": selected,
            "aria-label": `${box.name}${caption ? `, ${caption}` : ""}${box.assumed ? ", AI 가정" : ""}${mark ? `, ${mark.label}` : ""}`,
            onClick: (e: MouseEvent) => {
              e.stopPropagation(); // 가장 안쪽 상자만 선택된다
              choose();
            },
            onKeyDown,
          })}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-2 outline-none",
        !readOnly && "cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/50",
        mark ? mark.border : box.assumed ? ASSUMED_BORDER : "border-border", // 위반 색 실선이 AI 가정 점선보다 우선한다
        selected && "ring-2 ring-primary",
        spanClass(box.span),
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm wrap-anywhere">
        <span className="font-medium text-foreground">{box.name}</span>
        {caption && <span className="text-xs text-foreground-tertiary">{caption}</span>}
        {mark && <span className={cn("text-xs font-medium", mark.text)}>{mark.label}</span>}
        {box.assumed && <span className={cn("text-xs", ASSUMED_TEXT)}>AI 가정</span>}
        {box.layoutMissing && <span className="text-xs text-warning">배치 정보 없음</span>}
      </div>
      {box.children.length > 0 && (
        <div className={childrenLayout(box)}>
          {box.children.map((c) => (
            <BoxView key={c.id} box={c} selectedId={selectedId} onSelect={onSelect} readOnly={readOnly} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/** readOnly: 선택·미리보기 크기 전환·훅 목록 없이 상자만 그린다(홈 랜딩의 예시용) */
export default function PreviewCanvas({ readOnly = false }: { readOnly?: boolean }) {
  const blueprint = useStructureStore((s) => s.blueprint);
  const viewport = useStructureStore((s) => s.viewport);
  const selectedId = useStructureStore((s) => s.selectedNodeId);
  const select = useStructureStore((s) => s.requestSelect); // 화면에만 있는 틀린 입력이 있으면 확인을 거친다
  const setViewport = useStructureStore((s) => s.setViewport);

  const preview = useMemo(() => (blueprint ? buildPreview(blueprint.nodes, viewport) : null), [blueprint, viewport]); // 선택만 바뀔 때는 다시 계산하지 않는다
  if (!preview) return <p className="text-sm text-foreground-tertiary">화면 구조를 그릴 수 없는 설계도입니다.</p>;

  if (readOnly) {
    return (
      <div className="rounded-lg bg-section p-3">
        <BoxView box={preview.root} selectedId={null} onSelect={() => {}} readOnly />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="미리보기 크기" className="flex items-center gap-2">
        <Button size="sm" variant={viewport === "desktop" ? "default" : "outline"} aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")}>
          데스크톱
        </Button>
        <Button size="sm" variant={viewport === "mobile" ? "default" : "outline"} aria-pressed={viewport === "mobile"} onClick={() => setViewport("mobile")}>
          모바일
        </Button>
        <span className="text-xs text-foreground-tertiary">설계도의 배치 정보를 그대로 그린 구조 미리보기입니다(실제 색·크기가 아닙니다).</span>
      </div>

      <div className="overflow-x-auto rounded-lg bg-section p-3">
        <div className={cn("mx-auto", viewport === "mobile" ? "w-96 max-w-full" : "w-full")}>
          <BoxView box={preview.root} selectedId={selectedId} onSelect={select} />
        </div>
      </div>

      <section aria-labelledby="hooks-title">
        <h3 id="hooks-title" className="mb-2 text-sm font-medium text-foreground">
          화면에 그려지지 않는 노드
        </h3>
        {preview.hooks.length === 0 ? (
          <p className="text-sm text-foreground-tertiary">없습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {preview.hooks.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  aria-pressed={h.id === selectedId}
                  onClick={() => select(h.id)}
                  className={cn(
                    "flex items-baseline gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    h.id === selectedId && "ring-2 ring-primary",
                  )}
                >
                  <span className="font-medium text-foreground">{h.name}</span>
                  <span className="text-xs text-foreground-tertiary">{h.parentName}의 훅{h.dataFetch ? " · 데이터 요청" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
