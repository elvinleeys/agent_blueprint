import "server-only";
import { dbFailureToHttp } from "../api/http";
import { createBlueprintRevision } from "../db/blueprints";
import { getProject } from "../db/projects";
import { createClient } from "../supabase/server";
import { draftBlueprint } from "./draft-blueprint";
import { internalError, parseDraftRequest, toErrorResponse, unauthorized, type HttpError } from "./draft-http";

const respond = (e: HttpError) => Response.json(e.body, { status: e.status });
const redact = (s: string) => s.replace(/sk-[A-Za-z0-9_\-*.]{6,}/g, "sk-***");

/**
 * POST /api/draft 본문. 순서: 세션 확인(401) → 요청 검증(400·413) → (projectId가 있으면) 프로젝트 소유 확인(404) → 초안 생성
 * → (projectId가 있으면) 새 판으로 저장 → 결과 매핑(422·429·502·504)
 */
export async function handleDraftRequest(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return respond(unauthorized());

    const parsed = await parseDraftRequest(request);
    if (!parsed.ok) return respond(parsed.error);

    // projectId가 있으면 AI를 호출하기 전에 내 프로젝트인지 확인하고(남의·없는 프로젝트는 비용 없이 404),
    // 스택은 요청값이 아니라 프로젝트에 저장된 값을 쓴다
    let stack = parsed.input.stack;
    if (parsed.projectId) {
      const project = await getProject(supabase, parsed.projectId);
      if (!project.ok) return respond(dbFailureToHttp(project));
      stack = project.data.stack;
    }
    if (!stack) return respond(internalError()); // parseDraftRequest가 projectId 없이 stack 없는 요청을 이미 거절한다

    const result = await draftBlueprint({ ...parsed.input, stack }, { startedAt });

    // 저장이 실패해도 초안은 버리지 않는다(이미 AI 비용이 들었다). 클라이언트가 PUT으로 다시 저장할 수 있다
    const saved = result.ok && parsed.projectId ? await createBlueprintRevision(supabase, parsed.projectId, result.blueprint) : null;
    // 서버 로그에는 사용량과 결과만 남긴다. 이미지·응답 원문·키는 남기지 않는다
    console.log(
      JSON.stringify({
        event: "draft",
        userId: data.claims.sub,
        ok: result.ok,
        ...(result.ok ? {} : { kind: result.kind, upstreamStatus: result.upstreamStatus, errorName: result.errorName }),
        images: parsed.input.images.length,
        attempts: result.attempts,
        normalized: result.normalized.length,
        ...(saved ? { saved: saved.ok } : {}),
        elapsedMs: result.elapsedMs,
        usage: result.usage,
        costUsd: result.costUsd,
      }),
    );

    if (!result.ok) return respond(toErrorResponse(result));
    const saveMeta = saved
      ? saved.ok
        ? { saved: saved.data }
        : { saveError: { code: dbFailureToHttp(saved).body.error.code, message: saved.message } }
      : {};
    return Response.json({ blueprint: result.blueprint, meta: { attempts: result.attempts, elapsedMs: result.elapsedMs, normalized: result.normalized, ...saveMeta } });
  } catch (e) {
    console.error("draft route failed:", e instanceof Error ? `${e.name}: ${redact(e.message)}` : "unknown error");
    return respond(internalError());
  }
}
