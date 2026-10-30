import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlueprintRevision } from "../db/blueprints";
import { getProject } from "../db/projects";
import { saveSpecInput } from "../db/spec-inputs";
import { createClient } from "../supabase/server";
import { draftBlueprint, type DraftResult } from "./draft-blueprint";
import { handleDraftRequest } from "./draft-handler";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./draft-blueprint", () => ({ draftBlueprint: vi.fn() }));
vi.mock("../db/projects", () => ({ getProject: vi.fn() }));
vi.mock("../db/blueprints", () => ({ createBlueprintRevision: vi.fn() }));
vi.mock("../db/spec-inputs", () => ({ saveSpecInput: vi.fn() }));

const getClaims = vi.fn();
const draft = vi.mocked(draftBlueprint);

const STACK = { framework: "next", styling: "css-modules", architecture: "fsd" };
const form = (over: { stack?: unknown; spec?: unknown } = { spec: { overview: "상품 상세" } }) => {
  const f = new FormData();
  f.set("stack", JSON.stringify("stack" in over ? over.stack : STACK));
  if (over.spec !== undefined) f.set("spec", JSON.stringify(over.spec));
  return new Request("http://localhost/api/draft", { method: "POST", body: f });
};

const change = { nodeId: "n-page", path: "layout.direction", detail: "grid에는 direction을 쓸 수 없어 제거(값: column)" };
const shared = { attempts: 1, elapsedMs: 1200, usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 0 }, costUsd: 0.0001, log: [{ ms: 1, usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0 }, rawText: "RAW-MODEL-OUTPUT" }] };
const ok = { ok: true, blueprint: { title: "상품 상세" }, normalized: [change], ...shared } as unknown as DraftResult;
const failure = (kind: string, extra: object = {}) => ({ ok: false, kind, normalized: [], upstreamStatus: 500, errorName: "InternalServerError", ...shared, ...extra }) as unknown as DraftResult;

