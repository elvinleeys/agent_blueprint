import { httpError, type HttpError } from "../ai/draft-http";
import type { DbFailure } from "../db/result";

export const MAX_JSON_BYTES = 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export const respond = (e: HttpError) => Response.json(e.body, { status: e.status });
export const invalidInput = (message: string) => httpError(400, "invalid_input", message, false);

/**
 * DB 결과의 실패를 HTTP 오류로 바꾼다. 같은 invalid_data라도 "내가 보낸 값이 틀림"(422)과
 * "DB에서 읽은 값이 손상"(500)은 다르므로 호출하는 쪽이 source로 알려 준다
 */
export function dbFailureToHttp(f: DbFailure, source: "input" | "stored" = "input"): HttpError {
  switch (f.kind) {
    case "not_found":
      return httpError(404, "not_found", f.message, false);
    case "conflict":
      return httpError(409, "conflict", f.message, false);
    case "invalid_data":
      return source === "stored"
        ? httpError(500, "stored_data_invalid", f.message, false)
        : httpError(422, "invalid_data", f.message, false, f.fields);
    case "unavailable":
      return httpError(503, "db_unavailable", f.message, true);
  }
}

export type JsonRead = { ok: true; value: unknown } | { ok: false; error: HttpError };

/** JSON 본문만 받는다(다른 사이트의 폼 전송 방어를 겸함). 본문은 1MB 이하 */
export async function readJson(request: Request): Promise<JsonRead> {
  const tooLarge = () => ({ ok: false as const, error: httpError(413, "payload_too_large", "요청이 너무 큽니다. 1MB 이하로 줄여서 보내 주세요.", false) });
  if (!request.headers.get("content-type")?.includes("application/json")) return { ok: false, error: invalidInput("application/json 형식으로 보내야 합니다.") };
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) return tooLarge();

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, error: invalidInput("요청 본문을 읽을 수 없습니다.") };
  }
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) return tooLarge();
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: invalidInput("JSON 형식이 올바르지 않습니다.") };
  }
}
