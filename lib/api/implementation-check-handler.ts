import "server-only";
import { z } from "zod";
import { httpError, type HttpError } from "../ai/draft-http";
import { readCodeModel } from "../../core/code-model/facts";
import { checkLimits, describeLimitProblems, CONFIG_FILE, filterFiles } from "../../core/code-model/filter-files";
import { configSummary } from "../../core/impl-check/config-summary";
import { AUTO_REMOVABLE, CONFIRMED_PROBLEM_TEXT, validateConfirmed } from "../../core/impl-check/confirmed";
import { checkImplementation } from "../../core/impl-check/run";
import { selectByBlueprint } from "../../core/impl-check/select-files";
import { parseRepoUrl, type RepoTarget } from "../../core/code-source/github-url";
import type { SourceFile } from "../../core/code-model/types";
import { buildAiInput, isEmptyAiInput, type AiInput } from "../../core/impl-check/ai-input";
import type { AiSuggestions } from "../../core/impl-check/ai-schema";
import type { Pairing } from "../../core/impl-check/types";
import type { Blueprint } from "../../core/schema/blueprint";
import { BUDGET_TEXT_MS } from "../ai/draft-blueprint";
import { suggestImplementation, type ImplAiFailure } from "../ai/impl-suggest";
import { readGithubRepo, SERVER_REPO_LIMITS, type RepoErrorCode } from "../code-source/github";
import { loadBlueprint } from "../db/blueprints";
import { loadLatestBlueprintRef, loadLatestExportedRevision } from "../db/prompt-exports";
import { checkFeature } from "./feature-access";
import { dbFailureToHttp, invalidInput, parseProjectId, projectError, readJson, respond, type IdContext } from "./http";
import { requireSession } from "./session";

/** 코드 1MB + 설정 파일 + JSON 이스케이프 여유. Vercel 요청 본문 한도(4.5MB) 안 */
export const IMPLEMENTATION_CHECK_MAX_BODY_BYTES = 3 * 1024 * 1024;

const FileList = z.array(z.object({ path: z.string().min(1).max(500), content: z.string() }).strict()).max(500);
// source는 기록용(사용자가 직접 짝지음 user / AI 제안을 받아들임 ai). 받아들인 순간 사용자의 결정이라 판정에는 쓰지 않는다
const ConfirmedItem = z.object({ nodeId: z.string().min(1).max(200), path: z.string().min(1).max(500), name: z.string().min(1).max(200), source: z.enum(["user", "ai"]).optional() }).strict();

/** GitHub 공개 저장소(4f). commit은 짝 확정 뒤 다시 검사할 때 같은 코드를 받으려고 첫 응답의 커밋 id를 그대로 보낸다 */
const RepoInput = z.object({ url: z.string().min(1).max(300), subdir: z.string().max(300).nullable().optional(), commit: z.string().regex(/^[0-9a-f]{40}$/).optional() }).strict();

// useAi: 코드 판정 뒤에 AI 제안을 받는다(허용된 사용자만, 결과 숫자는 바뀌지 않음)
const BodySchema = z
  .object({ codeFiles: FileList.optional(), repo: RepoInput.optional(), confirmed: z.array(ConfirmedItem).max(200).optional(), useAi: z.boolean().optional() })
  .strict()
  .refine((b) => (b.codeFiles === undefined) !== (b.repo === undefined));

/** 저장소에서 설계도 위치 기준으로 고른 뒤의 상한(4f 승인 값). 업로드(30개·1MB)보다 크지만 서버 한 번 분석에 맞춘 값 */
export const REPO_PICKED_LIMITS = { maxFiles: 200, maxFileBytes: 200 * 1024, maxTotalBytes: 5 * 1024 * 1024 };

/** 저장소 읽기 오류 → HTTP 상태. 문구는 lib/code-source가 만든 사용자용 문구(토큰·코드·압축 파일 안 문자열 없음)를 그대로 쓴다 */
const REPO_STATUS: Record<RepoErrorCode, HttpError["status"]> = {
  not_found: 422,
  private: 422,
  moved: 422,
  ref_not_found: 422,
  subdir_not_found: 422,
  unsafe_path: 422,
  bad_archive: 422,
  too_large: 413,
  too_large_unpacked: 413,
  too_many_entries: 413,
  file_too_large: 413,
  kept_too_large: 413,
  too_many_files: 413,
  rate_limited: 429,
  forbidden: 502,
  bad_redirect: 502,
  github_error: 502,
  network: 502,
  timeout: 504,
  aborted: 400,
};
const RETRYABLE = new Set<RepoErrorCode>(["rate_limited", "forbidden", "github_error", "network", "timeout"]);

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** 이 서버 인스턴스가 구현 검사를 몇 번째로 처리하는지(4c 성능 측정에서 첫 요청과 이후 요청을 나누려고 센다) */
let requestCount = 0;
const ms = (from: number, to: number) => Math.round((to - from) * 10) / 10;