// 스트림 응답을 줄 단위 JSON으로 읽는다
const lines = async (res: Response): Promise<any[]> => // eslint-disable-line @typescript-eslint/no-explicit-any -- 테스트용
  (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
const lastOf = async (res: Response) => (await lines(res)).at(-1);

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue({ auth: { getClaims } } as never);
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
  draft.mockReset();
  vi.mocked(getProject).mockReset();
  vi.mocked(createBlueprintRevision).mockReset();
  vi.mocked(saveSpecInput).mockReset();
  vi.mocked(saveSpecInput).mockResolvedValue({ ok: true, data: null });
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

  it("본문이 4MB를 넘으면 413이고 초안 생성은 호출하지 않는다", async () => {
    const f = new FormData();
    f.set("stack", JSON.stringify(STACK));
    f.set("images", new File([new Uint8Array(4_200_000)], "a.png", { type: "image/png" }));
    const res = await handleDraftRequest(new Request("http://localhost/api/draft", { method: "POST", body: f, headers: { "content-length": "4200500" } }));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
    expect(draft).not.toHaveBeenCalled();
  });

  it("성공하면 200 NDJSON 스트림: accepted로 시작해 done(blueprint와 meta)으로 끝난다(비용·사용량·원문은 제외)", async () => {
    draft.mockResolvedValue(ok);
    const res = await handleDraftRequest(form());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    const msgs = await lines(res);
    expect(msgs[0]).toEqual({ type: "stage", stage: "accepted" });
    expect(msgs.at(-1)).toEqual({ type: "done", blueprint: { title: "상품 상세" }, meta: { attempts: 1, elapsedMs: 1200, normalized: [change] } });
    expect(JSON.stringify(msgs)).not.toContain("RAW-MODEL-OUTPUT");
  });

  it("draftBlueprint의 단계 알림을 순서대로 stage 줄로 보낸다(보정·재시도 포함, projectId가 없으면 saving 없음)", async () => {
    draft.mockImplementation(async (_i, o) => {
      o?.onProgress?.({ stage: "generating", attempt: 1 });
      o?.onProgress?.({ stage: "validating", attempt: 1 });
      o?.onProgress?.({ stage: "normalizing", changes: 1 });
      o?.onProgress?.({ stage: "regenerating", attempt: 2 });
      o?.onProgress?.({ stage: "validating", attempt: 2 });
      return ok;
    });
    const msgs = await lines(await handleDraftRequest(form()));
    expect(msgs.map((m) => (m.type === "stage" ? m.stage : m.type))).toEqual([
      "accepted", "generating", "validating", "normalizing", "regenerating", "validating", "done",
    ]);
    expect(msgs[1]).toEqual({ type: "stage", stage: "generating", attempt: 1 });
    expect(msgs[3]).toEqual({ type: "stage", stage: "normalizing", changes: 1 });
  });

  it("마감 계산의 기준 시각(startedAt)을 요청 시작 시점으로 넘긴다", async () => {
    draft.mockResolvedValue(ok);
    const before = Date.now();
    await lines(await handleDraftRequest(form()));
    const options = draft.mock.calls[0][1];
    expect(options?.startedAt).toBeGreaterThanOrEqual(before);
    expect(options?.startedAt).toBeLessThanOrEqual(Date.now());
  });

  it.each([
    ["invalid_output", 422, "invalid_output"],
    ["rate_limited", 429, "ai_rate_limited"],
    ["upstream", 502, "ai_unavailable"],
    ["timeout", 504, "ai_timeout"],
  ])("%s → 스트림 error 알림(status %i, %s)", async (kind, status, code) => {
    draft.mockResolvedValue(failure(kind, { fields: [{ path: "nodes.2.order", message: "겹칩니다" }] }));
    const res = await handleDraftRequest(form());
    expect(res.status).toBe(200); // 스트림이 시작된 뒤의 오류는 알림으로 보낸다
    const msgs = await lines(res);
    const last = msgs.at(-1);
    expect(last.type).toBe("error");
    expect(last.status).toBe(status);
    expect(last.error.code).toBe(code);
    expect(last.error.retryable).toBe(true);
    if (kind === "invalid_output") expect(last.error.fields).toEqual([{ path: "nodes.2.order", message: "겹칩니다" }]);
    expect(msgs.some((m) => m.type === "done")).toBe(false);
    expect(JSON.stringify(msgs)).not.toContain("InternalServerError"); // 내부 오류 이름은 응답에 없다
  });

  it("초안 생성이나 세션 클라이언트에서 예외가 나면 500이고 원본 문구를 노출하지 않는다", async () => {
    draft.mockRejectedValue(new Error("Incorrect API key provided: sk-secret-12345"));
    let res = await handleDraftRequest(form());
    const msgs = await lines(res); // 스트림 시작 후의 예외는 error 알림(500)
    expect(msgs.at(-1)).toMatchObject({ type: "error", status: 500, error: { code: "internal_error" } });
    expect(JSON.stringify(msgs)).not.toContain("sk-secret");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("sk-secret-12345"); // 서버 로그에서도 키 형태는 가린다

    vi.mocked(createClient).mockRejectedValue(new Error("env missing"));
    res = await handleDraftRequest(form());
    expect(res.status).toBe(500);
  });

  it("서버 로그에는 사용자 id·결과·사용량만 남기고 이미지·원문은 남기지 않는다", async () => {
    draft.mockResolvedValue(ok);
    await lines(await handleDraftRequest(form()));
    const line = String(logSpy.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({ event: "draft", userId: "user-1", ok: true, attempts: 1, normalized: 1, costUsd: 0.0001 });
    expect(line).not.toContain("RAW-MODEL-OUTPUT");
    expect(line).not.toContain("base64");
  });
});

