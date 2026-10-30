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

export type IntParse = { ok: true; value: number } | { ok: false; reason: string };

/** 입력 글자를 min~max의 정수로 읽는다 */
export function parseIntInRange(text: string, min: number, max: number): IntParse {
  const t = text.trim();
  const value = Number(t);
  if (!/^\d+$/.test(t) || !Number.isInteger(value) || value < min || value > max) return { ok: false, reason: `${min}~${max} 사이의 정수를 입력하세요.` };
  return { ok: true, value };
}
