import "server-only";
import { dbFailureToHttp } from "../api/http";
import { createBlueprintRevision } from "../db/blueprints";
import { getProject } from "../db/projects";
import { saveSpecInput } from "../db/spec-inputs";
import { createClient } from "../supabase/server";
import { draftBlueprint } from "./draft-blueprint";
import { ndjsonResponse } from "./draft-stream";
import { internalError, parseDraftRequest, toErrorResponse, unauthorized, type HttpError } from "./draft-http";

const respond = (e: HttpError) => Response.json(e.body, { status: e.status });
const redact = (s: string) => s.replace(/sk-[A-Za-z0-9_\-*.]{6,}/g, "sk-***");
const logFailure = (e: unknown) => console.error("draft route failed:", e instanceof Error ? `${e.name}: ${redact(e.message)}` : "unknown error");

/**
 * POST /api/draft 본문. 순서: 세션 확인(401) → 요청 검증(400·413) → (projectId가 있으면) 프로젝트 소유 확인(404) → 초안 생성
 * → 여기까지의 오류는 상태 코드. 이후 200 NDJSON 스트림: 단계 알림 → (projectId가 있으면) 새 판 저장 → done 또는 error(422·429·502·504·저장 실패)
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

    // 여기까지의 오류는 상태 코드로 응답했다. 이후는 200 스트림에 단계·완료·오류 알림을 줄 단위로 보낸다
    const input = { ...parsed.input, stack };
    const projectId = parsed.projectId;
    const userId = data.claims.sub;
    return ndjsonResponse(async (send) => {
      try {
        send({ type: "stage", stage: "accepted" });
        // 스펙 입력(7개 항목·화면 주소·이미지 수)은 AI 호출과 나란히 저장한다. 실패해도 초안 생성은 계속한다(이미지 원본은 저장하지 않는다)
        const specSave = projectId ? saveSpecInput(supabase, projectId, { spec: input.spec, route: input.route }) : null;
        const result = await draftBlueprint(input, { startedAt, onProgress: (e) => send({ type: "stage", ...e }) });
        const specSaved = specSave ? (await specSave).ok : null;

        // 저장이 실패해도 초안은 버리지 않는다(이미 AI 비용이 들었다). 오류 알림에 초안을 함께 담아 클라이언트가 다시 저장할 수 있게 한다
        let saved: Awaited<ReturnType<typeof createBlueprintRevision>> | null = null;
        if (result.ok && projectId) {
          send({ type: "stage", stage: "saving" });
          saved = await createBlueprintRevision(supabase, projectId, result.blueprint);
        }
        // 서버 로그에는 사용량과 결과만 남긴다. 이미지·응답 원문·키는 남기지 않는다
        console.log(
          JSON.stringify({
            event: "draft",
            userId,
            ok: result.ok,
            ...(result.ok ? {} : { kind: result.kind, upstreamStatus: result.upstreamStatus, errorName: result.errorName }),
            images: input.images.length,
            attempts: result.attempts,
            normalized: result.normalized.length,
            ...(saved ? { saved: saved.ok } : {}),
            ...(specSaved === null ? {} : { specSaved }),
            elapsedMs: result.elapsedMs,
            usage: result.usage,
            costUsd: result.costUsd,
          }),
        );

        if (!result.ok) {
          const e = toErrorResponse(result);
          return send({ type: "error", status: e.status, ...e.body });
        }
        if (saved && !saved.ok) {
          const e = dbFailureToHttp(saved);
          return send({ type: "error", status: e.status, ...e.body, blueprint: result.blueprint });
        }
        send({
          type: "done",
          blueprint: result.blueprint,
          meta: { attempts: result.attempts, elapsedMs: result.elapsedMs, normalized: result.normalized, ...(saved?.ok ? { saved: saved.data } : {}) },
        });
      } catch (e) {
        logFailure(e);
        const err = internalError();
        send({ type: "error", status: err.status, ...err.body });
      }
    }, internalError);
  } catch (e) {
    logFailure(e);
    return respond(internalError());
  }
}
