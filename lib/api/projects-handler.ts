import "server-only";
import { createProject, listProjects } from "../db/projects";
import { dbFailureToHttp, invalidInput, readJson, respond } from "./http";
import { requireSession } from "./session";

/** GET /api/projects — 내 프로젝트 목록(최근 수정 순). 다른 사용자의 프로젝트는 RLS가 걸러낸다 */
export async function handleProjectsGet(): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const r = await listProjects(session.db);
  return r.ok ? Response.json({ projects: r.data }) : respond(dbFailureToHttp(r));
}

/** POST /api/projects — 본문 { name, stack }. user_id는 받지 않는다(DB가 로그인 세션으로 채운다) */
export async function handleProjectsPost(request: Request): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const body = await readJson(request);
  if (!body.ok) return respond(body.error);
  const input = body.value as { name?: unknown; stack?: unknown } | null;
  if (typeof input !== "object" || input === null || typeof input.name !== "string") return respond(invalidInput("name(문자열)과 stack이 필요합니다."));

  const r = await createProject(session.db, { name: input.name, stack: input.stack });
  return r.ok ? Response.json({ project: r.data }, { status: 201 }) : respond(dbFailureToHttp(r));
}