describe("handleDraftRequest — projectId(프로젝트에 새 판으로 저장)", () => {
  const PID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
  const PROJECT_STACK = { framework: "react", styling: "css", architecture: "type-based" } as const;
  const project = { id: PID, name: "p", stack: PROJECT_STACK, createdAt: "c", updatedAt: "u" };
  const withProject = (requestStack: unknown = STACK) => {
    const f = new FormData();
    f.set("projectId", PID);
    if (requestStack !== undefined) f.set("stack", JSON.stringify(requestStack));
    f.set("spec", JSON.stringify({ overview: "상품 상세" }));
    return new Request("http://localhost/api/draft", { method: "POST", body: f });
  };

  beforeEach(() => {
    vi.mocked(getProject).mockResolvedValue({ ok: true, data: project });
  });

  it("성공하면 saving 알림 뒤 새 판으로 저장하고 done의 meta.saved에 판 번호를 담는다", async () => {
    draft.mockResolvedValue(ok);
    vi.mocked(createBlueprintRevision).mockResolvedValue({ ok: true, data: { revision: 4, updatedAt: "t" } });
    const res = await handleDraftRequest(withProject());
    expect(res.status).toBe(200);
    const msgs = await lines(res);
    expect(msgs.map((m) => (m.type === "stage" ? m.stage : m.type))).toEqual(["accepted", "saving", "done"]);
    const body = msgs.at(-1);
    expect(body.meta).toMatchObject({ attempts: 1, saved: { revision: 4, updatedAt: "t" } });
    expect(createBlueprintRevision).toHaveBeenCalledWith(expect.anything(), PID, { title: "상품 상세" });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({ saved: true });
  });

  it("스펙 입력(7개 항목·화면 주소·이미지 수)을 프로젝트에 저장한다. 저장이 실패해도 초안은 계속된다", async () => {
    draft.mockResolvedValue(ok);
    vi.mocked(createBlueprintRevision).mockResolvedValue({ ok: true, data: { revision: 1, updatedAt: "t" } });
    vi.mocked(saveSpecInput).mockResolvedValue({ ok: false, kind: "unavailable", message: "스펙 입력을 저장하지 못했습니다." });
    const f = new FormData();
    f.set("projectId", PID);
    f.set("route", "/products/[id]");
    f.set("spec", JSON.stringify({ overview: "상품 상세" }));
    const msgs = await lines(await handleDraftRequest(new Request("http://localhost/api/draft", { method: "POST", body: f })));
    expect(msgs.at(-1).type).toBe("done"); // 스펙 저장 실패가 초안을 막지 않는다
    expect(saveSpecInput).toHaveBeenCalledWith(expect.anything(), PID, {
      spec: expect.objectContaining({ overview: "상품 상세", imageCount: 0 }),
      route: "/products/[id]",
    });
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({ specSaved: false });
  });

  it("projectId가 없으면 스펙 입력을 저장하지 않는다", async () => {
    draft.mockResolvedValue(ok);
    await lines(await handleDraftRequest(form()));
    expect(saveSpecInput).not.toHaveBeenCalled();
  });

  it("초안 생성이 실패해도 스펙 입력은 저장된다(다음에 입력칸에 불러오기 위해)", async () => {
    draft.mockResolvedValue(failure("timeout"));
    await lines(await handleDraftRequest(withProject()));
    expect(saveSpecInput).toHaveBeenCalledTimes(1);
  });

  it("AI 호출 전에 프로젝트를 확인하고, 스택은 요청값이 아니라 프로젝트에 저장된 값을 쓴다", async () => {
    draft.mockResolvedValue(ok);
    vi.mocked(createBlueprintRevision).mockResolvedValue({ ok: true, data: { revision: 1, updatedAt: "t" } });
    await lines(await handleDraftRequest(withProject({ framework: "html", styling: "css", architecture: "fsd" }))); // 요청의 stack은 무시된다
    expect(draft.mock.calls[0][0].stack).toEqual(PROJECT_STACK);
    expect(vi.mocked(getProject).mock.invocationCallOrder[0]).toBeLessThan(draft.mock.invocationCallOrder[0]);
  });

  it("요청에 stack이 없어도 projectId가 있으면 통과한다", async () => {
    draft.mockResolvedValue(ok);
    vi.mocked(createBlueprintRevision).mockResolvedValue({ ok: true, data: { revision: 1, updatedAt: "t" } });
    expect((await lastOf(await handleDraftRequest(withProject(undefined)))).type).toBe("done");
  });

  it("남의·없는 프로젝트는 404이고 OpenAI(초안 생성)를 호출하지 않는다", async () => {
    vi.mocked(getProject).mockResolvedValue({ ok: false, kind: "not_found", message: "대상을 찾을 수 없습니다." });
    const res = await handleDraftRequest(withProject());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(draft).not.toHaveBeenCalled();
    expect(createBlueprintRevision).not.toHaveBeenCalled();
  });

  it("프로젝트 조회 중 DB 오류는 503이고 초안 생성을 호출하지 않는다", async () => {
    vi.mocked(getProject).mockResolvedValue({ ok: false, kind: "unavailable", message: "잠시 후 다시 시도해 주세요." });
    expect((await handleDraftRequest(withProject())).status).toBe(503);
    expect(draft).not.toHaveBeenCalled();
  });

  it("저장이 실패하면 error 알림(503)에 초안(blueprint)을 함께 담아 초안을 버리지 않는다", async () => {
    draft.mockResolvedValue(ok);
    vi.mocked(createBlueprintRevision).mockResolvedValue({ ok: false, kind: "unavailable", message: "설계도를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    const res = await handleDraftRequest(withProject());
    expect(res.status).toBe(200);
    const msgs = await lines(res);
    expect(msgs.at(-1)).toEqual({
      type: "error",
      status: 503,
      error: { code: "db_unavailable", message: "설계도를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", retryable: true },
      blueprint: { title: "상품 상세" },
    });
    expect(msgs.some((m) => m.type === "done")).toBe(false);
    expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toMatchObject({ saved: false });
  });

  it("초안 생성이 실패하면 저장하지 않는다", async () => {
    draft.mockResolvedValue(failure("invalid_output"));
    const msgs = await lines(await handleDraftRequest(withProject()));
    expect(msgs.at(-1)).toMatchObject({ type: "error", status: 422 });
    expect(msgs.some((m) => m.type === "stage" && m.stage === "saving")).toBe(false);
    expect(createBlueprintRevision).not.toHaveBeenCalled();
  });

  it("projectId가 없으면 저장도 프로젝트 조회도 하지 않고 meta에 saved가 없다(기존 동작)", async () => {
    draft.mockResolvedValue(ok);
    const res = await handleDraftRequest(form());
    expect(res.status).toBe(200);
    const meta = (await lastOf(res)).meta;
    expect(getProject).not.toHaveBeenCalled();
    expect(createBlueprintRevision).not.toHaveBeenCalled();
    expect(meta).not.toHaveProperty("saved");
  });

  it("projectId가 uuid가 아니면 400이고 DB·초안 생성을 호출하지 않는다", async () => {
    const f = new FormData();
    f.set("projectId", "not-a-uuid");
    f.set("spec", JSON.stringify({ overview: "x" }));
    const res = await handleDraftRequest(new Request("http://localhost/api/draft", { method: "POST", body: f }));
    expect(res.status).toBe(400);
    expect(getProject).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
  });
});

describe("handleDraftRequest — 스트림 하트비트와 타이머 정리", () => {
  afterEach(() => vi.useRealTimers());

  it("단계 알림이 없는 동안 10초마다 ping을 보내고, 줄은 생성이 끝나기 전에 먼저 도착한다", async () => {
    vi.useFakeTimers();
    let finish: (r: DraftResult) => void = () => {};
    draft.mockImplementation(async (_i, o) => {
      o?.onProgress?.({ stage: "generating", attempt: 1 });
      return new Promise<DraftResult>((resolve) => (finish = resolve));
    });
    const res = await handleDraftRequest(form());
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const next = async () => dec.decode((await reader.read()).value);

    // 생성이 끝나지 않았는데도 앞의 두 줄이 이미 읽힌다
    expect(await next()).toBe('{"type":"stage","stage":"accepted"}\n');
    expect(await next()).toBe('{"type":"stage","stage":"generating","attempt":1}\n');

    await vi.advanceTimersByTimeAsync(9_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await next()).toBe('{"type":"ping"}\n');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await next()).toBe('{"type":"ping"}\n');

    finish(ok);
    expect(JSON.parse(await next())).toMatchObject({ type: "done" });
    expect((await reader.read()).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0); // 완료 후 타이머 정리
  });

  it.each([
    ["오류로 끝나도", () => draft.mockResolvedValue(failure("timeout"))],
    ["예외로 끝나도", () => draft.mockRejectedValue(new Error("x"))],
  ])("%s 타이머를 정리하고 더 이상 ping을 보내지 않는다", async (_name, arrange) => {
    vi.useFakeTimers();
    arrange();
    const res = await handleDraftRequest(form());
    const msgs = await lines(res);
    expect(msgs.at(-1).type).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("클라이언트가 연결을 끊어도(cancel) 타이머를 정리하고, 저장은 끝까지 마친다", async () => {
    vi.useFakeTimers();
    let finish: (r: DraftResult) => void = () => {};
    draft.mockImplementation(() => new Promise<DraftResult>((resolve) => (finish = resolve)));
    vi.mocked(getProject).mockResolvedValue({ ok: true, data: { id: "p", name: "p", stack: { framework: "next", styling: "css", architecture: "fsd" }, createdAt: "c", updatedAt: "u" } });
    vi.mocked(createBlueprintRevision).mockResolvedValue({ ok: true, data: { revision: 1, updatedAt: "t" } });
    const f = new FormData();
    f.set("projectId", "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f");
    f.set("spec", JSON.stringify({ overview: "x" }));
    const res = await handleDraftRequest(new Request("http://localhost/api/draft", { method: "POST", body: f }));
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);

    finish(ok);
    await vi.advanceTimersByTimeAsync(0);
    expect(createBlueprintRevision).toHaveBeenCalledTimes(1);
  });
});
