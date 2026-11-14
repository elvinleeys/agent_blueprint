import type { InvalidConfirmed } from "../ai/draft-http";
import type { AiSuggestions } from "../../core/impl-check/ai-schema";
import type { ImplCheckResult } from "../../core/impl-check/result";
import type { ConfirmedPair } from "../../core/impl-check/types";
import type { SourceFile } from "../../core/cleanup/types";

// 브라우저 전용: 올린 코드를 구현 검사 API로 보내 결과를 받는다. 코드 원본은 이 요청에만 쓰고 어디에도 저장하지 않는다.
// 확정한 짝이 코드·설계도가 바뀌어 더 유효하지 않으면(없는 코드·없는 노드·이미 확실한 짝) 그 짝만 빼고 한 번만 다시 검사한다.

export type PairReviewCandidate = {
  name: string;
  path: string;
  kind: "component" | "hook";
  exported: boolean;
  score: number;
  contestedBy?: string[];
  evidence: { kind: string; detail: string }[];
};
export type PairReview = { nodeId: string; nodeName: string; reason: string; via?: string; candidates: PairReviewCandidate[] };

/** GitHub 저장소 입력(4f). commit은 짝 확정 뒤 다시 검사할 때 첫 결과의 커밋으로 같은 코드를 받으려고 보낸다 */
export type RepoInput = { url: string; subdir?: string | null; commit?: string };
export type RepoInfo = { name: string; ref: string; commit: string | null; subdir: string | null };

/** AI 제안(요청에 useAi를 보냈을 때만). 설계 준수 집계(result)와 따로 보인다 */
export type AiOutcome =
  | { status: "ok"; suggestions: AiSuggestions; omitted: AiOmitted; meta: AiMeta }
  | { status: "failed"; failure: "invalid_output" | "timeout" | "rate_limited" | "upstream"; omitted: AiOmitted; meta: AiMeta }
  | { status: "skipped"; omitted: AiOmitted };
type AiOmitted = { pairNodes: string[]; responsibilityNodes: string[] };
type AiMeta = { model: string; attempts: number; elapsedMs: number; costUsd: number };

export type CheckResponse = {
  baseline: { revision: number; source: "export" | "latest"; newerRevision?: number };
  repo?: RepoInfo;
  ai?: AiOutcome;
  result: Pick<ImplCheckResult, "items" | "bans" | "findings" | "summary">;
  pairReviews: PairReview[];
  meta: { timing: { totalMs: number; requestNumber: number; first: boolean }; files: number; bytes: number; nodes: number; confirmedApplied: number; configs: { read: number; unsupported: number } };
};

export type CheckFailure = { message: string; details: string[]; retryable: boolean; code?: string; invalid?: InvalidConfirmed[] };
export type CheckOutcome = { ok: true; data: CheckResponse } | { ok: false; failure: CheckFailure };

const NETWORK_ERROR: CheckFailure = { message: "서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.", details: [], retryable: true };

/** code: 올린 파일 목록 또는 GitHub 저장소. useAi: 코드 판정 뒤에 AI 제안도 받는다(허용된 사용자만) */
export async function runImplementationCheck(projectId: string, code: SourceFile[] | RepoInput, confirmed: ConfirmedPair[], fetchImpl: typeof fetch = fetch, useAi = false): Promise<CheckOutcome> {
  const source = Array.isArray(code) ? { codeFiles: code } : { repo: code };
  let res: Response;
  try {
    res = await fetchImpl(`/api/projects/${projectId}/implementation-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...source, ...(confirmed.length ? { confirmed } : {}), ...(useAi ? { useAi: true } : {}) }),
    });
  } catch {
    return { ok: false, failure: NETWORK_ERROR };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, failure: res.ok ? NETWORK_ERROR : { message: `검사하지 못했습니다(오류 ${res.status}). 잠시 후 다시 시도해 주세요.`, details: [], retryable: res.status >= 500 } };
  }

  if (res.ok) {
    const data = json as Partial<CheckResponse>;
    return data.baseline && data.result && data.pairReviews && data.meta ? { ok: true, data: data as CheckResponse } : { ok: false, failure: NETWORK_ERROR };
  }
  if (res.status === 401) return { ok: false, failure: { message: "로그인이 필요합니다. 다시 로그인해 주세요.", details: [], retryable: false } };
  if (res.status === 404) return { ok: false, failure: { message: "프로젝트를 찾을 수 없습니다.", details: [], retryable: false } };
  const err = (json as { error?: { code?: string; message?: string; retryable?: boolean; fields?: { message: string }[]; invalid?: InvalidConfirmed[] } }).error;
  return {
    ok: false,
    failure: {
      message: err?.message ?? `검사하지 못했습니다(오류 ${res.status}).`,
      details: err?.fields?.map((f) => f.message) ?? [],
      retryable: err?.retryable ?? res.status >= 500,
      ...(err?.code ? { code: err.code } : {}),
      ...(err?.invalid ? { invalid: err.invalid } : {}),
    },
  };
}

export type RemovedPair = { nodeId: string; reason: string };
export type CheckRun = { outcome: CheckOutcome; /** 자동으로 뺀 확정 짝 */ removed: RemovedPair[]; /** 마지막 요청에 쓴 확정 짝 */ confirmed: ConfirmedPair[] };

/**
 * 검사를 하고, 확정한 짝이 코드·설계도가 바뀌어 유효하지 않다는 오류(invalid_confirmed)가 오면 그 짝만 빼고 **한 번만** 다시 검사한다.
 * - 자동으로 빼는 것은 서버가 removable로 알린 사유(없는 노드·없는 코드·이미 확실한 짝)뿐이다. 중복·종류 불일치가 하나라도 섞이면 아무것도 빼지 않고 오류로 보인다.
 * - 다시 검사해서도 실패하면 그 오류를 그대로 돌려준다(더 빼거나 다시 시도하지 않음).
 * - invalid_confirmed가 아닌 오류(판 없음·한도·네트워크 등)는 그대로 돌려준다.
 */
export async function checkWithAutoRemoval(run: (confirmed: ConfirmedPair[]) => Promise<CheckOutcome>, confirmed: ConfirmedPair[]): Promise<CheckRun> {
  const first = await run(confirmed);
  if (first.ok) return { outcome: first, removed: [], confirmed };
  const invalid = first.failure.code === "invalid_confirmed" ? first.failure.invalid : undefined;
  if (!invalid?.length || invalid.some((i) => !i.removable)) return { outcome: first, removed: [], confirmed };

  const drop = new Set(invalid.map((i) => i.index));
  const remaining = confirmed.filter((_, i) => !drop.has(i));
  const removed = invalid.map((i) => ({ nodeId: i.nodeId, reason: i.reason }));
  return { outcome: await run(remaining), removed, confirmed: remaining };
}
