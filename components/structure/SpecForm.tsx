"use client";

import { useState } from "react";
import { canDraft, isImageOnly } from "@/lib/client/draft-request";
import { SPEC_TEXT_KEYS } from "@/lib/db/spec-inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ImagePicker from "./ImagePicker";
import { generateButtonLabel, IMAGE_ONLY_NOTE, MIN_CONDITION, REGENERATE_NOTE, ROUTE_LABEL, SPEC_LABELS } from "./spec-form-text";
import { useStructureStore } from "./StructureStoreProvider";

export default function SpecForm({ onGenerate }: { onGenerate: () => void }) {
  const spec = useStructureStore((s) => s.spec);
  const route = useStructureStore((s) => s.route);
  const images = useStructureStore((s) => s.images);
  const status = useStructureStore((s) => s.status);
  const hasBlueprint = useStructureStore((s) => s.blueprint !== null);
  const setSpecField = useStructureStore((s) => s.setSpecField);
  const setRoute = useStructureStore((s) => s.setRoute);

  const [compact] = useState(hasBlueprint); // 처음 열 때만 정한다(이후 사용자가 접고 펼친 상태를 덮지 않는다)

  const busy = status === "resizing" || status === "running";
  const ready = canDraft(spec, images.length);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onGenerate();
      }}
    >
      {SPEC_TEXT_KEYS.map((key) => (
        // 설계도가 있으면 화면 개요만 펼치고 나머지는 접는다(내용은 접어도 그대로 남는다)
        <details key={key} open={!compact || key === "overview"} className="group flex flex-col gap-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            {SPEC_LABELS[key]}
            <span className="text-xs font-normal text-foreground-tertiary">{spec[key]?.trim() ? "입력됨" : ""}</span>
          </summary>
          <Textarea id={`spec-${key}`} aria-label={SPEC_LABELS[key]} className="mt-1" rows={3} value={spec[key] ?? ""} disabled={busy} onChange={(e) => setSpecField(key, e.target.value)} />
        </details>
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="spec-route" className="text-sm font-medium text-foreground">
          {ROUTE_LABEL}
        </label>
        <Input id="spec-route" value={route} disabled={busy} onChange={(e) => setRoute(e.target.value)} aria-describedby="spec-route-help" />
        <p id="spec-route-help" className="text-xs text-foreground-tertiary">
          Next.js에서 페이지 파일 위치를 정하는 데 쓰입니다. 예: /products/[id]
        </p>
      </div>

      <ImagePicker disabled={busy} />

      {isImageOnly(spec, images.length) && (
        <p role="status" className="rounded-lg bg-section p-3 text-sm text-foreground-secondary">
          {IMAGE_ONLY_NOTE}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={!ready || busy}>
          {generateButtonLabel(busy, hasBlueprint)}
        </Button>
        <p className="text-xs text-foreground-tertiary">{MIN_CONDITION}</p>
        {hasBlueprint && <p className="text-xs text-foreground-tertiary">{REGENERATE_NOTE}</p>}
      </div>
    </form>
  );
}
