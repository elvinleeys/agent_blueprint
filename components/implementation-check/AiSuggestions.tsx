import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CheckResponse } from "@/lib/client/run-implementation-check";
import { aiCountSummary, aiDoneSummary, aiFailureText, aiOmittedText, PAIR_VERDICT, RESPONSIBILITY_VERDICT } from "./result-view";
import { aiIncludedCount, aiMissing, type Selection } from "./selection";

/**
 * AI 제안 구역(그리기만 한다). AI 의견은 설계 준수 집계·확실·확인 필요 카드와 따로 보이고 숫자에 들어가지 않는다.
 * - 짝 제안: 지금도 짝 확인이 필요한 노드만 보인다. "같음"이면 [받아들이기]로 그 짝을 source "ai"로 확정해 다시 검사한다.
 * - 책임 제안: 확인할 것(missing·unsure)만 카드로 보이고, "수행하지 않은 것 같음(missing)"에만 "수정 요청에 포함" 체크가 있다(기본 꺼짐, 수정 지시서에만 영향).
 *   수행함(done)은 "책임 N개 중 M개는 수행한 것으로 보임" 한 줄 아래 접어 둔다(기본 접힘).
 */
export default function AiSuggestions({
  ai,
  data,
  selection,
  running,
  onToggle,
  onAccept,
}: {
  ai: NonNullable<CheckResponse["ai"]>;
  data: CheckResponse;
  selection: Selection;
  running: boolean;
  onToggle: (id: string) => void;
  onAccept: (nodeId: string, path: string, name: string) => void;
}) {
  const omitted = aiOmittedText(ai.omitted);
  const reviewNodes = new Set(data.pairReviews.map((p) => p.nodeId));
  // 받아들였거나 다시 검사로 짝이 정해져 카드가 사라진 짝 제안 수(요약에는 세므로 따로 알린다)
  const hiddenPairs = ai.status === "ok" ? ai.suggestions.pairs.filter((p) => !reviewNodes.has(p.nodeId)).length : 0;

  return (
    <section className="flex flex-col gap-2" aria-labelledby="ic-ai-title">
      {/* 구역 이름은 "AI 제안"만(보조 글자는 보이되 이름에서 빠지게) */}
      <h3 className="text-base font-semibold text-foreground">
        <span id="ic-ai-title">AI 제안</span> <span className="font-normal text-foreground-secondary">(참고, 설계 준수 숫자에는 넣지 않음)</span>
      </h3>
      {/* 한눈에 보는 요약: AI 응답 그대로의 개수(받아들여 화면에서 사라진 짝 제안도 센다). 위쪽 설계 준수 집계 줄보다 낮은 무게로 */}
      {ai.status === "ok" && <p className="text-sm text-foreground-secondary">{aiCountSummary(ai.suggestions)}</p>}
      {ai.status === "ok" && hiddenPairs > 0 && <p className="text-xs text-foreground-tertiary">짝 제안 중 {hiddenPairs}건은 이미 짝이 정해져 아래에 보이지 않습니다.</p>}
      {ai.status === "failed" && (
        <Alert>
          <AlertDescription>{aiFailureText(ai.failure)} 위의 코드 판정 결과는 그대로이고, 잠시 뒤 &ldquo;다시 검사하기&rdquo;로 다시 시도할 수 있습니다.</AlertDescription>
        </Alert>
      )}
      {ai.status === "skipped" && <p className="text-sm text-foreground-secondary">이 검사에서는 AI에 보낼 대상(짝 확인이 필요한 노드나 책임이 적힌 노드)이 없어 AI를 부르지 않았습니다.</p>}
      {omitted && <p className="text-xs text-foreground-tertiary">{omitted}</p>}
      {ai.status === "ok" && <AiOk ai={ai} reviewNodes={reviewNodes} selection={selection} running={running} onToggle={onToggle} onAccept={onAccept} />}
    </section>
  );
}

