// 확인 필요 카드의 포함·무시 선택(화면 안에서만 가지고 저장하지 않는다). 카드 id가 기준이다.
// 포함 = 수정 지시서에 넣음, 무시 = 지시서에서 뺌. 둘 다 설계 준수 집계(일치 M/N·확인 필요 수)에는 영향이 없다.

export type Choice = "include" | "ignore";
export type Selection = Readonly<Record<string, Choice>>;

/**
 * 재검사 결과의 확인 필요 카드 id에 맞춰 이전 선택을 복원한다.
 * - 같은 카드 id가 다시 나오면 이전 선택을 유지한다.
 * - 새로 나온 카드는 선택하지 않은 상태로 둔다(자동으로 포함하거나 무시하지 않는다).
 * - 사라진 카드의 선택은 지운다.
 */
export function restoreSelection(prev: Selection, cardIds: Iterable<string>): Selection {
  const next: Record<string, Choice> = {};
  for (const id of cardIds) if (prev[id]) next[id] = prev[id];
  return next;
}

/** 한 카드의 선택을 바꾼다. 같은 선택을 다시 누르면 해제한다 */
export function toggleChoice(prev: Selection, id: string, choice: Choice): Selection {
  const next = { ...prev };
  if (next[id] === choice) delete next[id];
  else next[id] = choice;
  return next;
}

export const includedIds = (sel: Selection): string[] => Object.keys(sel).filter((id) => sel[id] === "include").sort();
