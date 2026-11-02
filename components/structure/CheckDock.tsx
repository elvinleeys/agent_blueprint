"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import CheckResults from "./CheckResults";
import { useStructureStore } from "./StructureStoreProvider";
import { useViolations } from "./ViolationsProvider";

/** 접혀 있어도 보이는 개수 문구. 오류·경고는 0건이어도 보이고, 정보는 있을 때만 붙인다 */
export function dockSummary(violations: { severity: string }[]): string {
  const n = (s: string) => violations.filter((v) => v.severity === s).length;
  const info = n("info");
  return `오류 ${n("error")} · 경고 ${n("warning")}${info > 0 ? ` · 정보 ${info}` : ""}`;
}

/** 화면 아래에 붙은 접이식 검사 결과. 접힌 상태에서도 개수 줄은 항상 보인다 */
export default function CheckDock() {
  const [open, setOpen] = useState(false);
  const hasBlueprint = useStructureStore((s) => s.blueprint !== null);
  const { violations } = useViolations();
  const Icon = open ? ChevronDownIcon : ChevronUpIcon;

  return (
    <section aria-label="검사 결과" className="shrink-0 overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
      <button
        type="button"
        id="check-dock-toggle"
        aria-expanded={open}
        aria-controls="check-dock-body"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm outline-none hover:bg-section focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-medium text-foreground">검사 결과</span>
          <span className="text-foreground-secondary">{hasBlueprint ? dockSummary(violations) : "설계도 없음"}</span>
        </span>
        <Icon aria-hidden className="size-4 text-foreground-tertiary" />
      </button>
      {open && (
        <div id="check-dock-body" role="region" aria-labelledby="check-dock-toggle" className="max-h-72 overflow-y-auto border-t border-border p-4">
          <CheckResults />
        </div>
      )}
    </section>
  );
}
