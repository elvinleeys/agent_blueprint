import "server-only";
import { loadBlueprint, saveBlueprint } from "../db/blueprints";
import { dbFailureToHttp, invalidInput, parseProjectId, projectError, readJson, respond, type IdContext } from "./http";
import { requireSession } from "./session";

/** GET /api/projects/[id]/blueprint?revision=N — revision을 생략하면 최신 판. 내 프로젝트인데 판이 없으면 { blueprint: null }, 없거나 남의 프로젝트면 404 */
export async function handleBlueprintGet(request: Request, ctx: IdContext): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;
  const id = await parseProjectId(ctx);
  if (!id.ok) return respond(id.error);

  const raw = new URL(request.url).searchParams.get("revision");
  if (raw !== null && !/^[1-9]\d{0,8}$/.test(raw)) return respond(invalidInput("revision은 1 이상의 정수여야 합니다."));

  const notFound = await projectError(session.db, id.id);
  if (notFound) return respond(notFound);

  const r = await loadBlueprint(session.db, id.id, raw === null ? {} : { revision: Number(raw) });
  // 여기서의 invalid_data는 DB에서 읽은 값이 스키마에 맞지 않는 경우다
  return r.ok ? Response.json({ blueprint: r.data }) : respond(dbFailureToHttp(r, "stored"));
}

/** PUT /api/projects/[id]/blueprint — 편집 중 자동 저장. 최신 판을 갱신한다(AI 초안 판이면 새 판, lib/db 규칙) */
export async function handleBlueprintPut(request: Request, ctx: IdContext): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;
  const id = await parseProjectId(ctx);
  if (!id.ok) return respond(id.error);
  const body = await readJson(request);
  if (!body.ok) return respond(body.error);

  const r = await saveBlueprint(session.db, id.id, body.value);
  return r.ok ? Response.json(r.data) : respond(dbFailureToHttp(r));
}
