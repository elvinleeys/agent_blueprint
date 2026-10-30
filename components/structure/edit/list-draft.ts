/** 칸이 모두 채워진 행만 골라 설계도에 반영할 값으로 만들고, 각 행이 화면 목록의 몇 번째였는지 함께 돌려준다 */
export function completeRows<R>(rows: readonly R[], isComplete: (row: R) => boolean): { rows: R[]; indexes: number[] } {
  const indexes = rows.flatMap((r, i) => (isComplete(r) ? [i] : []));
  return { rows: indexes.map((i) => rows[i]), indexes };
}

/**
 * 연산이 거부한 경로(path)가 목록의 어느 행·칸인지 찾는다. rowPath는 목록의 위치(["state"], ["style", "properties"]),
 * path는 연산의 거부 경로(["state", 2, "name"])다. 설계도에 반영한 행은 비어 있는 행을 뺀 것이라 indexes로 화면 행 번호를 되돌린다.
 */
export function locateRowError(path: readonly (string | number)[] | undefined, rowPath: readonly string[], indexes: readonly number[]): { row: number; cell: string | null } | null {
  if (!path || path.length <= rowPath.length) return null;
  if (!rowPath.every((p, i) => path[i] === p)) return null;
  const committed = path[rowPath.length];
  if (typeof committed !== "number" || committed >= indexes.length) return null;
  const cell = path[rowPath.length + 1];
  return { row: indexes[committed], cell: cell === undefined ? null : String(cell) };
}

/** 목록 행마다 붙이는 고유 id(React 키). 중간 행을 지워도 나머지 행의 id가 그대로라 입력 상태·포커스가 한 칸씩 당겨지지 않는다 */
export type RowIds = { ids: number[]; next: number };

export const rowIdsFor = (length: number): RowIds => ({ ids: Array.from({ length }, (_, i) => i), next: length });

/** 행 개수가 id 개수와 다르면(설계도 쪽 값이 밖에서 바뀐 경우) 새 id를 매긴다. 한 번 쓴 id는 다시 쓰지 않는다 */
export function alignRowIds(s: RowIds, length: number): RowIds {
  return s.ids.length === length ? s : { ids: Array.from({ length }, (_, i) => s.next + i), next: s.next + length };
}

export const appendRowId = (s: RowIds): RowIds => ({ ids: [...s.ids, s.next], next: s.next + 1 });

export const removeRowId = (s: RowIds, index: number): RowIds => ({ ids: s.ids.filter((_, i) => i !== index), next: s.next });

export type IntParse = { ok: true; value: number } | { ok: false; reason: string };

/** 입력 글자를 min~max의 정수로 읽는다 */
export function parseIntInRange(text: string, min: number, max: number): IntParse {
  const t = text.trim();
  const value = Number(t);
  if (!/^\d+$/.test(t) || !Number.isInteger(value) || value < min || value > max) return { ok: false, reason: `${min}~${max} 사이의 정수를 입력하세요.` };
  return { ok: true, value };
}
