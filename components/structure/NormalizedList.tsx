"use client";

import { useStructureStore } from "./StructureStoreProvider";

// 새 초안을 만들 때만 보인다(저장된 판을 다시 불러오면 보정 내역이 DB에 없다)
export default function NormalizedList() {
  const normalized = useStructureStore((s) => s.normalized);
  const blueprint = useStructureStore((s) => s.blueprint);
  if (normalized.length === 0) return null;

  const nameOf = (id: string) => blueprint?.nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <details className="rounded-lg border border-border p-3 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">자동으로 고친 항목 {normalized.length}건</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {normalized.map((c, i) => (
          <li key={i} className="text-foreground-secondary">
            <span className="font-medium text-foreground">{nameOf(c.nodeId)}</span> · <code>{c.path}</code>: {c.detail}
          </li>
        ))}
      </ul>
    </details>
  );
}
