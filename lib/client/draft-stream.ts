// /api/draft 호출과 응답 읽기. 시작 전 오류는 JSON, 통과하면 줄 단위 JSON(NDJSON) 스트림이다(SPEC-draft-route.md).
import type { NormalizeChange } from "../../core/schema/normalize-blueprint";

export type DraftStage =
  | { stage: "accepted" }
  | { stage: "generating"; attempt: number }
  | { stage: "validating"; attempt: number }
  | { stage: "normalizing"; changes: number }
  | { stage: "regenerating"; attempt: number }
  | { stage: "saving" };

export type ApiError = { code: string; message: string; retryable: boolean; fields?: { path: string; message: string }[] };
export type DraftMeta = { attempts: number; elapsedMs: number; normalized: NormalizeChange[]; saved?: { revision: number; updatedAt: string } };

export type DraftOutcome =
  | { kind: "done"; blueprint: unknown; meta: DraftMeta }
  | { kind: "error"; status: number; error: ApiError; blueprint?: unknown } // 저장 실패는 blueprint가 함께 온다
  | { kind: "disconnected" } // done·error 없이 스트림이 끝났거나 마지막 줄 이후 30초 동안 아무것도 오지 않음
  | { kind: "timeout" } // 클라이언트 전체 제한 시간 초과(서버 마감보다 길게 둔다)
  | { kind: "network" }
  | { kind: "aborted" };

export const IDLE_MS = 30_000;
export const TIMEOUT_TEXT_MS = 50_000;
export const TIMEOUT_IMAGE_MS = 65_000;

export type RequestOptions = {
  hasImages: boolean;
  onStage?: (stage: DraftStage) => void;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  idleMs?: number;
  timeoutMs?: number;
};

const UNKNOWN_ERROR: ApiError = { code: "unknown", message: "요청을 처리하지 못했습니다. 다시 시도해 주세요.", retryable: true };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

function asApiError(v: unknown): ApiError {
  if (!isObj(v) || typeof v.code !== "string" || typeof v.message !== "string") return UNKNOWN_ERROR;
  return {
    code: v.code,
    message: v.message,
    retryable: v.retryable === true,
    ...(Array.isArray(v.fields) ? { fields: v.fields as ApiError["fields"] } : {}),
  };
}

async function readJsonError(res: Response): Promise<DraftOutcome> {
  try {
    const body: unknown = await res.json();
    return { kind: "error", status: res.status, error: isObj(body) ? asApiError(body.error) : UNKNOWN_ERROR };
  } catch {
    return { kind: "error", status: res.status, error: UNKNOWN_ERROR };
  }
}

/**
 * 한 줄을 해석한다. done·error면 결과를, 단계 알림이면 onStage를 부르고, ping·알 수 없는 줄은 무시한다(null)
 */
function handleLine(line: string, onStage?: (s: DraftStage) => void): DraftOutcome | null {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObj(msg)) return null;
  if (msg.type === "stage" && typeof msg.stage === "string") {
    const stage = { ...msg };
    delete stage.type;
    onStage?.(stage as DraftStage);
    return null;
  }
  if (msg.type === "done" && isObj(msg.meta)) return { kind: "done", blueprint: msg.blueprint, meta: msg.meta as DraftMeta };
  if (msg.type === "error") {
    return { kind: "error", status: typeof msg.status === "number" ? msg.status : 500, error: asApiError(msg.error), ...("blueprint" in msg ? { blueprint: msg.blueprint } : {}) };
  }
  return null; // ping 등
}

export async function requestDraft(form: FormData, options: RequestOptions): Promise<DraftOutcome> {
  const fetchFn = options.fetchFn ?? fetch;
  const idleMs = options.idleMs ?? IDLE_MS;
  const timeoutMs = options.timeoutMs ?? (options.hasImages ? TIMEOUT_IMAGE_MS : TIMEOUT_TEXT_MS);

  const controller = new AbortController();
  let reason: "timeout" | "idle" | "aborted" | null = null;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const stop = (r: "timeout" | "idle" | "aborted") => {
    if (reason) return;
    reason = r;
    controller.abort();
    activeReader?.cancel().catch(() => {}); // 읽기 중인 본문도 함께 끊는다(대기 중인 read()가 풀린다)
  };
  const interrupted = (): DraftOutcome | null =>
    reason === "timeout" ? { kind: "timeout" } : reason === "idle" ? { kind: "disconnected" } : reason === "aborted" ? { kind: "aborted" } : null;

  const total = setTimeout(() => stop("timeout"), timeoutMs);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => stop("idle"), idleMs);
  };
  const onAbort = () => stop("aborted");
  if (options.signal?.aborted) onAbort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let res: Response;
    try {
      res = await fetchFn("/api/draft", { method: "POST", body: form, signal: controller.signal });
    } catch {
      return interrupted() ?? { kind: "network" };
    }

    // 시작 전 오류는 상태 코드 + JSON
    if (!res.headers.get("content-type")?.includes("application/x-ndjson")) return await readJsonError(res);
    if (!res.body) return { kind: "disconnected" };

    armIdle(); // 마지막 줄(하트비트 포함)을 받은 뒤부터 센다
    const reader = res.body.getReader();
    activeReader = reader;
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i).trim();
          buffer = buffer.slice(i + 1); // 잘린 줄은 다음 조각과 이어 붙인다
          if (!line) continue;
          armIdle();
          const outcome = handleLine(line, options.onStage);
          if (outcome) return outcome;
        }
      }
    } catch {
      return interrupted() ?? { kind: "disconnected" };
    } finally {
      reader.cancel().catch(() => {});
    }

    const rest = buffer.trim();
    if (rest) {
      const outcome = handleLine(rest, options.onStage);
      if (outcome) return outcome;
    }
    return interrupted() ?? { kind: "disconnected" }; // done·error 없이 끝났다
  } finally {
    clearTimeout(total);
    clearTimeout(idle);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
