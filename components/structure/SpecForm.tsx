"use client";

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
        <div key={key} className="flex flex-col gap-1">
          <label htmlFor={`spec-${key}`} className="text-sm font-medium text-foreground">
            {SPEC_LABELS[key]}
          </label>
          <Textarea id={`spec-${key}`} rows={3} value={spec[key] ?? ""} disabled={busy} onChange={(e) => setSpecField(key, e.target.value)} />
        </div>
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
