import "server-only";
import { z } from "zod";
import { httpError } from "../ai/draft-http";
import { readCodeModel } from "../../core/code-model/facts";
import { checkLimits, describeLimitProblems, CONFIG_FILE, filterFiles } from "../../core/code-model/filter-files";
import { CONFIRMED_PROBLEM_TEXT, validateConfirmed } from "../../core/impl-check/confirmed";
import { checkImplementation } from "../../core/impl-check/run";
import { loadBlueprint } from "../db/blueprints";
import { loadLatestBlueprintRef, loadLatestExportedRevision } from "../db/prompt-exports";
import { dbFailureToHttp, invalidInput, parseProjectId, projectError, readJson, respond, type IdContext } from "./http";
import { requireSession } from "./session";

/** 코드 1MB + 설정 파일 + JSON 이스케이프 여유. Vercel 요청 본문 한도(4.5MB) 안 */
export const IMPLEMENTATION_CHECK_MAX_BODY_BYTES = 3 * 1024 * 1024;

const FileList = z.array(z.object({ path: z.string().min(1).max(500), content: z.string() }).strict()).max(500);
const ConfirmedItem = z.object({ nodeId: z.string().min(1).max(200), path: z.string().min(1).max(500), name: z.string().min(1).max(200) }).strict();

// useAi·accepted는 5단계(AI 제안)에서 더한다. 지금은 모르는 필드로 보고 400을 낸다
const BodySchema = z.object({ codeFiles: FileList, confirmed: z.array(ConfirmedItem).max(200).optional() }).strict();

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
  if (!parsed.success) return respond(invalidInput("요청 형식이 올바르지 않습니다. { codeFiles, confirmed? } 형식이어야 합니다."));
  const notFound = await projectError(session.db, id.id);
  if (notFound) return respond(notFound);
  const { db } = session;
  const sequence = ++requestCount;

  // 1) 화면과 같은 규칙으로 다시 거르고 상한을 검사한다(화면을 거치지 않은 요청 방어). tsconfig·jsconfig도 받는다. DB를 읽기 전에 거절할 것은 먼저 거절한다
  const { accepted } = filterFiles(parsed.data.codeFiles.map((f) => ({ ...f, size: byteLength(f.content) })), { allowConfigFiles: true });
  const problems = checkLimits(accepted);
  if (problems.length) return respond(httpError(413, "payload_too_large", `검사할 코드: ${describeLimitProblems(problems)}`, false));
  if (!accepted.some((f) => !CONFIG_FILE.test(f.path))) return respond(invalidInput("검사할 코드: 분석할 .ts·.tsx 파일이 없습니다."));
  const files = accepted.map(({ path, content }) => ({ path, content }));
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
  const t2 = performance.now();

  // 3) 분석·검증·검사. 실패해도 응답과 로그에는 코드가 든 메시지를 넣지 않는다
  try {
    const model = readCodeModel(files);
    const t3 = performance.now();
    const confirmed = parsed.data.confirmed ?? [];
    const wrong = validateConfirmed(bp, model, confirmed);
    if (wrong.length) {
      const fields = wrong.map((w) => ({ path: `confirmed[${w.index}]`, message: CONFIRMED_PROBLEM_TEXT[w.reason] }));
      return respond(httpError(422, "invalid_confirmed", "확정한 짝이 올바르지 않습니다.", false, fields));
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
    // 올린 설정 파일 중 읽은 수와, 끝까지 따라가지 못한 설정(읽지 못함·extends·지원하지 않는 패턴) 수
    const uploadedConfigs = files.filter((f) => CONFIG_FILE.test(f.path)).length;
    const unreadConfigs = new Set(model.configNotes.filter((n) => n.reason === "invalid-json").map((n) => n.path)).size;
    const configs = { read: uploadedConfigs - unreadConfigs, unsupported: model.configNotes.length };
    const t4 = performance.now();

    const timing = { totalMs: ms(t0, t4), filterMs: ms(t0, t1), dbMs: ms(t1, t2), parseMs: ms(t2, t3), checkMs: ms(t3, t4), requestNumber: sequence, first: sequence === 1 };
    const bytes = files.reduce((n, f) => n + byteLength(f.content), 0);
    console.info("[implementation-check]", JSON.stringify({ files: files.length, bytes, nodes: bp.nodes.length, confirmed: confirmed.length, ...timing }));
    return Response.json(
      { baseline, result, pairReviews, meta: { timing, files: files.length, bytes, nodes: bp.nodes.length, confirmedApplied: confirmed.length, configs } },
      { headers: { "Server-Timing": `total;dur=${timing.totalMs}, filter;dur=${timing.filterMs}, db;dur=${timing.dbMs}, parse;dur=${timing.parseMs}, check;dur=${timing.checkMs}` } },
    );
  } catch (e) {
    console.error("[implementation-check] 분석 실패", e instanceof Error ? e.name : "error");
    return respond(httpError(500, "analysis_failed", "코드를 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.", true));
  }
}
