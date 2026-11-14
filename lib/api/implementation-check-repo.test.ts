import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBlueprint as loadFixtureBlueprint } from "../../core/impl-check/load-fixture";
import { readLocalFolder } from "../code-source/local";
import { buildTar, paxRecord, type TarEntrySpec } from "../code-source/tar-builder";
import { loadBlueprint } from "../db/blueprints";
import { getProject } from "../db/projects";
import { loadLatestBlueprintRef, loadLatestExportedRevision } from "../db/prompt-exports";
import { handleImplementationCheckPost } from "./implementation-check-handler";
import { requireSession } from "./session";

// 구현 검사 API의 GitHub 저장소 입력(4f-3). 허용 판단은 가짜로 바꾸지 않고(getUser·환경변수로) 실제 판단 함수를 거친다.
// GitHub는 가짜 fetch로만 부른다(실제 호출 없음).

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/blueprints", () => ({ loadBlueprint: vi.fn() }));
vi.mock("../db/projects", () => ({ getProject: vi.fn() }));
vi.mock("../db/prompt-exports", () => ({ loadLatestBlueprintRef: vi.fn(), loadLatestExportedRevision: vi.fn() }));

const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const ALLOWED = "111";
const URL_ = "https://github.com/acme/shop";
const MARK = "SECRET_REPO_CODE_MARKER_5521";

const getUser = vi.fn();
const db = { auth: { getUser } } as never;
const githubUser = (id: string, user_metadata: Record<string, unknown> = {}) => ({ data: { user: { id: "uuid-1", user_metadata, identities: [{ provider: "github", id }] } }, error: null });

const ctx = () => ({ params: Promise.resolve({ id: ID }) });
const post = (body: unknown, signal?: AbortSignal) =>
  new Request(`http://localhost/api/projects/${ID}/implementation-check`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, signal });
const call = (body: unknown, signal?: AbortSignal) => handleImplementationCheckPost(post(body, signal), ctx());

/** 시연 폴더 correct(실제 correct-test 저장소와 같은 내용, tsconfig 포함)를 GitHub tarball 모양으로(맨 위 폴더 owner-repo-sha, 전역 머리말에 커밋 id). 설계도 위치 밖 파일 하나를 더한다 */
const code = readLocalFolder("fixtures/demo-implementation-check/correct").map(({ path, content }) => ({
  path: path.replace(/^correct\//, ""),
  content: path.endsWith("PriceTag.tsx") ? `${content}\n// ${MARK}` : content,
}));
const entries = (extra: TarEntrySpec[] = []): TarEntrySpec[] => [
  { name: "pax_global_header", type: "g", content: paxRecord("comment", SHA) },
  ...code.map((f) => ({ name: `acme-shop-0123456/${f.path}`, content: f.content })),
  { name: "acme-shop-0123456/tools/unrelated.ts", content: "export const unrelated = 1;" },
  { name: "acme-shop-0123456/README.md", content: "# shop" },
  ...extra,
];
const tgz = (list = entries()) => gzipSync(buildTar(list));

type Call = { url: string; signal?: AbortSignal | null };
let calls: Call[];
function stubGithub(replies: (() => Response)[]) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), signal: init?.signal });
      const r = replies[calls.length - 1];
      if (!r) throw new Error(`예상하지 못한 요청: ${String(input)}`);
      return r();
    }),
  );
}
const META = () => Response.json({ private: false, visibility: "public", size: 100, default_branch: "main" });
const REDIRECT = () => new Response(null, { status: 302, headers: { location: "https://codeload.github.com/acme/shop/legacy.tar.gz/refs/heads/main" } });
const ARCHIVE = (body: Uint8Array = tgz(), headers: Record<string, string> = {}) => () => new Response(body as unknown as BodyInit, { status: 200, headers });
const ok = () => stubGithub([META, REDIRECT, ARCHIVE()]);

