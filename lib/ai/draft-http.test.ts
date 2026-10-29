import { describe, expect, it } from "vitest";
import type { DraftFailureKind, DraftResult } from "./draft-blueprint";
import { internalError, MAX_BODY_BYTES, parseDraftRequest, toErrorResponse, unauthorized } from "./draft-http";

const STACK = { framework: "next", styling: "css-modules", architecture: "fsd" };
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

const png = (extra = 0) => new File([new Uint8Array([...PNG, ...new Array(extra).fill(0)])], "w.png", { type: "image/png" });

type Fields = { stack?: unknown; route?: string; spec?: unknown; images?: File[]; imageMeta?: unknown };
function request(fields: Fields, headers: Record<string, string> = {}) {
  const { route, spec, images = [], imageMeta } = fields;
  const stack = "stack" in fields ? fields.stack : STACK; // stack: undefined를 넘기면 필드 자체를 뺀다
  const form = new FormData();
  if (stack !== undefined) form.set("stack", JSON.stringify(stack));
  if (route !== undefined) form.set("route", route);
  if (spec !== undefined) form.set("spec", JSON.stringify(spec));
  if (imageMeta !== undefined) form.set("imageMeta", JSON.stringify(imageMeta));
  images.forEach((f) => form.append("images", f));
  return new Request("http://localhost/api/draft", { method: "POST", body: form, headers });
}

async function expectError(promise: ReturnType<typeof parseDraftRequest>, status: number, code: string) {
  const r = await promise;
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.error.status).toBe(status);
  expect(r.error.body.error.code).toBe(code);
  return r.error.body.error;
}

describe("parseDraftRequest — 성공", () => {
  it("텍스트만: stack·route·spec을 읽고 imageCount는 파일 수로 정한다", async () => {
    const r = await parseDraftRequest(request({ route: "/products/[id]", spec: { overview: "상품 상세", imageCount: 3, version: "9" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.stack).toEqual(STACK);
    expect(r.input.route).toBe("/products/[id]");
    expect(r.input.images).toEqual([]);
    expect(r.input.spec).toMatchObject({ version: "1.2", imageCount: 0, overview: "상품 상세" }); // 클라이언트가 보낸 값은 무시
  });

  it("route를 생략하면 null이다", async () => {
    const r = await parseDraftRequest(request({ spec: { overview: "x" } }));
    expect(r.ok && r.input.route).toBe(null);
  });

  it("이미지만: 시그니처로 형식을 정하고 base64와 원본 가로를 이미지 순서대로 붙인다", async () => {
    const r = await parseDraftRequest(request({ images: [png(), png(4)], imageMeta: [{ originalWidth: 1920 }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.spec.imageCount).toBe(2);
    expect(r.input.images[0]).toEqual({ mediaType: "image/png", base64: Buffer.from(PNG).toString("base64"), originalWidth: 1920 });
    expect(r.input.images[1].originalWidth).toBeUndefined();
  });

  it("JPEG·WebP 시그니처도 받는다", async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], "a.jpg");
    const webp = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56])], "a.webp");
    const r = await parseDraftRequest(request({ images: [jpeg, webp] }));
    expect(r.ok && r.input.images.map((i) => i.mediaType)).toEqual(["image/jpeg", "image/webp"]);
  });
});

