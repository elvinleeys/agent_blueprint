import "server-only";
import { z } from "zod";
import { httpError } from "../ai/draft-http";
import { buildExportPrompt, exportFileName, type ExportFormat } from "../../core/prompt/export-prompt";
import { checkBlueprint } from "../../core/rules/run";
import { loadBlueprint } from "../db/blueprints";
import { loadLatestBlueprintRef, loadLatestExportContent, savePromptExport } from "../db/prompt-exports";
import { loadSpecInput, saveSpecRoute } from "../db/spec-inputs";
import { dbFailureToHttp, parseProjectId, projectError, readJson, respond, invalidInput, type IdContext } from "./http";
import { requireSession } from "./session";

const FORMATS: ExportFormat[] = ["claude_md", "prompt"];
const BodySchema = z.object({ route: z.string().nullable().optional() }).strict();

/**
 * POST /api/projects/[id]/exports — 최신 판으로 화면 규칙 파일과 지시서를 만들어 기록하고 내용을 돌려준다.
 * 호출 전에 화면이 저장 큐를 비워야 한다(drain). 이 라우트는 DB에 저장된 최신 판만 쓴다.
 * 순서: 화면 주소 저장 → 최신 판 확인 → 판·스펙 읽기 → 형식마다 같은 내용이면 기록 건너뛰기, 아니면 그 판에 연결해 기록.
 * 기록으로 최신 판이 지시서와 연결되므로 이후 편집은 saveBlueprint가 새 판으로 저장한다.
 */
export async function handleExportsPost(request: Request, ctx: IdContext): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;
  const id = await parseProjectId(ctx);
  if (!id.ok) return respond(id.error);
  const body = await readJson(request);
  if (!body.ok) return respond(body.error);
  const parsed = BodySchema.safeParse(body.value);
  if (!parsed.success) return respond(invalidInput("요청 형식이 올바르지 않습니다. { route?: 문자열 또는 null }만 받습니다."));

  const notFound = await projectError(session.db, id.id);
  if (notFound) return respond(notFound);
  const { db } = session;

  // 1) 화면 주소(보낸 경우만) 저장. 형식이 틀리면 여기서 422로 끝나 지시서를 만들지 않는다
  if (parsed.data.route !== undefined) {
    const saved = await saveSpecRoute(db, id.id, parsed.data.route);
    if (!saved.ok) return respond(dbFailureToHttp(saved));
  }

  // 2) 최신 판(id·번호)과 그 판의 설계도, 저장된 스펙·주소
  const ref = await loadLatestBlueprintRef(db, id.id);
  if (!ref.ok) return respond(dbFailureToHttp(ref));
  if (!ref.data) return respond(httpError(404, "not_found", "내보낼 설계도가 없습니다. 먼저 구조 설계를 만들어 주세요.", false));
  const blueprint = await loadBlueprint(db, id.id, { revision: ref.data.revision });
  if (!blueprint.ok) return respond(dbFailureToHttp(blueprint, "stored"));
  if (!blueprint.data) return respond(httpError(404, "not_found", "내보낼 설계도가 없습니다.", false));
  const spec = await loadSpecInput(db, id.id);
  if (!spec.ok) return respond(dbFailureToHttp(spec, "stored"));

  // 3) 두 문서 생성(템플릿만, AI 호출 없음). 루트가 하나가 아니면 만들 수 없다
  const input = { blueprint: blueprint.data, spec: spec.data?.spec ?? {}, route: spec.data?.route ?? null, violations: checkBlueprint(blueprint.data) };
  let contents: Record<ExportFormat, string>;
  try {
    contents = { claude_md: buildExportPrompt({ ...input, format: "claude_md" }), prompt: buildExportPrompt({ ...input, format: "prompt" }) };
  } catch {
    return respond(httpError(422, "invalid_data", "루트가 하나인 설계도만 지시서로 만들 수 있습니다.", false));
  }

  // 4) 기록: 같은 판·같은 형식의 가장 최근 기록과 내용이 같으면 건너뛴다(복사·내려받기는 이 라우트와 무관하게 몇 번이든 가능)
  const documents = [];
  for (const format of FORMATS) {
    const content = contents[format];
    const last = await loadLatestExportContent(db, ref.data.id, format);
    if (!last.ok) return respond(dbFailureToHttp(last));
    const skipped = last.data === content;
    if (!skipped) {
      const saved = await savePromptExport(db, id.id, { blueprintId: ref.data.id, format, content });
      if (!saved.ok) return respond(dbFailureToHttp(saved));
    }
    documents.push({ format, fileName: exportFileName(blueprint.data, format), content, recorded: !skipped });
  }
  return Response.json({ revision: ref.data.revision, documents });
}