type Body = {
  repo?: { name: string; ref: string; commit: string | null; subdir: string | null };
  result: { findings: unknown[]; summary: { design: { total: number; match: number } } };
  meta: { files: number };
  error?: { code: string; message: string; retryable: boolean; retryAfterSec?: number };
};
const json = async (res: Response) => (await res.json()) as Body;

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("REPO_CHECK_ENABLED", "true");
  vi.stubEnv("REPO_CHECK_ALLOWED_USERS", `${ALLOWED},222`);
  vi.stubEnv("GITHUB_TOKEN", "");
  getUser.mockReset().mockResolvedValue(githubUser(ALLOWED));
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "uuid-1" });
  vi.mocked(getProject).mockReset().mockResolvedValue({ ok: true, data: {} as never });
  vi.mocked(loadLatestExportedRevision).mockReset().mockResolvedValue({ ok: true, data: 2 });
  vi.mocked(loadLatestBlueprintRef).mockReset().mockResolvedValue({ ok: true, data: { id: "b2", revision: 2 } });
  vi.mocked(loadBlueprint).mockReset().mockResolvedValue({ ok: true, data: loadFixtureBlueprint("next", "correct") });
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  stubGithub([]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("허용 판단: GitHub를 부르기 전에 403", () => {
  it("서버 설정이 꺼져 있으면(기본값) 403이고 인증 서버·GitHub를 부르지 않는다", async () => {
    vi.stubEnv("REPO_CHECK_ENABLED", "");
    const res = await call({ repo: { url: URL_ } });
    expect(res.status).toBe(403);
    expect((await json(res)).error).toMatchObject({ code: "feature_restricted", message: expect.stringContaining("현재 제한된 기능") });
    expect(getUser).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("켜져 있어도 허용 목록 밖이면 403, GitHub 호출 0번", async () => {
    getUser.mockResolvedValue(githubUser("999"));
    expect((await call({ repo: { url: URL_ } })).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("user_metadata의 provider_id·sub·user_name을 허용 사용자로 바꿔도 identities가 다르면 403, GitHub 호출 0번", async () => {
    getUser.mockResolvedValue(githubUser("999", { provider_id: ALLOWED, sub: ALLOWED, user_name: "allowed-user" }));
    expect((await call({ repo: { url: URL_ } })).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("코드 폴더 올리기(codeFiles)는 허용 판단 없이 지금처럼 된다", async () => {
    vi.stubEnv("REPO_CHECK_ENABLED", "");
    expect((await call({ codeFiles: code })).status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("허용된 사용자: 저장소를 받아 설계도 위치 기준으로 골라 검사", () => {
  it("시연 코드 correct가 든 저장소는 200, 설계도 항목이 모두 일치하고 저장소·커밋을 함께 돌려준다", async () => {
    ok();
    const res = await call({ repo: { url: URL_ } });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.repo).toEqual({ name: "acme/shop", ref: "main", commit: SHA, subdir: null });
    expect(body.result.findings).toEqual([]);
    expect(body.result.summary.design.match).toBe(body.result.summary.design.total);
    // 채점 스크립트(--repo)와 같은 11개. 설계도 위치 밖이고 어디서도 가져오지 않는 tools/unrelated.ts는 고르지 않는다
    expect(body.meta.files).toBe(11);
    expect(body.result.summary.design).toMatchObject({ total: 65, match: 65 });
    expect(calls.map((c) => c.url)).toEqual(["https://api.github.com/repos/acme/shop", "https://api.github.com/repos/acme/shop/tarball/main", "https://codeload.github.com/acme/shop/legacy.tar.gz/refs/heads/main"]);
  });

  it("commit을 보내면(짝 확정 뒤 다시 검사) 그 커밋으로 받는다", async () => {
    ok();
    await call({ repo: { url: URL_, commit: SHA } });
    expect(calls[1].url).toBe(`https://api.github.com/repos/acme/shop/tarball/${SHA}`);
  });

  it("요청의 중단 신호를 GitHub 요청에 넘긴다(사용자가 연결을 끊으면 받기 중단)", async () => {
    ok();
    const ac = new AbortController();
    await call({ repo: { url: URL_ } }, ac.signal);
    expect(calls[0].signal?.aborted).toBe(false);
    ac.abort();
    expect(calls.every((c) => c.signal?.aborted)).toBe(true);
  });

  it("응답과 서버 로그에 코드 내용이 없다", async () => {
    ok();
    const res = await call({ repo: { url: URL_ } });
    expect(JSON.stringify(await res.json())).not.toContain(MARK);
    expect(JSON.stringify(info.mock.calls)).not.toContain(MARK);
  });
});

describe("서버용 제한(4f 승인 값)", () => {
  it("받는 압축 파일이 10MB를 넘으면 413(채점 스크립트의 30MB가 아니라 서버 값)", async () => {
    stubGithub([META, REDIRECT, ARCHIVE(tgz(), { "content-length": String(11 * 1024 * 1024) })]);
    const res = await call({ repo: { url: URL_ } });
    expect(res.status).toBe(413);
    expect((await json(res)).error).toMatchObject({ code: "too_large", message: "압축 파일이 10MB를 넘습니다." });
  });

  it("설계도 위치 기준으로 고른 파일이 200개를 넘으면 413과 하위 폴더 안내", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ name: `acme-shop-0123456/src/entities/product/ui/Extra${i}.tsx`, content: `export const Extra${i} = 1;` }));
    stubGithub([META, REDIRECT, ARCHIVE(tgz(entries(many)))]);
    const res = await call({ repo: { url: URL_ } });
    expect(res.status).toBe(413);
    expect((await json(res)).error?.message).toMatch(/파일이 200개를 넘습니다\..*하위 폴더/);
  });

  it("설계도 위치에 맞는 .ts·.tsx가 없으면 422", async () => {
    stubGithub([META, REDIRECT, ARCHIVE(tgz([{ name: "acme-shop-0123456/tools/a.ts", content: "export const a = 1;" }]))]);
    const res = await call({ repo: { url: URL_ } });
    expect(res.status).toBe(422);
    expect((await json(res)).error?.code).toBe("no_source_files");
  });
});

describe("요청 검증과 GitHub 오류", () => {
  it.each([
    [{ repo: { url: "https://evil.example/acme/shop" } }],
    [{ repo: { url: URL_, subdir: "../x" } }],
    [{ repo: { url: URL_, commit: "main" } }],
    [{ repo: { url: URL_ }, codeFiles: [] }],
    [{ repo: { url: URL_, token: "x" } }],
    [{}],
  ])("주소·하위 폴더·커밋 형식이 틀리거나 codeFiles와 함께 보내면 400, GitHub 호출 0번: %j", async (body) => {
    expect((await call(body)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("설계도가 없으면 저장소를 받기 전에 422", async () => {
    vi.mocked(loadLatestBlueprintRef).mockResolvedValue({ ok: true, data: null });
    expect((await call({ repo: { url: URL_ } })).status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("비공개 저장소는 422, 요청 한도는 429와 다시 시도할 시간, 연결 실패는 502. 로그에는 오류 코드만", async () => {
    stubGithub([() => Response.json({ private: true })]);
    const priv = await call({ repo: { url: URL_ } });
    expect(priv.status).toBe(422);
    expect((await json(priv)).error).toMatchObject({ code: "private", retryable: false });

    stubGithub([() => Response.json({}, { status: 429, headers: { "retry-after": "120" } })]);
    const limited = await call({ repo: { url: URL_ } });
    expect(limited.status).toBe(429);
    expect((await json(limited)).error).toMatchObject({ code: "rate_limited", retryable: true, retryAfterSec: 120 });

    stubGithub([() => Promise.reject(new TypeError("fetch failed")) as never]);
    expect((await call({ repo: { url: URL_ } })).status).toBe(502);
    expect(info.mock.calls.filter((c: unknown[]) => String(c[0]).includes("저장소 읽기 실패")).map((c: unknown[]) => c[1])).toEqual(["private", "rate_limited", "network"]);
  });
});