/**
 * POST /api/projects/[id]/implementation-check — 올린 코드가 기준 설계도를 지켰는지 검사한다.
 * 기준 판: 지시서를 가장 최근에 내보낸 판. 내보낸 적이 없으면 최신 판(baseline.source가 "latest").
 * 코드는 이 요청 안에서만 쓰고 저장하지 않으며, 응답 오류와 서버 로그에 코드 내용을 남기지 않는다(개수·크기·시간만 남긴다). AI를 부르지 않는다.
 */
export async function handleImplementationCheckPost(request: Request, ctx: IdContext): Promise<Response> {
  const t0 = performance.now();
  const session = await requireSession();
  if (!session.ok) return session.response;
  const id = await parseProjectId(ctx);
  if (!id.ok) return respond(id.error);
  const body = await readJson(request, IMPLEMENTATION_CHECK_MAX_BODY_BYTES);
  if (!body.ok) return respond(body.error);
  const parsed = BodySchema.safeParse(body.value);
  if (!parsed.success) return respond(invalidInput("요청 형식이 올바르지 않습니다. { codeFiles 또는 repo, confirmed? } 형식이어야 합니다."));
  const { db } = session;
  const input = parsed.data;

  // 0) AI 제안은 허용된 사용자만(화면과 같은 판단). 코드를 받거나 OpenAI를 부르기 전에 거절한다
  if (input.useAi && (await checkFeature("ai", db)) !== "allowed") return respond(httpError(403, "feature_restricted", "AI 제안은 현재 제한된 기능입니다. AI 없이 검사해 주세요.", false));

  // 1) 코드 출처별로 DB를 읽기 전에 거절할 것은 먼저 거절한다
  let files: SourceFile[] = [];
  let target: RepoTarget | null = null;
  if (input.repo) {
    // 저장소 검사는 허용된 사용자만(화면과 같은 판단). GitHub를 부르기 전에 거절한다
    const access = await checkFeature("repoCheck", db);
    if (access !== "allowed") return respond(httpError(403, "feature_restricted", "GitHub 저장소 검사는 현재 제한된 기능입니다. 코드 폴더를 올려 검사해 주세요.", false));
    const url = parseRepoUrl(input.repo.url, input.repo.subdir);
    if (!url.ok) return respond(invalidInput(url.message));
    target = input.repo.commit ? { ...url.target, ref: input.repo.commit } : url.target;
  } else {
    // 화면과 같은 규칙으로 다시 거르고 상한을 검사한다(화면을 거치지 않은 요청 방어). tsconfig·jsconfig도 받는다
    const { accepted } = filterFiles(input.codeFiles!.map((f) => ({ ...f, size: byteLength(f.content) })), { allowConfigFiles: true });
    const problems = checkLimits(accepted);
    if (problems.length) return respond(httpError(413, "payload_too_large", `검사할 코드: ${describeLimitProblems(problems)}`, false));
    if (!accepted.some((f) => !CONFIG_FILE.test(f.path))) return respond(invalidInput("검사할 코드: 분석할 .ts·.tsx 파일이 없습니다."));
    files = accepted.map(({ path, content }) => ({ path, content }));
  }
  const notFound = await projectError(db, id.id);
  if (notFound) return respond(notFound);
  const sequence = ++requestCount;
  const t1 = performance.now();

  // 2) 기준 판: 가장 최근에 내보낸 판 → 없으면 최신 판
  const exported = await loadLatestExportedRevision(db, id.id);
  if (!exported.ok) return respond(dbFailureToHttp(exported));
  const latest = await loadLatestBlueprintRef(db, id.id);
  if (!latest.ok) return respond(dbFailureToHttp(latest));
  if (!latest.data) return respond(httpError(422, "no_blueprint", "검사할 설계도가 없습니다. 먼저 구조 설계를 만들어 주세요.", false));
  const revision = exported.data ?? latest.data.revision;
  const blueprint = await loadBlueprint(db, id.id, { revision });
  if (!blueprint.ok) return respond(dbFailureToHttp(blueprint, "stored"));
  if (!blueprint.data) return respond(httpError(422, "no_blueprint", "검사할 설계도가 없습니다. 먼저 구조 설계를 만들어 주세요.", false));
  const bp = blueprint.data;
  if (bp.stack.framework === "html") return respond(httpError(422, "unsupported_stack", "HTML 프로젝트는 구현 검사를 지원하지 않습니다.", false));
  const baseline = { revision, source: exported.data === null ? ("latest" as const) : ("export" as const), ...(latest.data.revision > revision ? { newerRevision: latest.data.revision } : {}) };

  // 2-1) 저장소: 기준 판이 있을 때만 받는다(서버용 제한, 사용자가 연결을 끊으면 중단). 받은 코드는 메모리에서만 쓰고 로그에는 오류 코드만 남긴다
  let repo: { name: string; ref: string; commit: string | null; subdir: string | null } | null = null;
  if (target) {
    const read = await readGithubRepo(target, { limits: SERVER_REPO_LIMITS, signal: request.signal });
    if (!read.ok) {
      console.info("[implementation-check] 저장소 읽기 실패", read.error.code);
      const e = httpError(REPO_STATUS[read.error.code], read.error.code, read.error.message, RETRYABLE.has(read.error.code));
      return respond({ status: e.status, body: { error: { ...e.body.error, ...(read.error.retryAfterSec !== undefined ? { retryAfterSec: read.error.retryAfterSec } : {}) } } });
    }
    const picked = selectByBlueprint(bp, read.files);
    const sized = picked.map((f) => ({ ...f, size: byteLength(f.content) }));
    const problems = checkLimits(sized, REPO_PICKED_LIMITS);
    if (problems.length) return respond(httpError(413, "payload_too_large", `저장소에서 고른 코드: ${describeLimitProblems(problems, REPO_PICKED_LIMITS)} 하위 폴더를 지정해 범위를 좁혀 보세요.`, false));
    if (!picked.some((f) => !CONFIG_FILE.test(f.path))) return respond(httpError(422, "no_source_files", "저장소에서 설계도 위치에 맞는 .ts·.tsx 파일을 찾지 못했습니다. 하위 폴더와 설계도의 파일 위치를 확인해 주세요.", false));
    files = picked;
    repo = { name: `${read.owner}/${read.repo}`, ref: read.ref, commit: read.commit, subdir: target.subdir };
  }
  const t2 = performance.now();

  // 3) 분석·검증·검사. 실패해도 응답과 로그에는 코드가 든 메시지를 넣지 않는다
  try {
    const model = readCodeModel(files);
    const t3 = performance.now();
    const confirmed = parsed.data.confirmed ?? [];
    const wrong = validateConfirmed(bp, model, confirmed);
    if (wrong.length) {
      const fields = wrong.map((w) => ({ path: `confirmed[${w.index}]`, message: CONFIRMED_PROBLEM_TEXT[w.reason] }));
      // 다른 422(판 없음·HTML 등)와 구분하도록 code와 invalid 목록(nodeId·사유·자동으로 뺄 수 있는지)을 함께 낸다. 코드 내용은 담지 않는다
      const e = httpError(422, "invalid_confirmed", "확정한 짝이 올바르지 않습니다.", false, fields);
      return respond({ status: e.status, body: { error: { ...e.body.error, invalid: wrong.map((w) => ({ index: w.index, nodeId: w.nodeId, reason: w.reason, removable: AUTO_REMOVABLE.has(w.reason) })) } } });
    }
    const { pairing, ...result } = checkImplementation(bp, model, confirmed);
    // 화면이 "같은 것으로 짝짓기"에서 confirmed의 path를 만들 수 있도록 짝 확인 필요 노드의 후보(이름·파일 경로·근거)를 따로 낸다. 코드 내용은 담지 않는다
    const pairReviews = pairing.reviews.map((r) => ({
      nodeId: r.nodeId,
      nodeName: r.nodeName,
      reason: r.reason,
      ...(r.via ? { via: r.via } : {}),
      candidates: r.candidates.map((c) => ({
        name: c.unit.name,
        path: c.unit.path,
        kind: c.unit.kind,
        exported: c.unit.exported,
        score: c.score,
        ...(c.contestedBy ? { contestedBy: c.contestedBy } : {}),
        evidence: c.evidence.map((e) => ({ kind: e.kind, detail: e.detail })),
      })),
    }));
    const configs = configSummary(files, model);
    const t4 = performance.now();

    // 4) AI 제안(요청했을 때만). 코드 판정(result)은 이미 끝났고 AI는 바꾸지 못한다. 어떤 실패든 ai.status만 바뀐다
    const ai = input.useAi ? await runAiSuggestions(bp, pairing, files, t0) : null;
    const t5 = performance.now();

    const timing = { totalMs: ms(t0, t5), filterMs: ms(t0, t1), dbMs: ms(t1, t2), parseMs: ms(t2, t3), checkMs: ms(t3, t4), ...(ai ? { aiMs: ms(t4, t5) } : {}), requestNumber: sequence, first: sequence === 1 };
    const bytes = files.reduce((n, f) => n + byteLength(f.content), 0);
    const aiSources = confirmed.filter((c) => c.source === "ai").length;
    console.info("[implementation-check]", JSON.stringify({ source: repo ? "repo" : "upload", files: files.length, bytes, nodes: bp.nodes.length, confirmed: confirmed.length, confirmedFromAi: aiSources, ...timing }));
    if (ai) console.info("[implementation-check] ai", JSON.stringify(aiLogLine(ai)));
    return Response.json(
      { baseline, ...(repo ? { repo } : {}), result, pairReviews, ...(ai ? { ai } : {}), meta: { timing, files: files.length, bytes, nodes: bp.nodes.length, confirmedApplied: confirmed.length, configs } },
      { headers: { "Server-Timing": `total;dur=${timing.totalMs}, filter;dur=${timing.filterMs}, db;dur=${timing.dbMs}, parse;dur=${timing.parseMs}, check;dur=${timing.checkMs}${ai ? `, ai;dur=${timing.aiMs}` : ""}` } },
    );
  } catch (e) {
    console.error("[implementation-check] 분석 실패", e instanceof Error ? e.name : "error");
    return respond(httpError(500, "analysis_failed", "코드를 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.", true));
  }
}

