import "server-only";
import { z } from "zod";
import { httpError } from "../ai/draft-http";
import { analyzeFiles } from "../../core/cleanup/analyze";
import { checkLimits, describeLimitProblems, filterFiles } from "../../core/cleanup/filter-files";
import { invalidInput, readJson, respond } from "./http";
import { requireSession } from "./session";

/** 코드 1MB + JSON 이스케이프 여유 + 스펙 JSON. Vercel 요청 본문 한도(4.5MB) 안 */
export const ANALYZE_MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_SPEC_JSON_BYTES = 200 * 1024;

const BodySchema = z
  .object({
    files: z.array(z.object({ path: z.string().min(1).max(500), content: z.string() }).strict()).max(500),
    // 스펙을 얻는 방법은 둘 중 하나: 디자인 시스템 폴더 경로 또는 스펙 JSON 텍스트
    designSystemFolder: z.string().trim().min(1).max(300).optional(),
    specJson: z.string().max(MAX_SPEC_JSON_BYTES).optional(),
  })
  .strict();

const byteLength = (s: string) => new TextEncoder().encode(s).length;

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
  if (!parsed.success) return respond(invalidInput("요청 형식이 올바르지 않습니다. { files, designSystemFolder 또는 specJson } 중 하나의 스펙 입력이 필요합니다."));
  const { files, designSystemFolder, specJson } = parsed.data;
  if ((designSystemFolder === undefined) === (specJson === undefined)) {
    return respond(invalidInput("디자인 시스템 폴더(designSystemFolder)와 스펙 JSON(specJson) 중 하나만 보내야 합니다."));
  }

  // 화면이 이미 거르지만 서버도 같은 규칙으로 거르고 상한을 다시 검사한다(화면을 거치지 않은 요청 방어)
  const { accepted } = filterFiles(files.map((f) => ({ ...f, size: byteLength(f.content) })));
  const problems = checkLimits(accepted);
  if (problems.length) return respond(httpError(413, "payload_too_large", describeLimitProblems(problems), false));
  if (accepted.length === 0) return respond(invalidInput("분석할 .ts·.tsx 파일이 없습니다."));

  const outcome = analyzeFiles(
    accepted.map(({ path, content }) => ({ path, content })),
    designSystemFolder !== undefined ? { kind: "folder", folder: designSystemFolder } : { kind: "json", text: specJson! },
  );
  if (!outcome.ok) {
    const fields = outcome.details.map((d) => ({ path: "specJson", message: d }));
    return respond(httpError(422, outcome.reason === "spec_invalid" ? "invalid_spec" : "no_official_components", outcome.message, false, fields.length ? fields : undefined));
  }
  return Response.json({ result: outcome.result });
}
