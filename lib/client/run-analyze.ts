import type { AnalyzeResult, SpecSource } from "../../core/cleanup/analyze";
import type { SourceFile } from "../../core/cleanup/types";

// 브라우저 전용: 거른 파일을 /api/analyze로 보내 결과를 받는다. 코드 원본은 이 요청에만 쓰고 어디에도 저장하지 않는다

export type AnalyzeFailure = { message: string; /** 스펙 JSON 오류 목록 등 */ details: string[]; retryable: boolean };
export type AnalyzeOutcome = { ok: true; result: AnalyzeResult } | { ok: false; failure: AnalyzeFailure };

const NETWORK_ERROR: AnalyzeFailure = { message: "서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.", details: [], retryable: true };

/** 검사할 코드 파일과 디자인 시스템(파일 묶음 또는 스펙 JSON)을 보낸다 */
export async function runAnalyze(codeFiles: SourceFile[], designSystem: SpecSource, fetchImpl: typeof fetch = fetch): Promise<AnalyzeOutcome> {
  const body = designSystem.kind === "files" ? { codeFiles, designSystemFiles: designSystem.files } : { codeFiles, specJson: designSystem.text };
  let res: Response;
  try {
    res = await fetchImpl("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, failure: NETWORK_ERROR };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, failure: res.ok ? NETWORK_ERROR : { message: `분석하지 못했습니다(오류 ${res.status}). 잠시 후 다시 시도해 주세요.`, details: [], retryable: res.status >= 500 } };
  }

  if (res.ok) {
    const result = (json as { result?: AnalyzeResult }).result;
    return result ? { ok: true, result } : { ok: false, failure: NETWORK_ERROR };
  }
  if (res.status === 401) return { ok: false, failure: { message: "로그인이 필요합니다. 다시 로그인해 주세요.", details: [], retryable: false } };
  const err = (json as { error?: { message?: string; retryable?: boolean; fields?: { message: string }[] } }).error;
  return {
    ok: false,
    failure: {
      message: err?.message ?? `분석하지 못했습니다(오류 ${res.status}).`,
      details: err?.fields?.map((f) => f.message) ?? [],
      retryable: err?.retryable ?? res.status >= 500,
    },
  };
}