/** 라우트 maxDuration(60초) 안에서 응답을 마칠 수 있게 AI에 쓸 수 있는 시간을 줄인다(저장소 받기에 쓴 시간을 뺀다) */
const ROUTE_BUDGET_MS = 55_000;

export type AiOutcome =
  | { status: "ok"; suggestions: AiSuggestions; omitted: AiInput["omitted"]; meta: AiMeta }
  | { status: "failed"; failure: ImplAiFailure; omitted: AiInput["omitted"]; meta: AiMeta }
  | { status: "skipped"; omitted: AiInput["omitted"] };
type AiMeta = { model: string; attempts: number; elapsedMs: number; costUsd: number };

async function runAiSuggestions(bp: Blueprint, pairing: Pairing, files: SourceFile[], t0: number): Promise<AiOutcome> {
  const input = buildAiInput(bp, pairing, files);
  if (isEmptyAiInput(input)) return { status: "skipped", omitted: input.omitted };
  const budgetMs = Math.min(BUDGET_TEXT_MS, ROUTE_BUDGET_MS - (performance.now() - t0));
  try {
    const r = await suggestImplementation(input, { budgetMs });
    const meta = { model: r.model, attempts: r.attempts, elapsedMs: r.elapsedMs, costUsd: r.costUsd };
    return r.ok ? { status: "ok", suggestions: r.suggestions, omitted: input.omitted, meta } : { status: "failed", failure: r.kind, omitted: input.omitted, meta };
  } catch (e) {
    // 키가 없을 때 등 클라이언트를 만들지 못하면 여기로 온다. 코드 판정 결과는 그대로 보낸다
    console.error("[implementation-check] AI 호출 준비 실패", e instanceof Error ? e.name : "error");
    return { status: "failed", failure: "upstream", omitted: input.omitted, meta: { model: "", attempts: 0, elapsedMs: 0, costUsd: 0 } };
  }
}

/** 로그 한 줄: 상태·개수·비용·시간만(근거 글·코드 조각 없음) */
const aiLogLine = (ai: AiOutcome) => ({
  status: ai.status,
  ...(ai.status === "failed" ? { failure: ai.failure } : {}),
  ...(ai.status === "ok" ? { pairs: ai.suggestions.pairs.length, responsibilities: ai.suggestions.responsibilities.length, dropped: ai.suggestions.dropped } : {}),
  omitted: ai.omitted.pairNodes.length + ai.omitted.responsibilityNodes.length,
  ...(ai.status !== "skipped" ? ai.meta : {}),
});
