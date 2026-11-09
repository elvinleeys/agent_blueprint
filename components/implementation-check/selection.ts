import type { FixPromptInput } from "@/core/prompt/fix-prompt";
import type { CheckResponse } from "@/lib/client/run-implementation-check";

// 확인 필요 카드의 "수정 요청에 포함" 체크(화면 안에서만 가지고 저장하지 않는다). 카드 id가 기준이다.
// 체크한 카드만 수정 지시서의 "확인 뒤 수정"에 들어가고, 설계 준수 집계(일치 M/N·확인 필요 수)에는 영향이 없다.

/** 체크한 확인 필요 카드 id */
export type Selection = ReadonlySet<string>;

const reviewIds = (data: Pick<CheckResponse, "result">): string[] => data.result.findings.filter((f) => f.certainty === "review").map((f) => f.id);

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

/** 수정 지시서 입력: 확인 필요 카드 중 체크한 id만 정렬해 넘긴다 */
export const fixPromptInput = (data: Pick<CheckResponse, "baseline" | "result">, sel: Selection): FixPromptInput => ({
  baseline: data.baseline,
  result: data.result,
  include: reviewIds(data).filter((id) => sel.has(id)).sort(),
});
