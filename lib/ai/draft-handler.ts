import "server-only";
import { createClient } from "../supabase/server";
import { draftBlueprint } from "./draft-blueprint";
import { internalError, parseDraftRequest, toErrorResponse, unauthorized, type HttpError } from "./draft-http";

const respond = (e: HttpError) => Response.json(e.body, { status: e.status });
const redact = (s: string) => s.replace(/sk-[A-Za-z0-9_\-*.]{6,}/g, "sk-***");

/** POST /api/draft 본문. 순서: 세션 확인(401) → 요청 검증(400·413) → 초안 생성 → 결과 매핑(422·429·502·504) */
export async function handleDraftRequest(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return respond(unauthorized());

    const parsed = await parseDraftRequest(request);
    if (!parsed.ok) return respond(parsed.error);

    const result = await draftBlueprint(parsed.input, { startedAt });
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
        elapsedMs: result.elapsedMs,
        usage: result.usage,
        costUsd: result.costUsd,
      }),
    );

    if (!result.ok) return respond(toErrorResponse(result));
    return Response.json({ blueprint: result.blueprint, meta: { attempts: result.attempts, elapsedMs: result.elapsedMs, normalized: result.normalized } });
  } catch (e) {
    console.error("draft route failed:", e instanceof Error ? `${e.name}: ${redact(e.message)}` : "unknown error");
    return respond(internalError());
  }
}
