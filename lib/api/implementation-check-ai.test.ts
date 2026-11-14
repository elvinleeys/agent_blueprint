import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBlueprint as loadFixtureBlueprint, loadCode } from "../../core/impl-check/load-fixture";
import type { DraftClient } from "../ai/draft-blueprint";
import { loadBlueprint } from "../db/blueprints";
import { getProject } from "../db/projects";
import { loadLatestBlueprintRef, loadLatestExportedRevision } from "../db/prompt-exports";
import { handleImplementationCheckPost } from "./implementation-check-handler";
import { requireSession } from "./session";

// 구현 검사 API의 AI 제안(5-4). OpenAI는 가짜 클라이언트로만 부른다(실제 호출 없음).
// 허용 판단은 가짜로 바꾸지 않고(getUser·환경변수로) 실제 판단 함수를 거친다.

const fake = vi.hoisted(() => ({ create: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>, throwOnCreate: false }));

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/blueprints", () => ({ loadBlueprint: vi.fn() }));
vi.mock("../db/projects", () => ({ getProject: vi.fn() }));
vi.mock("../db/prompt-exports", () => ({ loadLatestBlueprintRef: vi.fn(), loadLatestExportedRevision: vi.fn() }));
vi.mock("../ai/draft-blueprint", async (orig) => ({
  ...(await orig<typeof import("../ai/draft-blueprint")>()),
  createDefaultClient: (): DraftClient => {
    if (fake.throwOnCreate) throw new Error("OPENAI_API_KEY environment variable is missing");
    return { responses: { create: fake.create } } as unknown as DraftClient;
  },
}));

const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
const ALLOWED = "111";
const MARK = "SECRET_AI_CODE_MARKER_7733";
const getUser = vi.fn();
const db = { auth: { getUser } } as never;
const githubUser = (id: string, user_metadata: Record<string, unknown> = {}) => ({ data: { user: { id: "uuid-1", user_metadata, identities: [{ provider: "github", id }] } }, error: null });

