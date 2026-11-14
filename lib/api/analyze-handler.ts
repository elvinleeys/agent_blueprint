import "server-only";
import { z } from "zod";
import { httpError } from "../ai/draft-http";
import { analyzeCode } from "../../core/cleanup/analyze";
import { checkLimits, describeLimitProblems, filterFiles } from "../../core/code-model/filter-files";
import { invalidInput, readJson, respond } from "./http";
import { requireSession } from "./session";

/** 코드 1MB + 디자인 시스템 파일 1MB + 스펙 JSON + JSON 이스케이프 여유. Vercel 요청 본문 한도(4.5MB) 안 */
export const ANALYZE_MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_SPEC_JSON_BYTES = 200 * 1024;

const FileList = z.array(z.object({ path: z.string().min(1).max(500), content: z.string() }).strict()).max(500);

const BodySchema = z
  .object({
    /** 검사할 코드 */
    codeFiles: FileList,
    // 디자인 시스템을 얻는 방법은 둘 중 하나: 디자인 시스템 파일 또는 스펙 JSON 텍스트
    designSystemFiles: FileList.optional(),
    specJson: z.string().max(MAX_SPEC_JSON_BYTES).optional(),
  })
  .strict();

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** 화면이 이미 거르지만 서버도 같은 규칙으로 거르고 상한을 다시 검사한다(화면을 거치지 않은 요청 방어). 파일 묶음마다 따로 센다 */
function prepare(files: { path: string; content: string }[], label: string) {
  const { accepted } = filterFiles(files.map((f) => ({ ...f, size: byteLength(f.content) })));
  const problems = checkLimits(accepted);
  if (problems.length) return { error: httpError(413, "payload_too_large", `${label}: ${describeLimitProblems(problems)}`, false) };
  if (accepted.length === 0) return { error: invalidInput(`${label}: 분석할 .ts·.tsx 파일이 없습니다.`) };
  return { files: accepted.map(({ path, content }) => ({ path, content })) };
}

/**
 * POST /api/analyze — 올린 .ts/.tsx 파일을 분석해 디자인 시스템과 비교한 결과를 돌려준다.
 * 코드 원본은 이 요청 안에서만 쓰고 저장하지 않으며 로그에도 남기지 않는다. AI를 부르지 않는다.
 */
export async function handleAnalyzePost(request: Request): Promise<Response> {
  const session = await requireSession();
  if (!session.ok) return session.response;

  const body = await readJson(request, ANALYZE_MAX_BODY_BYTES);
  if (!body.ok) return respond(body.error);
  const parsed = BodySchema.safeParse(body.value);
  if (!parsed.success) return respond(invalidInput("요청 형식이 올바르지 않습니다. { codeFiles, designSystemFiles 또는 specJson } 형식이어야 합니다."));
  const { codeFiles, designSystemFiles, specJson } = parsed.data;
  if ((designSystemFiles === undefined) === (specJson === undefined)) {
    return respond(invalidInput("디자인 시스템 파일(designSystemFiles)과 스펙 JSON(specJson) 중 하나만 보내야 합니다."));
  }

  const code = prepare(codeFiles, "검사할 코드");
  if (code.error) return respond(code.error);
  let designSystem: Parameters<typeof analyzeCode>[0]["designSystem"];
  if (designSystemFiles !== undefined) {
    const ds = prepare(designSystemFiles, "디자인 시스템");
    if (ds.error) return respond(ds.error);
    designSystem = { kind: "files", files: ds.files };
  } else {
    designSystem = { kind: "json", text: specJson! };
  }

  const outcome = analyzeCode({ code: code.files, designSystem });
  if (!outcome.ok) {
    const fields = outcome.details.map((d) => ({ path: outcome.reason === "spec_invalid" ? "specJson" : "designSystemFiles", message: d }));
    return respond(httpError(422, outcome.reason === "spec_invalid" ? "invalid_spec" : "no_official_components", outcome.message, false, fields.length ? fields : undefined));
  }
  return Response.json({ result: outcome.result });
}
