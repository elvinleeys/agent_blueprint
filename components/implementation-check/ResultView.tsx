import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ConfirmedPair } from "@/core/impl-check/types";
import { buildFixPrompt } from "@/core/prompt/fix-prompt";
import type { CheckResponse } from "@/lib/client/run-implementation-check";
import { CertainCard, ReviewCard } from "./FindingCard";
import FixPromptCard from "./FixPromptCard";
import { baselineText, banSummaryText, configText, designSummaryText, groupFindings, repoText } from "./result-view";
import { fixPromptInput, includedCount, type Selection } from "./selection";

/**
 * 검사 결과 화면(그리기만 한다): 기준 판·집계·설정 → 확정한 짝 → 확실 → 확인 필요 → 설계 밖·범위 밖 → 수정 지시서.
 * 집계(일치 M/N·확인 필요 수)는 검사 결과의 summary 그대로이고, "수정 요청에 포함" 체크(selection)는 수정 지시서에만 영향을 준다.
 */
export default function ResultView({
  data,
  confirmed,
  selection,
  running,
  stale,
  nameOf,
  onToggle,
  onConfirm,
  onCancelConfirm,
}: {
  data: CheckResponse;
  confirmed: ConfirmedPair[];
  selection: Selection;
  running: boolean;
  stale: boolean;
  nameOf: (nodeId: string) => string;
  onToggle: (cardId: string) => void;
  onConfirm: (nodeId: string, path: string, name: string) => void;
  onCancelConfirm: (nodeId: string) => void;
}) {
  const groups = groupFindings(data.result.findings);
  const prompt = buildFixPrompt(fixPromptInput(data, selection));

  return (
    <>
    <section aria-labelledby="ic-result-title" className="flex flex-col gap-4">
      <h2 id="ic-result-title" className="text-lg font-semibold text-foreground">
        2. 검사 결과
      </h2>
      {stale && (
        <Alert>
          <AlertDescription>올린 파일이 바뀌었습니다. 아래 결과는 이전 파일 기준이니 &ldquo;다시 검사하기&rdquo;를 눌러 주세요.</AlertDescription>
        </Alert>
      )}
      {/* 결과가 길어도 집계는 스크롤 위쪽에 고정해 항상 보이게 한다 */}
      <p className="sticky top-0 z-10 border-b border-border bg-background py-2 text-sm font-medium text-foreground">
        {designSummaryText(data.result.summary)}
      </p>
      <div className="flex flex-col gap-1 text-sm text-foreground-secondary">
        <p className="break-words">{baselineText(data.baseline)}</p>
        {data.repo && <p className="break-words">{repoText(data.repo)}</p>}
        <p>{banSummaryText(data.result.summary)}</p>
        <p className="break-words">{configText(data.meta.configs)}</p>
        <p className="text-xs text-foreground-tertiary">
          파일 {data.meta.files}개 · 서버 처리 {Math.round(data.meta.timing.totalMs)}ms{data.meta.timing.first ? " (이 서버의 첫 요청)" : ""}
        </p>
      </div>

      {confirmed.length > 0 && (
        <div className="flex flex-col gap-1 text-sm text-foreground-secondary">
          <h3 className="text-base font-semibold text-foreground">확정한 짝 {confirmed.length}개</h3>
          <ul className="flex flex-col gap-1" aria-label="확정한 짝 목록">
            {confirmed.map((c) => (
              <li key={c.nodeId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-all">
                  {nameOf(c.nodeId)} ↔ {c.name} <span className="text-xs text-foreground-tertiary">({c.path})</span>
                </span>
                <Button type="button" variant="ghost" size="xs" disabled={running} onClick={() => onCancelConfirm(c.nodeId)} aria-label={`${nameOf(c.nodeId)}의 확정 취소`}>
                  확정 취소
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-foreground">확실한 카드 {groups.certain.length}장</h3>
        {groups.certain.length === 0 ? (
          <p className="text-sm text-foreground-secondary">설계와 다르다고 확인된 항목이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="확실한 카드 목록">
            {groups.certain.map((f) => (
              <CertainCard key={f.id} finding={f} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-foreground">확인 필요 카드 {groups.review.length}장</h3>
        {groups.review.length === 0 ? (
          <p className="text-sm text-foreground-secondary">확인이 필요한 항목이 없습니다.</p>
        ) : (
          <>
            <p className="text-sm text-foreground-secondary" aria-live="polite">
              확인 필요 카드 {groups.review.length}장 중 {includedCount(selection, data)}장 포함. &ldquo;수정 요청에 포함&rdquo;을 체크한 카드만 아래 수정 지시서에 들어갑니다. 설계 준수 집계(일치·확인 필요 수)는 바뀌지 않습니다.
            </p>
            <ul className="flex flex-col gap-2" aria-label="확인 필요 카드 목록">
              {groups.review.map((f) => (
                <ReviewCard
                  key={f.id}
                  finding={f}
                  included={selection.has(f.id)}
                  onToggle={() => onToggle(f.id)}
                  pairReview={data.pairReviews.find((p) => p.nodeId === f.nodeIds[0])}
                  onConfirm={onConfirm}
                  busy={running}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {groups.outside.length > 0 && (
        <details className="text-sm text-foreground-secondary">
          <summary className="cursor-pointer">설계에 없는 발견 {groups.outside.length}건 (설계 준수 집계에 넣지 않음)</summary>
          <ul className="mt-1 list-disc break-words pl-5">
            {groups.outside.map((f) => (
              <li key={f.id}>{f.message}</li>
            ))}
          </ul>
        </details>
      )}

      <details className="text-sm text-foreground-secondary">
        <summary className="cursor-pointer">검사 범위 밖 {data.result.summary.outOfScope.length}가지</summary>
        <ul className="mt-1 list-disc pl-5">
          {data.result.summary.outOfScope.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>

    </section>

    <section aria-labelledby="ic-fix-title" className="flex flex-col gap-3">
      <h2 id="ic-fix-title" className="text-lg font-semibold text-foreground">
        3. 수정 지시서
      </h2>
      <FixPromptCard content={prompt} />
    </section>
    </>
  );
}
