import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../supabase/server";
import { draftBlueprint, type DraftResult } from "./draft-blueprint";
import { handleDraftRequest } from "./draft-handler";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./draft-blueprint", () => ({ draftBlueprint: vi.fn() }));

const getClaims = vi.fn();
const draft = vi.mocked(draftBlueprint);

const STACK = { framework: "next", styling: "css-modules", architecture: "fsd" };
const form = (over: { stack?: unknown; spec?: unknown } = { spec: { overview: "상품 상세" } }) => {
  const f = new FormData();
  f.set("stack", JSON.stringify("stack" in over ? over.stack : STACK));
  if (over.spec !== undefined) f.set("spec", JSON.stringify(over.spec));
  return new Request("http://localhost/api/draft", { method: "POST", body: f });
};

const shared = { attempts: 1, elapsedMs: 1200, usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 0 }, costUsd: 0.0001, log: [{ ms: 1, usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 }, rawText: "RAW-MODEL-OUTPUT" }] };
const ok = { ok: true, blueprint: { title: "상품 상세" }, ...shared } as unknown as DraftResult;
const failure = (kind: string, extra: object = {}) => ({ ok: false, kind, upstreamStatus: 500, errorName: "InternalServerError", ...shared, ...extra }) as unknown as DraftResult;

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue({ auth: { getClaims } } as never);
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  draft.mockReset();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("handleDraftRequest", () => {
  it("세션이 없으면 401이고 초안 생성은 호출하지 않는다", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "no session" } });
    const res = await handleDraftRequest(form());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(draft).not.toHaveBeenCalled();
  });

  it("claims가 비어 있어도 401", async () => {
    getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    expect((await handleDraftRequest(form())).status).toBe(401);
    expect(draft).not.toHaveBeenCalled();
  });

  it("세션 확인은 요청 본문을 읽기 전에 한다(401이면 본문을 파싱하지 않음)", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "x" } });
    const res = await handleDraftRequest(new Request("http://localhost/api/draft", { method: "POST", body: "not multipart" }));
    expect(res.status).toBe(401);
  });

  it("입력이 잘못되면 400이고 초안 생성은 호출하지 않는다", async () => {
    const res = await handleDraftRequest(form({ spec: {} }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_input");
    expect(draft).not.toHaveBeenCalled();
  });

  it("성공하면 200에 blueprint와 meta만 담는다(비용·사용량·원문은 제외)", async () => {
    draft.mockResolvedValue(ok);
    const res = await handleDraftRequest(form());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ blueprint: { title: "상품 상세" }, meta: { attempts: 1, elapsedMs: 1200 } });
    expect(JSON.stringify(body)).not.toContain("RAW-MODEL-OUTPUT");
  });

  it("마감 계산의 기준 시각(startedAt)을 요청 시작 시점으로 넘긴다", async () => {
    draft.mockResolvedValue(ok);
    const before = Date.now();
    await handleDraftRequest(form());
    const options = draft.mock.calls[0][1];
    expect(options?.startedAt).toBeGreaterThanOrEqual(before);
    expect(options?.startedAt).toBeLessThanOrEqual(Date.now());
  });

  it.each([
    ["invalid_output", 422, "invalid_output"],
    ["rate_limited", 429, "ai_rate_limited"],
    ["upstream", 502, "ai_unavailable"],
    ["timeout", 504, "ai_timeout"],
  ])("%s → %i %s", async (kind, status, code) => {
    draft.mockResolvedValue(failure(kind, { fields: [{ path: "nodes.2.order", message: "겹칩니다" }] }));
    const res = await handleDraftRequest(form());
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBe(code);
    expect(body.error.retryable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("InternalServerError"); // 내부 오류 이름은 응답에 없다
  });

  it("초안 생성이나 세션 클라이언트에서 예외가 나면 500이고 원본 문구를 노출하지 않는다", async () => {
    draft.mockRejectedValue(new Error("Incorrect API key provided: sk-secret-12345"));
    let res = await handleDraftRequest(form());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("sk-secret");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("sk-secret-12345"); // 서버 로그에서도 키 형태는 가린다

    vi.mocked(createClient).mockRejectedValue(new Error("env missing"));
    res = await handleDraftRequest(form());
    expect(res.status).toBe(500);
  });

  it("서버 로그에는 사용자 id·결과·사용량만 남기고 이미지·원문은 남기지 않는다", async () => {
    draft.mockResolvedValue(ok);
    await handleDraftRequest(form());
    const line = String(logSpy.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({ event: "draft", userId: "user-1", ok: true, attempts: 1, costUsd: 0.0001 });
    expect(line).not.toContain("RAW-MODEL-OUTPUT");
    expect(line).not.toContain("base64");
  });
});
