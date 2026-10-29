import { BlueprintSchema } from "../../core/schema/blueprint";
import { SpecInputSchema } from "../../core/schema/spec-input";
import type { DraftImage, DraftInput, DraftResult, Field } from "./draft-blueprint";

// Vercel 함수 요청 본문 한도가 4.5MB라, 그보다 먼저 우리 형식으로 거절하는 합계 한도
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 3;
export const MAX_SPEC_CHARS = 20_000; // 스펙 텍스트 7개 항목 합계(프롬프트 비용 보호)
const MAX_ORIGINAL_WIDTH = 20_000;

export type ErrorBody = { error: { code: string; message: string; retryable: boolean; fields?: Field[] } };
export type HttpError = { status: 400 | 401 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503 | 504; body: ErrorBody };

export const httpError = (status: HttpError["status"], code: string, message: string, retryable: boolean, fields?: Field[]): HttpError => ({
  status,
  body: { error: { code, message, retryable, ...(fields ? { fields } : {}) } },
});

export const unauthorized = () => httpError(401, "unauthorized", "로그인이 필요합니다.", false);
export const internalError = () => httpError(500, "internal_error", "서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.", true);

/** 서버·OpenAI의 원본 오류 문구는 담지 않고 사용자용 메시지만 돌려준다 */
export function toErrorResponse(r: Extract<DraftResult, { ok: false }>): HttpError {
  switch (r.kind) {
    case "invalid_output":
      return httpError(
        422,
        "invalid_output",
        r.retrySkipped
          ? "AI가 만든 설계도가 규칙을 통과하지 못했고, 시간이 부족해 자동 수정은 건너뛰었습니다. 다시 시도해 주세요."
          : "AI가 만든 설계도가 규칙을 통과하지 못했습니다. 다시 시도해 주세요.",
        true,
        r.fields,
      );
    case "rate_limited":
      return httpError(429, "ai_rate_limited", "요청이 많아 AI가 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
    case "timeout":
      return httpError(504, "ai_timeout", "AI 응답이 제한 시간 안에 오지 않았습니다. 다시 시도해 주세요.", true);
    case "upstream":
      return httpError(502, "ai_unavailable", "AI 서비스에 문제가 있어 초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
  }
}

const bad = (message: string, fields?: Field[]) => ({ ok: false as const, error: httpError(400, "invalid_input", message, false, fields) });
const tooLarge = () => ({
  ok: false as const,
  error: httpError(413, "payload_too_large", "이미지가 너무 큽니다. 합계 4MB 이하로 줄여서 다시 보내 주세요.", false),
});
const issuesToFields = (prefix: string, issues: { path: PropertyKey[]; message: string }[]): Field[] =>
  issues.slice(0, 10).map((i) => ({ path: [prefix, ...i.path].map(String).join("."), message: i.message }));

function readJson(value: FormDataEntryValue | null): { ok: true; value: unknown } | { ok: false } {
  if (typeof value !== "string") return { ok: false };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

// 클라이언트가 말한 content-type을 믿지 않고 파일 시그니처로 형식을 정한다
function sniffImage(b: Uint8Array): DraftImage["mediaType"] | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length > 8 && b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

// projectId가 있으면 스택은 프로젝트에 저장된 값을 쓰므로 요청의 stack은 읽지 않고 null로 둔다(호출하는 쪽이 채운다)
export type ParsedDraftInput = Omit<DraftInput, "stack"> & { stack: DraftInput["stack"] | null };
export type ParsedDraft = { ok: true; input: ParsedDraftInput; projectId: string | null } | { ok: false; error: HttpError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** multipart/form-data: projectId(선택, uuid), stack(JSON, projectId가 없을 때만 필요), route(선택), spec(JSON, 선택), images(0~3개), imageMeta(JSON 배열, 선택) */
export async function parseDraftRequest(request: Request): Promise<ParsedDraft> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return tooLarge();
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return bad("multipart/form-data 형식으로 보내야 합니다.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("요청 본문을 읽을 수 없습니다.");
  }

  const rawProjectId = form.get("projectId");
  if (rawProjectId !== null && (typeof rawProjectId !== "string" || !UUID.test(rawProjectId))) return bad("projectId는 uuid 형식이어야 합니다.");
  const projectId = rawProjectId;

  let stackValue: ParsedDraftInput["stack"] = null;
  if (projectId === null) {
    const stackJson = readJson(form.get("stack"));
    if (!stackJson.ok) return bad("stack은 JSON 문자열이어야 합니다.");
    const stack = BlueprintSchema.shape.stack.safeParse(stackJson.value);
    if (!stack.success) return bad("stack 값이 올바르지 않습니다.", issuesToFields("stack", stack.error.issues));
    stackValue = stack.data;
  }

  const rawRoute = form.get("route");
  if (rawRoute !== null && typeof rawRoute !== "string") return bad("route는 문자열이어야 합니다.");
  const route = rawRoute ? rawRoute : null;
  if (route !== null && !/^\/\S{0,199}$/.test(route)) return bad("route는 /로 시작하는 공백 없는 경로(200자 이하)여야 합니다.");

  const rawSpec = form.get("spec");
  const specJson = rawSpec === null ? { ok: true as const, value: {} } : readJson(rawSpec);
  if (!specJson.ok || typeof specJson.value !== "object" || specJson.value === null || Array.isArray(specJson.value)) {
    return bad("spec은 JSON 객체 문자열이어야 합니다.");
  }
  const specObj = specJson.value as Record<string, unknown>;

  const entries = form.getAll("images");
  if (entries.some((e) => typeof e === "string")) return bad("images는 파일이어야 합니다.");
  const files = entries as File[];
  if (files.length > MAX_IMAGES) return bad(`이미지는 최대 ${MAX_IMAGES}장까지 보낼 수 있습니다.`);
  if (files.some((f) => f.size > MAX_IMAGE_BYTES) || files.reduce((sum, f) => sum + f.size, 0) > MAX_BODY_BYTES) return tooLarge();

  const metaJson = form.get("imageMeta") === null ? { ok: true as const, value: [] } : readJson(form.get("imageMeta"));
  if (!metaJson.ok || !Array.isArray(metaJson.value) || metaJson.value.length > files.length) {
    return bad("imageMeta는 이미지 수 이하 길이의 JSON 배열이어야 합니다.");
  }
  const widths: (number | undefined)[] = [];
  for (const m of metaJson.value) {
    const w = typeof m === "object" && m !== null ? (m as { originalWidth?: unknown }).originalWidth : undefined;
    if (w !== undefined && !(Number.isInteger(w) && (w as number) > 0 && (w as number) <= MAX_ORIGINAL_WIDTH)) {
      return bad("originalWidth는 1~20000 사이의 정수여야 합니다.");
    }
    widths.push(w as number | undefined);
  }

  const images: DraftImage[] = [];
  for (const [i, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImage(bytes);
    if (!mediaType) return bad("이미지는 PNG, JPEG, WebP만 보낼 수 있습니다.");
    images.push({ mediaType, base64: Buffer.from(bytes).toString("base64"), ...(widths[i] ? { originalWidth: widths[i] } : {}) });
  }

  const spec = SpecInputSchema.safeParse({ ...specObj, version: "1.2", imageCount: images.length });
  if (!spec.success) return bad("스펙 항목을 1개 이상 입력하거나 이미지를 첨부해 주세요.", issuesToFields("spec", spec.error.issues));
  const specChars = Object.values(spec.data).reduce<number>((sum, v) => sum + (typeof v === "string" ? v.length : 0), 0);
  if (specChars > MAX_SPEC_CHARS) return bad(`스펙 텍스트는 합계 ${MAX_SPEC_CHARS}자 이하여야 합니다.`);

  return { ok: true, input: { spec: spec.data, stack: stackValue, route, images }, projectId };
}
