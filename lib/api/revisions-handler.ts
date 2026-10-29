import "server-only";
import { createBlueprintRevision, listBlueprintRevisions } from "../db/blueprints";
import { dbFailureToHttp, parseProjectId, projectError, readJson, respond, type IdContext } from "./http";
import { requireSession } from "./session";

/** GET /api/projects/[id]/revisions — 판 목록(최신 순, nodes 제외 요약). 없거나 남의 프로젝트면 404 */
export async function handleRevisionsGet(_request: Request, ctx: IdContext): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;
  const id = await parseProjectId(ctx);
  if (!id.ok) return respond(id.error);

  const notFound = await projectError(session.db, id.id);
  if (notFound) return respond(notFound);

  const r = await listBlueprintRevisions(session.db, id.id);
  return r.ok ? Response.json({ revisions: r.data }) : respond(dbFailureToHttp(r));
}

/** POST /api/projects/[id]/revisions — 새 판 추가. 지시서 내보내기 시점에 쓴다(AI 초안은 /api/draft가 직접 추가) */
export async function handleRevisionsPost(request: Request, ctx: IdContext): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;
  const id = await parseProjectId(ctx);
  if (!id.ok) return respond(id.error);
  const body = await readJson(request);
  if (!body.ok) return respond(body.error);

  const r = await createBlueprintRevision(session.db, id.id, body.value);
  return r.ok ? Response.json(r.data, { status: 201 }) : respond(dbFailureToHttp(r));
}
