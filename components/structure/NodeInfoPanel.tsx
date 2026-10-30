"use client";

import type { ReactNode } from "react";
import { gapStep } from "@/core/preview/preview";
import type { ComponentNode } from "@/core/schema/blueprint";
import { Badge } from "@/components/ui/badge";
import { KIND_LABEL } from "./labels";
import { useStructureStore } from "./StructureStoreProvider";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-foreground-tertiary">{title}</h4>
      <div className="text-sm text-foreground">{children}</div>
    </section>
  );
}

const List = ({ items }: { items: ReactNode[] }) =>
  items.length === 0 ? <span className="text-foreground-tertiary">없음</span> : (
    <ul className="list-disc pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );

function layoutSummary(node: ComponentNode): string {
  const l = node.layout;
  if (!l) return "없음";
  const parts: string[] = [l.display];
  if (l.direction) parts.push(l.direction === "row" ? "가로" : "세로");
  if (l.columns) parts.push(`${l.columns}열`);
  if (l.align) parts.push(`정렬 ${l.align}`);
  if (l.justify) parts.push(`배분 ${l.justify}`);
  if (l.gap) parts.push(`간격 ${l.gap}${gapStep(l.gap).estimated ? "(추정)" : ""}`);
  return parts.join(" · ");
}

// 보기 전용: 편집은 다음 단계에서 추가한다
export default function NodeInfoPanel() {
  const blueprint = useStructureStore((s) => s.blueprint);
  const selectedId = useStructureStore((s) => s.selectedNodeId);
  const normalized = useStructureStore((s) => s.normalized);

  const node = blueprint?.nodes.find((n) => n.id === selectedId);
  if (!blueprint || !node) {
    return <p className="text-sm text-foreground-tertiary">미리보기의 상자나 트리의 노드를 선택하면 정보가 여기에 보입니다.</p>;
  }
  const parent = blueprint.nodes.find((n) => n.id === node.parentId);
  const fixes = normalized.filter((c) => c.nodeId === node.id);
  const responsive = node.layout?.responsive ?? [];

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div className="flex flex-col gap-1">
        <h3 className="break-all text-base font-semibold text-foreground">{node.name}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL[node.kind]}</Badge>
          {node.assumed && <Badge variant="outline" className="border-dashed border-warning text-warning">AI 가정</Badge>}
        </div>
        <p className="text-xs text-foreground-tertiary">부모: {parent ? parent.name : "없음(루트)"}</p>
      </div>

      {node.assumed && (
        <Section title="가정한 필드">
          {node.assumedFields && node.assumedFields.length > 0 ? (
            <List items={node.assumedFields.map((f) => <code key={f}>{f}</code>)} />
          ) : (
            <span className="text-foreground-secondary">AI가 입력 없이 채운 값이 있습니다(필드 목록 없음).</span>
          )}
        </Section>
      )}

      <Section title="책임"><List items={node.responsibilities} /></Section>
      <Section title="상태"><List items={node.state.map((s) => (s.description ? `${s.name} — ${s.description}` : s.name))} /></Section>
      <Section title="props"><List items={node.props.map((p) => `${p.name}: ${p.type}`)} /></Section>
      <Section title="이벤트"><List items={node.events} /></Section>
      <Section title="데이터 요청">{node.dataFetch ? "API 호출 책임이 있음" : "없음"}</Section>
      <Section title="렌더링 방식">{node.renderMode ?? "해당 없음(Next.js가 아니거나 훅)"}</Section>
      <Section title="파일 위치"><code className="break-all">{node.location.dir}</code></Section>

      <Section title="배치(자식을 놓는 방식)">
        {layoutSummary(node)}
        {responsive.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-foreground-secondary">
            {responsive.map((r) => (
              <li key={r.breakpoint}>
                {r.breakpoint}: {r.direction ? (r.direction === "row" ? "가로" : "세로") : ""}
                {r.columns ? `${r.columns}열` : ""}
              </li>
            ))}
          </ul>
        )}
        {node.placement && <p className="mt-1 text-foreground-secondary">부모 그리드 안: {node.placement.span === "full" ? "전체 줄" : `${node.placement.span}칸`}</p>}
      </Section>

      <Section title="스타일 속성">
        {node.style ? (
          <>
            <p className="text-foreground-secondary">범위 {node.style.scope} · 바깥 여백 {node.style.ownsOuterSpacing ? "직접 가짐" : "없음"}</p>
            <List items={node.style.properties.map((p) => `${p.property}: ${p.value}${p.isToken ? " (토큰)" : ""}`)} />
          </>
        ) : (
          "없음"
        )}
      </Section>

      {normalized.length > 0 && (
        <Section title="자동 보정 내역">
          <List items={fixes.map((c) => `${c.path}: ${c.detail}`)} />
        </Section>
      )}
    </div>
  );
}
