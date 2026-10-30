"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/** 접고 펼 수 있는 구역. 네이티브 details·summary라 Tab으로 이동하고 Enter·Space로 접고 펼 수 있다 */
export function Section({ title, open, onOpenChange, errorCount = 0, children }: { title: string; open: boolean; onOpenChange: (open: boolean) => void; errorCount?: number; children: ReactNode }) {
  return (
    <details open={open} onToggle={(e) => onOpenChange(e.currentTarget.open)} className="rounded-lg border border-border">
      <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {title}
        {errorCount > 0 && <Badge variant="destructive">오류 {errorCount}</Badge>}
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">{children}</div>
    </details>
  );
}