const files = (name = "renamed") => loadCode("next", name).map(({ path, content }) => ({ path, content: path.endsWith("ItemImages.tsx") ? content.replace("return", `// ${MARK}\n  return`) : content }));
const post = (body: unknown) => new Request(`http://localhost/api/projects/${ID}/implementation-check`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const call = (body: unknown) => handleImplementationCheckPost(post(body), { params: Promise.resolve({ id: ID }) });
type Body = { result: unknown; ai?: { status: string; failure?: string; suggestions?: { pairs: { nodeId: string; verdict: string; id: string }[]; responsibilities: unknown[]; dropped: number }; omitted?: unknown; meta?: { attempts: number } }; error?: { code: string } };
const json = async (res: Response) => (await res.json()) as Body;

const GOOD = {
  pairs: [{ nodeId: "n-gallery", path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages", verdict: "same", reason: "images prop으로 이미지 목록을 그린다." }],
  responsibilities: [{ nodeId: "n-cart-button", responsibility: "없는 책임", verdict: "missing", reason: "보내지 않은 책임이라 버려져야 한다." }],
};
const reply = (body: unknown) => async () => ({ status: "completed", incomplete_details: null, output: [], output_text: typeof body === "string" ? body : JSON.stringify(body), usage: { input_tokens: 10, output_tokens: 10, output_tokens_details: { reasoning_tokens: 0 } } });
const replies = (...list: (() => Promise<unknown>)[]) => {
  fake.create = vi.fn();
  for (const r of list) fake.create.mockImplementationOnce(r);
};

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("AI_SUGGEST_ENABLED", "true");
  vi.stubEnv("AI_SUGGEST_ALLOWED_USERS", ALLOWED);
  fake.throwOnCreate = false;
  replies();
  getUser.mockReset().mockResolvedValue(githubUser(ALLOWED));
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "uuid-1" });
  vi.mocked(getProject).mockReset().mockResolvedValue({ ok: true, data: {} as never });
  vi.mocked(loadLatestExportedRevision).mockReset().mockResolvedValue({ ok: true, data: 2 });
  vi.mocked(loadLatestBlueprintRef).mockReset().mockResolvedValue({ ok: true, data: { id: "b2", revision: 2 } });
  vi.mocked(loadBlueprint).mockReset().mockResolvedValue({ ok: true, data: loadFixtureBlueprint("next", "renamed") });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

/** AI 없이 같은 요청의 결과(비교 기준) */
const withoutAi = async () => (await json(await call({ codeFiles: files() }))).result;

describe("허용 판단: OpenAI를 부르기 전에 403", () => {
  it.each([
    ["기능 꺼짐(기본값)", () => vi.stubEnv("AI_SUGGEST_ENABLED", "")],
    ["허용 목록 밖", () => getUser.mockResolvedValue(githubUser("999"))],
    ["user_metadata만 허용 id로 바꿈", () => getUser.mockResolvedValue(githubUser("999", { provider_id: ALLOWED, sub: ALLOWED }))],
  ])("%s → 403 feature_restricted, OpenAI 호출 0번", async (_, arrange) => {
    arrange();
    const res = await call({ codeFiles: files(), useAi: true });
    expect(res.status).toBe(403);
    expect((await json(res)).error?.code).toBe("feature_restricted");
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("useAi가 없거나 false면 허용 판단·OpenAI 없이 지금처럼(ai 키 없음)", async () => {
    vi.stubEnv("AI_SUGGEST_ENABLED", "");
    for (const body of [{ codeFiles: files() }, { codeFiles: files(), useAi: false }]) {
      const res = await call(body);
      expect(res.status).toBe(200);
      expect((await json(res)).ai).toBeUndefined();
    }
    expect(fake.create).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("허용된 사용자: 코드 판정 뒤에 AI 제안, 결과(result)는 AI와 상관없이 같다", () => {
  it("정상 응답: ai.status ok, 짝 제안만 남고 보내지 않은 책임은 버림, result는 AI 없이 검사한 것과 같다", async () => {
    replies(reply(GOOD));
    const body = await json(await call({ codeFiles: files(), useAi: true }));
    expect(body.ai).toMatchObject({ status: "ok", suggestions: { pairs: [{ nodeId: "n-gallery", verdict: "same", id: "AI|pair|n-gallery|src/entities/product/ui/ItemImages.tsx#ItemImages" }], responsibilities: [], dropped: 1 }, meta: { attempts: 1 } });
    expect(body.result).toEqual(await withoutAi());
  });

  it("응답 형식이 두 번 다 틀리면 ai.status failed(invalid_output), result는 그대로·200", async () => {
    replies(reply("not json"), reply({ pairs: "x" }));
    const res = await call({ codeFiles: files(), useAi: true });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ai).toMatchObject({ status: "failed", failure: "invalid_output", meta: { attempts: 2 } });
    expect(body.result).toEqual(await withoutAi());
  });

  it("OpenAI 429·키 없음(클라이언트를 만들지 못함)도 결과는 그대로이고 ai만 실패로 알린다", async () => {
    replies(() => Promise.reject(Object.assign(new Error("rate"), { status: 429 })));
    const limited = await json(await call({ codeFiles: files(), useAi: true }));
    expect(limited.ai).toMatchObject({ status: "failed", failure: "rate_limited" });

    fake.throwOnCreate = true;
    const res = await call({ codeFiles: files(), useAi: true });
    expect(res.status).toBe(200);
    expect((await json(res)).ai).toMatchObject({ status: "failed", failure: "upstream" });
  });

  it("보낼 대상이 없으면(짝 확인 필요도 책임도 없음) OpenAI를 부르지 않고 skipped", async () => {
    const bp = loadFixtureBlueprint("next", "correct");
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: true, data: { ...bp, nodes: bp.nodes.map((n) => ({ ...n, responsibilities: [] })) } });
    const body = await json(await call({ codeFiles: files("correct"), useAi: true }));
    expect(body.ai).toEqual({ status: "skipped", omitted: { pairNodes: [], responsibilityNodes: [] } });
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("응답과 서버 로그에 코드 내용이 없고, 로그에는 AI 근거 글도 없다", async () => {
    replies(reply(GOOD));
    const res = await call({ codeFiles: files(), useAi: true });
    expect(JSON.stringify(await res.json())).not.toContain(MARK);
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain(MARK);
    expect(logs).not.toContain("images prop으로");
    expect(logs).toContain('\\"status\\":\\"ok\\"');
    // OpenAI로는 함수 조각만 간다(파일의 import 줄은 가지 않음)
    const sent = JSON.stringify(fake.create.mock.calls[0][0].input);
    expect(sent).toContain(MARK);
    expect(sent).not.toContain("import ");
  });
});

describe("confirmed의 source(받아들인 AI 제안)", () => {
  const PAIR = { nodeId: "n-gallery", path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages" };

  it("source ai·user·없음은 판정이 같다(기록용), 모르는 값은 400", async () => {
    const results = [];
    for (const source of ["ai", "user", undefined]) {
      const res = await call({ codeFiles: files(), confirmed: [{ ...PAIR, ...(source ? { source } : {}) }] });
      expect(res.status).toBe(200);
      results.push((await json(res)).result);
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect((await call({ codeFiles: files(), confirmed: [{ ...PAIR, source: "robot" }] })).status).toBe(400);
  });

  it("AI에서 받아들인 짝 수를 로그에 남긴다(어느 짝인지는 남기지 않음)", async () => {
    await call({ codeFiles: files(), confirmed: [{ ...PAIR, source: "ai" }] });
    expect(JSON.stringify(info.mock.calls)).toContain('\\"confirmedFromAi\\":1');
  });
});
