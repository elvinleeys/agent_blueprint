import type { FixPromptInput } from "@/core/prompt/fix-prompt";
import type { CheckResponse } from "@/lib/client/run-implementation-check";

// "수정 요청에 포함" 체크(화면 안에서만 가지고 저장하지 않는다). 확인 필요 카드 id와 AI 책임 제안(missing) id를 한 집합에 담는다(id 앞부분이 달라 겹치지 않음).
// 체크한 확인 필요 카드는 수정 지시서의 "확인 뒤 수정", 체크한 AI 책임 제안은 "AI 제안(사용자 확인)"에 들어가고, 설계 준수 집계(일치 M/N·확인 필요 수)에는 영향이 없다.

/** 체크한 확인 필요 카드·AI 책임 제안 id */
export type Selection = ReadonlySet<string>;

const reviewIds = (data: Pick<CheckResponse, "result">): string[] => data.result.findings.filter((f) => f.certainty === "review").map((f) => f.id);

/** 체크할 수 있는 AI 책임 제안: 책임을 수행하지 않은 것 같다(missing)고 본 것만 */
export const aiMissing = (ai: CheckResponse["ai"] | null | undefined) => (ai?.status === "ok" ? ai.suggestions.responsibilities.filter((r) => r.verdict === "missing") : []);

/** 다시 검사한 뒤 체크를 이어 갈 id: 확인 필요 카드 + 화면에 남아 있는 AI 책임 제안 */
export const selectableIds = (data: Pick<CheckResponse, "result">, ai: CheckResponse["ai"] | null | undefined): string[] => [...reviewIds(data), ...aiMissing(ai).map((r) => r.id)];

/**
 * 재검사 결과의 확인 필요 카드 id에 맞춰 이전 체크를 복원한다.
 * 같은 카드 id가 다시 나오면 체크를 유지하고, 새 카드는 체크하지 않으며, 사라진 카드의 체크는 지운다.
 */
export function restoreSelection(prev: Selection, cardIds: Iterable<string>): Selection {
  return new Set([...cardIds].filter((id) => prev.has(id)));
}

/** 한 카드의 체크를 켜고 끈다 */
export function toggleIncluded(prev: Selection, id: string): Selection {
  const next = new Set(prev);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** 확인 필요 카드 중 체크한 수(화면의 "N장 중 M장 포함") */
export const includedCount = (sel: Selection, data: Pick<CheckResponse, "result">): number => reviewIds(data).filter((id) => sel.has(id)).length;

/** AI 책임 제안(missing) 중 체크한 수 */
export const aiIncludedCount = (sel: Selection, ai: CheckResponse["ai"] | null | undefined): number => aiMissing(ai).filter((r) => sel.has(r.id)).length;

/** 수정 지시서 입력: 확인 필요 카드 중 체크한 id + 체크한 AI 책임 제안(missing). ai는 화면이 들고 있는 마지막 AI 제안 */
export const fixPromptInput = (data: Pick<CheckResponse, "baseline" | "result">, sel: Selection, ai?: CheckResponse["ai"] | null): FixPromptInput => ({
  baseline: data.baseline,
  result: data.result,
  include: reviewIds(data).filter((id) => sel.has(id)).sort(),
  aiResponsibilities: aiMissing(ai)
    .filter((r) => sel.has(r.id))
    .map(({ id, nodeName, responsibility, reason }) => ({ id, nodeName, responsibility, reason })),
});
