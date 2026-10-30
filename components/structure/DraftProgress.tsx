"use client";

import { useEffect, useState } from "react";
import type { DraftStage } from "@/lib/client/draft-stream";
import { useStructureStore } from "./StructureStoreProvider";

function label(s: DraftStage): string {
  switch (s.stage) {
    case "accepted": return "요청 확인";
    case "generating": return "AI가 설계도를 만드는 중";
    case "validating": return "설계도 검증 중";
    case "normalizing": return `자동 보정 ${s.changes}건`;
    case "regenerating": return `다시 생성 중(${s.attempt}번째 시도)`;
    case "saving": return "새 판으로 저장 중";
  }
}

// 가짜 시간 전환 없이 서버가 보낸 단계만 보여 준다. 경과 시간만 1초마다 갱신한다
export default function DraftProgress() {
  const status = useStructureStore((s) => s.status);
  const stages = useStructureStore((s) => s.stages);
  const startedAt = useStructureStore((s) => s.startedAt);
  const [now, setNow] = useState<number | null>(null);

  const busy = status === "resizing" || status === "running";
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  if (!busy) return null;
  const elapsed = now !== null && startedAt !== null ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const steps = [...(status === "resizing" ? ["이미지를 줄이는 중"] : []), ...stages.map(label)];
  const last = steps.length - 1;

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-lg bg-section p-4 text-sm">
      <p className="font-medium text-foreground">초안을 만들고 있습니다 · {elapsed}초</p>
      <ol className="flex flex-col gap-1">
        {steps.length === 0 && <li className="text-foreground-tertiary">요청을 보내는 중…</li>}
        {steps.map((text, i) => (
          <li key={i} className={i === last ? "text-foreground" : "text-foreground-tertiary"}>
            {i === last ? "▸ " : "✓ "}
            {text}
            {i === last ? "…" : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}