describe("parseDraftRequest — 400", () => {
  it("입력이 하나도 없으면 400", async () => {
    await expectError(parseDraftRequest(request({ spec: {} })), 400, "invalid_input");
    await expectError(parseDraftRequest(request({ spec: { overview: "   " } })), 400, "invalid_input");
  });

  it("multipart가 아니면 400", async () => {
    const req = new Request("http://localhost/api/draft", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    await expectError(parseDraftRequest(req), 400, "invalid_input");
  });

  it("stack이 없거나 잘못되면 400이고 원인 경로를 알려 준다", async () => {
    await expectError(parseDraftRequest(request({ stack: undefined, spec: { overview: "x" } })), 400, "invalid_input");
    const e = await expectError(parseDraftRequest(request({ stack: { ...STACK, framework: "vue" }, spec: { overview: "x" } })), 400, "invalid_input");
    expect(e?.fields?.[0].path).toBe("stack.framework");
  });

  it("route 형식 위반은 400", async () => {
    await expectError(parseDraftRequest(request({ route: "products", spec: { overview: "x" } })), 400, "invalid_input");
    await expectError(parseDraftRequest(request({ route: "/a b", spec: { overview: "x" } })), 400, "invalid_input");
  });

  it("spec이 객체가 아니거나 항목 타입이 틀리면 400", async () => {
    await expectError(parseDraftRequest(request({ spec: [1] })), 400, "invalid_input");
    await expectError(parseDraftRequest(request({ spec: { overview: 5 } })), 400, "invalid_input");
  });

  it("스펙 텍스트 합계가 한도를 넘으면 400", async () => {
    await expectError(parseDraftRequest(request({ spec: { overview: "가".repeat(20_001) } })), 400, "invalid_input");
  });

  it("이미지 4장 이상은 400", async () => {
    await expectError(parseDraftRequest(request({ images: [png(), png(), png(), png()] })), 400, "invalid_input");
  });

  it("content-type이 image/png여도 시그니처가 다르면 400", async () => {
    const fake = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0, 0])], "a.png", { type: "image/png" });
    await expectError(parseDraftRequest(request({ images: [fake] })), 400, "invalid_input");
  });

  it("images에 문자열을 보내면 400", async () => {
    const form = new FormData();
    form.set("stack", JSON.stringify(STACK));
    form.append("images", "not a file");
    await expectError(parseDraftRequest(new Request("http://localhost/api/draft", { method: "POST", body: form })), 400, "invalid_input");
  });

  it.each([[[{ originalWidth: -1 }]], [[{ originalWidth: 1.5 }]], [[{ originalWidth: 20_001 }]], [[{}, {}]], ["x"]])(
    "imageMeta가 올바르지 않으면 400: %j",
    async (imageMeta) => {
      await expectError(parseDraftRequest(request({ images: [png()], imageMeta })), 400, "invalid_input");
    },
  );
});

describe("parseDraftRequest — 413", () => {
  it("content-length가 4MB를 넘으면 본문을 읽기 전에 413", async () => {
    const req = request({ spec: { overview: "x" } }, { "content-length": String(MAX_BODY_BYTES + 1) });
    await expectError(parseDraftRequest(req), 413, "payload_too_large");
  });

  it("content-length가 없어도 이미지 합계가 4MB를 넘으면 413", async () => {
    await expectError(parseDraftRequest(request({ images: [png(2_200_000), png(2_200_000)] })), 413, "payload_too_large");
  });

  it("합계가 4MB 이하면 통과한다", async () => {
    const r = await parseDraftRequest(request({ images: [png(1_000_000), png(1_000_000), png(1_000_000)] }));
    expect(r.ok).toBe(true);
  });
});

describe("toErrorResponse", () => {
  const failure = (kind: DraftFailureKind, extra: object = {}) =>
    ({
      ok: false,
      kind,
      attempts: 1,
      elapsedMs: 1,
      usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      costUsd: 0,
      log: [],
      upstreamStatus: 401,
      errorName: "AuthenticationError",
      ...extra,
    }) as Extract<DraftResult, { ok: false }>;

  it.each([
    ["invalid_output", 422, "invalid_output"],
    ["rate_limited", 429, "ai_rate_limited"],
    ["upstream", 502, "ai_unavailable"],
    ["timeout", 504, "ai_timeout"],
  ] as const)("%s → %i %s, 다시 시도 가능", (kind, status, code) => {
    const e = toErrorResponse(failure(kind));
    expect(e.status).toBe(status);
    expect(e.body.error.code).toBe(code);
    expect(e.body.error.retryable).toBe(true);
    expect(e.body.error.message).toMatch(/[가-힣]/);
  });

  it("422에는 실패 항목을 담고, 재시도를 생략했으면 그 사실을 알린다", () => {
    const fields = [{ path: "nodes.2.order", message: "겹칩니다" }];
    const normal = toErrorResponse(failure("invalid_output", { fields }));
    expect(normal.body.error.fields).toEqual(fields);
    expect(toErrorResponse(failure("invalid_output", { fields, retrySkipped: true })).body.error.message).toContain("시간이 부족");
  });

  it("OpenAI 상태 코드·오류 이름 같은 내부 정보는 본문에 담지 않는다", () => {
    const text = JSON.stringify(toErrorResponse(failure("upstream")).body);
    expect(text).not.toContain("401");
    expect(text).not.toContain("AuthenticationError");
  });

  it("401·500 응답 형태", () => {
    expect(unauthorized()).toMatchObject({ status: 401, body: { error: { code: "unauthorized", retryable: false } } });
    expect(internalError()).toMatchObject({ status: 500, body: { error: { code: "internal_error", retryable: true } } });
  });
});
