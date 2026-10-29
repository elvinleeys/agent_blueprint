import type { ZodError } from "zod";

export type DbFailure = {
  ok: false;
  kind: "not_found" | "invalid_data" | "unavailable";
  message: string;
  fields?: { path: string; message: string }[];
};
export type DbResult<T> = { ok: true; data: T } | DbFailure;

type DbError = { code?: string; name?: string };

// 42501: RLS·권한 거부, PGRST116: 단건 조회에서 행이 없음. 남의 데이터와 없는 데이터를 구분해 알려주지 않는다
const NOT_FOUND_CODES = new Set(["42501", "PGRST116"]);

/** Supabase 오류를 사용자용 결과로 바꾼다. 원본 문구는 로그에 남기지 않고 코드·이름만 남긴다 */
export function fromDbError(error: DbError, unavailableMessage: string): DbFailure {
  console.error("db error:", error.code ?? "-", error.name ?? "-");
  if (error.code && NOT_FOUND_CODES.has(error.code)) return { ok: false, kind: "not_found", message: "대상을 찾을 수 없습니다." };
  return { ok: false, kind: "unavailable", message: unavailableMessage };
}

export const MAX_FIELDS = 10;

export function fromZodError(error: ZodError, message: string): DbFailure {
  const fields = error.issues.slice(0, MAX_FIELDS).map((i) => ({ path: i.path.join("."), message: i.message }));
  return { ok: false, kind: "invalid_data", message, fields };
}
