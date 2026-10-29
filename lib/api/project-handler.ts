import "server-only";
import { renameProject } from "../db/projects";
import { dbFailureToHttp, invalidInput, parseProjectId, readJson, respond, type IdContext } from "./http";
import { requireSession } from "./session";

/** PATCH /api/projects/[id] — 본문 { name }만 받는다. 스택은 바꿀 수 없다 */
export async function handleProjectPatch(request: Request, ctx: IdContext): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;
  const id = await parseProjectId(ctx);
  if (!id.ok) return respond(id.error);
  const body = await readJson(request);
  if (!body.ok) return respond(body.error);

  const input = body.value;
  const keys = typeof input === "object" && input !== null && !Array.isArray(input) ? Object.keys(input) : [];
  if (keys.length !== 1 || keys[0] !== "name" || typeof (input as { name: unknown }).name !== "string") return respond(invalidInput("{ name }(문자열)만 보낼 수 있습니다."));

  const r = await renameProject(session.db, id.id, (input as { name: string }).name);
  return r.ok ? Response.json({ project: r.data }) : respond(dbFailureToHttp(r));
}
