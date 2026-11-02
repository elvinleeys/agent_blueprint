// 지시서 내보내기 한 번의 흐름(브라우저 전용): 저장 큐를 비운 뒤에만 서버에 요청한다

export type ExportFormat = "prompt" | "claude_md";
export type ExportDocument = { format: ExportFormat; fileName: string; content: string; recorded: boolean };
export type ExportData = { revision: number; specEmpty: boolean; documents: ExportDocument[] };

export type ExportFailure = {
  reason: "save_failed" | "request_failed";
  message: string;
  needsLogin: boolean;
};
export type ExportOutcome = { kind: "done"; data: ExportData } | ({ kind: "failed" } & ExportFailure);

export const SAVE_FAILED_MESSAGE = "저장되지 않은 수정이 있어 내보내지 않았습니다. 저장이 끝난 뒤 다시 시도해 주세요.";
const REQUEST_FAILED = "지시서를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
const LOGIN_REQUIRED = "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.";

const failed = (f: ExportFailure): ExportOutcome => ({ kind: "failed", ...f });

/** POST /api/projects/[id]/exports. 서버가 준 사용자용 문구가 있으면 그대로 쓰고, 없으면 일반 문구 */
export async function postExport(projectId: string, route: string | null, fetchFn: typeof fetch = fetch): Promise<ExportOutcome> {
  let res: Response;
  try {
    res = await fetchFn(`/api/projects/${projectId}/exports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ route }) });
  } catch {
    return failed({ reason: "request_failed", message: "연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.", needsLogin: false });
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 본문이 JSON이 아니면 아래 일반 문구
  }
  if (res.ok && isExportData(body)) return { kind: "done", data: body };
  if (res.status === 401) return failed({ reason: "request_failed", message: LOGIN_REQUIRED, needsLogin: true });
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return failed({ reason: "request_failed", message: typeof message === "string" && message ? message : REQUEST_FAILED, needsLogin: false });
}

function isExportData(v: unknown): v is ExportData {
  const d = v as ExportData | null;
  return (
    !!d &&
    typeof d.revision === "number" &&
    typeof d.specEmpty === "boolean" &&
    Array.isArray(d.documents) &&
    d.documents.length > 0 &&
    d.documents.every((x) => typeof x?.content === "string" && typeof x.fileName === "string" && (x.format === "prompt" || x.format === "claude_md"))
  );
}

/**
 * 내보내기 순서: 저장 큐 drain이 true일 때만 서버에 요청한다. drain이 false면 요청하지 않고 저장 실패로 끝낸다.
 * (서버는 DB에 저장된 최신 판만 쓰므로, 보내지 않은 수정이 남은 채 요청하면 이전 내용으로 지시서가 만들어진다)
 */
export async function runExport(deps: { drain: () => Promise<boolean>; post: () => Promise<ExportOutcome> }): Promise<ExportOutcome> {
  let saved = false;
  try {
    saved = await deps.drain();
  } catch {
    saved = false;
  }
  if (!saved) return failed({ reason: "save_failed", message: SAVE_FAILED_MESSAGE, needsLogin: false });
  return deps.post();
}