function AiOk({
  ai,
  reviewNodes,
  selection,
  running,
  onToggle,
  onAccept,
}: {
  ai: Extract<NonNullable<CheckResponse["ai"]>, { status: "ok" }>;
  reviewNodes: Set<string>;
  selection: Selection;
  running: boolean;
  onToggle: (id: string) => void;
  onAccept: (nodeId: string, path: string, name: string) => void;
}) {
  // 받아들여 확정했거나 다시 검사로 짝이 정해진 노드의 짝 제안은 더 보이지 않는다
  const pairs = ai.suggestions.pairs.filter((p) => reviewNodes.has(p.nodeId));
  const resps = ai.suggestions.responsibilities;
  // 볼 것(missing·unsure)만 카드로, 수행함(done)은 한 줄 요약 아래 접어 둔다(문제가 많아 보이지 않게)
  const attention = resps.filter((r) => r.verdict !== "done");
  const done = resps.filter((r) => r.verdict === "done");
  const missing = aiMissing(ai);
  if (!pairs.length && !resps.length) return <p className="text-sm text-foreground-secondary">이 검사에서는 AI 제안이 없습니다.</p>;

  return (
    <>
      <div className="flex flex-col gap-1 text-sm text-foreground-secondary">
        <p>코드 검사 판정이 아니라, AI가 코드 조각을 보고 낸 의견입니다. 틀릴 수 있으니 직접 확인해 주세요.</p>
        {pairs.some((p) => p.verdict === "same") && <p>[받아들이기]를 누르면 그 짝을 직접 고른 것처럼 확정하고 코드로 다시 검사합니다(AI는 다시 부르지 않음). 그 결과는 위의 코드 판정·집계에 반영됩니다.</p>}
        {missing.length > 0 && (
          <p aria-live="polite">
            수행하지 않은 것 같은 책임 {missing.length}건 중 {aiIncludedCount(selection, ai)}건을 수정 요청에 포함했습니다. 체크한 것은 수정 지시서에만 들어가고 설계 준수 집계는 바뀌지 않습니다.
          </p>
        )}
      </div>
      {pairs.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="AI 짝 제안">
          {pairs.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 break-words">
                <span className="text-foreground">
                  {p.nodeName} ↔ {p.name}: {PAIR_VERDICT[p.verdict]}
                </span>
                <span className="break-all text-xs text-foreground-tertiary">{p.path}</span>
                <span className="text-xs text-foreground-secondary">AI 근거: {p.reason}</span>
              </span>
              {p.verdict === "same" && (
                <Button type="button" size="sm" variant="outline" disabled={running} onClick={() => onAccept(p.nodeId, p.path, p.name)} aria-label={`받아들이기: ${p.nodeName} ↔ ${p.name}`}>
                  받아들이기
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {attention.length > 0 && (
        <p className="text-sm font-medium text-foreground">
          확인할 책임 {attention.length}건 <span className="font-normal text-foreground-secondary">(안 된 것 같음 {missing.length} · 모르겠음 {attention.length - missing.length})</span>
        </p>
      )}
      {attention.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="AI 책임 제안(확인할 것)">
          {attention.map((r) => {
            const checkId = `ic-ai-include-${r.id}`;
            return (
              <li key={r.id} className="flex flex-col gap-1 rounded-lg border border-border p-2 text-sm">
                <span className="break-words text-foreground">
                  {r.nodeName} · {r.responsibility}: <span className={r.verdict === "missing" ? "font-medium text-foreground" : "text-foreground-secondary"}>{RESPONSIBILITY_VERDICT[r.verdict]}</span>
                </span>
                <span className="break-words text-xs text-foreground-secondary">AI 근거: {r.reason}</span>
                {r.verdict === "unsure" && <span className="text-xs text-foreground-tertiary">AI가 확신하지 못한 항목이라 직접 확인해 주세요(수정 요청 체크는 없습니다).</span>}
                {r.verdict === "missing" && (
                  <span className="flex items-center gap-2">
                    <input id={checkId} type="checkbox" checked={selection.has(r.id)} onChange={() => onToggle(r.id)} className="size-4" />
                    <label htmlFor={checkId} className="text-foreground">
                      수정 요청에 포함
                    </label>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && (
        <details className="min-w-0 text-sm text-foreground-secondary">
          <summary className="cursor-pointer">{aiDoneSummary(resps.length, done.length)}</summary>
          <ul className="mt-1 list-disc break-words pl-5" aria-label="AI 책임 제안(수행한 것으로 보임)">
            {done.map((r) => (
              <li key={r.id}>
                {r.nodeName} · {r.responsibility}
                {/* done은 판정만 받는다(근거 없음). 예전 응답처럼 근거가 있으면 보인다 */}
                {r.reason && <span className="text-xs text-foreground-tertiary"> — AI 근거: {r.reason}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
