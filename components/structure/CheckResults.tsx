"use client";

import { Badge } from "@/components/ui/badge";
import type { Severity, Violation } from "@/core/rules/types";
import { cn } from "@/lib/utils";
import { useStructureStore } from "./StructureStoreProvider";
import { useViolations } from "./ViolationsProvider";

const GROUPS: { severity: Severity; label: string; text: string }[] = [
  { severity: "error", label: "오류", text: "text-destructive" },
  { severity: "warning", label: "경고", text: "text-warning" },
  { severity: "info", label: "정보", text: "text-foreground-tertiary" },
];

export const CHECK_EMPTY_NO_BLUEPRINT = "설계도가 있으면 검사 결과가 여기에 표시됩니다.";
export const CHECK_EMPTY_CLEAN = "발견된 문제가 없습니다.";

/** 결과 제목에 붙는 개수 문구. 0건인 묶음은 생략한다 */
export function countSummary(violations: Violation[]): string {
  return GROUPS.map((g) => ({ g, n: violations.filter((v) => v.severity === g.severity).length }))
    .filter(({ n }) => n > 0)
    .map(({ g, n }) => `${g.label} ${n}`)
    .join(" · ");
}

export default function CheckResults() {
  const blueprint = useStructureStore((s) => s.blueprint);
  const select = useStructureStore((s) => s.requestSelect); // 화면에만 있는 틀린 입력이 있으면 확인을 거친다
  const { violations } = useViolations();

  if (!blueprint) return <p className="text-sm text-foreground-tertiary">{CHECK_EMPTY_NO_BLUEPRINT}</p>;
  if (violations.length === 0) return <p className="text-sm text-foreground-tertiary">{CHECK_EMPTY_CLEAN}</p>;

  const names = new Map(blueprint.nodes.map((n) => [n.id, n.name]));
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map(({ severity, label, text }) => {
        const items = violations.filter((v) => v.severity === severity);
        if (items.length === 0) return null;
        return (
          <section key={severity} aria-label={`${label} ${items.length}건`}>
            <h3 className={cn("mb-2 text-sm font-medium", text)}>
              {label} {items.length}
            </h3>
            <ul className="flex flex-col gap-2">
              {items.map((v, i) => (
                <li key={`${v.ruleId}-${v.nodeIds.join("+")}-${i}`} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{v.ruleId}</Badge>
                    <span className="text-foreground">{v.message}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {v.nodeIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => select(id)}
                        className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground outline-none hover:bg-section focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {names.get(id) ?? id}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
