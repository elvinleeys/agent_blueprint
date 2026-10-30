"use client";

import { canDraft, isImageOnly } from "@/lib/client/draft-request";
import { SPEC_TEXT_KEYS } from "@/lib/db/spec-inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ImagePicker from "./ImagePicker";
import { useStructureStore } from "./StructureStoreProvider";

const LABELS: Record<(typeof SPEC_TEXT_KEYS)[number], string> = {
  overview: "① 화면 개요",
  tokens: "② 디자인 토큰",
  layout: "③ 레이아웃·반응형",
  componentRules: "④ 컴포넌트 규칙",
  stateData: "⑤ 상태·데이터",
  accessibility: "⑥ 접근성",
  constraints: "⑦ 금지·제약 사항",
};

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
            {LABELS[key]}
          </label>
          <Textarea id={`spec-${key}`} rows={3} value={spec[key] ?? ""} disabled={busy} onChange={(e) => setSpecField(key, e.target.value)} />
        </div>
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="spec-route" className="text-sm font-medium text-foreground">
          화면 주소 (선택)
        </label>
        <Input id="spec-route" value={route} disabled={busy} onChange={(e) => setRoute(e.target.value)} aria-describedby="spec-route-help" />
        <p id="spec-route-help" className="text-xs text-foreground-tertiary">
          Next.js에서 페이지 파일 위치를 정하는 데 쓰입니다. 예: /products/[id]
        </p>
      </div>

      <ImagePicker disabled={busy} />

      {isImageOnly(spec, images.length) && (
        <p role="status" className="rounded-lg bg-warning-surface p-3 text-sm text-foreground-secondary">
          이미지만으로는 데이터 조회 위치·상태·토큰이 빠지기 쉽습니다. 최소한 <strong>① 화면 개요</strong>와 <strong>⑤ 상태·데이터</strong>를 채워 주세요.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={!ready || busy}>
          {busy ? "초안 생성 중…" : hasBlueprint ? "초안 다시 생성" : "초안 생성"}
        </Button>
        {!ready && <p className="text-xs text-foreground-tertiary">스펙 항목을 하나 이상 입력하거나 이미지를 첨부하면 만들 수 있습니다.</p>}
        {hasBlueprint && <p className="text-xs text-foreground-tertiary">새 판으로 추가되며 기존 초안은 보존됩니다.</p>}
      </div>
    </form>
  );
}
