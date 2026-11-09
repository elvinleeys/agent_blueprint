import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { RepoTarget } from "@/core/code-source/github-url";
import { readGithubRepo, type RepoRead, type RepoReadOptions } from "./github";
import { buildTar, paxRecord, type TarEntrySpec } from "./tar-builder";

// GitHub 공개 저장소 읽기: 가짜 fetch로만 시험한다(실제 GitHub를 부르지 않는다)

const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "github_pat_SECRET_TOKEN_VALUE";
const target = (over: Partial<RepoTarget> = {}): RepoTarget => ({ owner: "acme", repo: "shop", ref: null, subdir: null, ...over });

const ENTRIES: TarEntrySpec[] = [
  { name: "pax_global_header", type: "g", content: paxRecord("comment", SHA) },
  { name: "acme-shop-0123456/", type: "5" },
  { name: "acme-shop-0123456/tsconfig.json", content: '{"compilerOptions":{}}' },
  { name: "acme-shop-0123456/src/A.tsx", content: "export function A() { return null; }" },
  { name: "acme-shop-0123456/src/A.test.tsx", content: "test" },
  { name: "acme-shop-0123456/README.md", content: "# shop" },
  { name: "acme-shop-0123456/node_modules/x/index.ts", content: "x" },
  { name: "acme-shop-0123456/src/link.tsx", type: "2", linkname: "A.tsx" },
  { name: "acme-shop-0123456/apps/web/src/B.tsx", content: "export function B() { return null; }" },
];
const archive = (entries = ENTRIES) => gzipSync(buildTar(entries));

type Call = { url: string; headers: Record<string, string>; redirect?: string };
type Reply = Response | (() => Response | Promise<Response>);

/** 순서대로 답하는 가짜 fetch. 부른 주소·머리말을 기록한다 */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) }, redirect: init?.redirect });
    const r = replies[calls.length - 1];
    if (!r) throw new Error(`예상하지 못한 요청: ${String(input)}`);
    return typeof r === "function" ? r() : r;
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const META = { private: false, visibility: "public", size: 1234, default_branch: "main" };
const redirect = (location = "https://codeload.github.com/acme/shop/legacy.tar.gz/refs/heads/main") => new Response(null, { status: 302, headers: { location } });
const tgz = (body: Uint8Array = archive(), headers: Record<string, string> = {}) => new Response(body as unknown as BodyInit, { status: 200, headers });

const run = (replies: Reply[], t = target(), opts: RepoReadOptions = {}) => {
  const f = fakeFetch(replies);
  return readGithubRepo(t, { token: TOKEN, ...opts, fetch: f.fn }).then((r) => ({ r, calls: f.calls }));
};
const errorOf = (r: RepoRead) => (r.ok ? null : r.error);

describe("공개 저장소를 압축 파일 한 번으로 받아 메모리에서 읽는다", () => {
  it("저장소 정보 → tarball 주소(codeload) → 받기, 3번 요청. 거르기 규칙에 맞는 파일만, 맨 위 폴더는 저장소 이름으로", async () => {
    const { r, calls } = await run([json(META), redirect(), tgz()]);
    expect(r).toEqual({
      ok: true,
      owner: "acme",
      repo: "shop",
      ref: "main",
      commit: SHA,
      folder: "shop",
      files: [
        { path: "shop/tsconfig.json", content: '{"compilerOptions":{}}' },
        { path: "shop/src/A.tsx", content: "export function A() { return null; }" },
        { path: "shop/apps/web/src/B.tsx", content: "export function B() { return null; }" },
      ],
    });
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.github.com/repos/acme/shop",
      "https://api.github.com/repos/acme/shop/tarball/main",
      "https://codeload.github.com/acme/shop/legacy.tar.gz/refs/heads/main",
    ]);
    expect(calls.map((c) => c.redirect)).toEqual(["manual", "manual", "error"]);
  });

  it("주소에 브랜치가 있으면 그 브랜치로 받는다", async () => {
    const { calls } = await run([json(META), redirect(), tgz()], target({ ref: "v1.2.0" }));
    expect(calls[1].url).toBe("https://api.github.com/repos/acme/shop/tarball/v1.2.0");
  });

  it("하위 폴더를 주면 그 폴더만, 폴더 이름(web)으로 시작하는 경로로 남긴다. 없는 폴더면 알린다", async () => {
    const { r } = await run([json(META), redirect(), tgz()], target({ subdir: "apps/web" }));
    expect(r.ok && r.files).toEqual([{ path: "web/src/B.tsx", content: "export function B() { return null; }" }]);
    expect(r.ok && r.folder).toBe("web");
    const missing = await run([json(META), redirect(), tgz()], target({ subdir: "apps/admin" }));
    expect(errorOf(missing.r)).toMatchObject({ code: "subdir_not_found" });
  });
});

describe("GITHUB_TOKEN: api.github.com에만 붙이고, 없어도 동작하고, 오류 문구에 나오지 않는다", () => {
  it("토큰은 저장소 정보·tarball 주소 요청에만 붙고 codeload 받기에는 붙지 않는다", async () => {
    const { calls } = await run([json(META), redirect(), tgz()]);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[2].headers.Authorization).toBeUndefined();
    expect(JSON.stringify(calls[2].headers)).not.toContain(TOKEN);
  });

  it("토큰이 없으면(빈 값) Authorization 없이 요청하고 결과는 같다", async () => {
    const withToken = await run([json(META), redirect(), tgz()]);
    const { r, calls } = await run([json(META), redirect(), tgz()], target(), { token: "" });
    expect(calls.every((c) => c.headers.Authorization === undefined)).toBe(true);
    expect(r).toEqual(withToken.r);
  });

  it("어떤 오류 문구에도 토큰이 들어가지 않는다", async () => {
    const cases: Reply[][] = [
      [json({}, 404)],
      [json({ ...META, private: true })],
      [json({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "9999999999" })],
      [json({}, 500)],
      [json(META), redirect("https://evil.example/acme/shop.tgz")],
      [json(META), json({}, 404)],
      [() => Promise.reject(new TypeError("fetch failed"))],
    ];
    for (const replies of cases) {
      const { r } = await run(replies);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    }
  });
});

describe("공개 저장소만, 크기·요청 한도", () => {
  it("404는 없거나 비공개, private·visibility가 공개가 아니면 거부(받기 전에 멈춤)", async () => {
    expect(errorOf((await run([json({}, 404)])).r)).toEqual({ code: "not_found", message: "저장소가 없거나 공개 저장소가 아닙니다." });
    for (const meta of [{ ...META, private: true }, { ...META, private: undefined }, { ...META, visibility: "internal" }]) {
      const { r, calls } = await run([json(meta)]);
      expect(errorOf(r)).toEqual({ code: "private", message: "공개 저장소만 검사할 수 있습니다." });
      expect(calls).toHaveLength(1);
    }
  });

  it("저장소가 200MB를 넘으면 받기 전에 거절한다", async () => {
    const { r, calls } = await run([json({ ...META, size: 200 * 1024 + 1 })]);
    expect(errorOf(r)?.code).toBe("too_large");
    expect(calls).toHaveLength(1);
  });

  it("요청 한도: remaining 0이면 reset까지 남은 분을, retry-after가 있으면 그 시간을 알리고 다시 시도하지 않는다", async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const a = await run([json({}, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) })]);
    expect(errorOf(a.r)).toMatchObject({ code: "rate_limited", message: expect.stringMatching(/GitHub 요청 한도에 걸렸습니다\. (10|11)분 뒤 다시 시도해 주세요\./) });
    expect(a.calls).toHaveLength(1);
    const b = await run([json(META), json({}, 429, { "retry-after": "120" })]);
    expect(errorOf(b.r)).toEqual({ code: "rate_limited", message: "GitHub 요청 한도에 걸렸습니다. 2분 뒤 다시 시도해 주세요.", retryAfterSec: 120 });
  });

  it("한도 표시 없는 403은 거절로 알린다", async () => {
    expect(errorOf((await run([json({}, 403)])).r)?.code).toBe("forbidden");
  });

  it("저장소가 옮겨졌으면(301) 새 주소를 넣으라고 알리고 따라가지 않는다", async () => {
    const { r, calls } = await run([new Response(null, { status: 301, headers: { location: "https://api.github.com/repositories/1" } })]);
    expect(errorOf(r)?.code).toBe("moved");
    expect(calls).toHaveLength(1);
  });

  it("없는 브랜치", async () => {
    expect(errorOf((await run([json(META), json({}, 404)], target({ ref: "nope" }))).r)).toEqual({ code: "ref_not_found", message: "브랜치를 찾지 못했습니다: nope" });
  });
});

describe("리다이렉트는 codeload의 같은 저장소만", () => {
  it.each([
    "https://evil.example/acme/shop/legacy.tar.gz/main",
    "http://codeload.github.com/acme/shop/legacy.tar.gz/main",
    "https://codeload.github.com:8443/acme/shop/legacy.tar.gz/main",
    "https://codeload.github.com/other/repo/legacy.tar.gz/main",
    "https://codeload.github.com.evil.example/acme/shop/legacy.tar.gz/main",
    "https://user@codeload.github.com/acme/shop/legacy.tar.gz/main",
    "not a url",
  ])("%s → 거부하고 받지 않는다", async (location) => {
    const { r, calls } = await run([json(META), redirect(location)]);
    expect(errorOf(r)?.code).toBe("bad_redirect");
    expect(calls).toHaveLength(2);
  });

  it("owner·repo 대소문자만 다른 codeload 주소는 같은 저장소로 받는다", async () => {
    const { r } = await run([json(META), redirect("https://codeload.github.com/Acme/Shop/legacy.tar.gz/refs/heads/main"), tgz()]);
    expect(r.ok).toBe(true);
  });
});

describe("압축 파일 제한·손상·시간", () => {
  it("받는 압축 크기: content-length로 미리, 받는 중에도 센다", async () => {
    const declared = await run([json(META), redirect(), tgz(archive(), { "content-length": String(31 * 1024 * 1024) })]);
    expect(errorOf(declared.r)).toEqual({ code: "too_large", message: "압축 파일이 30MB를 넘습니다." });
    const counted = await run([json(META), redirect(), tgz()], target(), { limits: { maxCompressedBytes: 100 } });
    expect(errorOf(counted.r)?.code).toBe("too_large");
  });

  it("압축 파일 안의 위험한 경로는 전체를 거부한다", async () => {
    const bad = archive([{ name: "acme-shop-0123456/../../etc/x.ts", content: "x" }]);
    expect(errorOf((await run([json(META), redirect(), tgz(bad)])).r)?.code).toBe("unsafe_path");
  });

  it("푼 전체 크기·남길 파일 크기 제한은 tar 해석기와 같은 값으로 중단한다(남길 파일은 하위 폴더 안내)", async () => {
    expect(errorOf((await run([json(META), redirect(), tgz()], target(), { limits: { maxUnpackedBytes: 1000 } })).r)?.code).toBe("too_large_unpacked");
    const big = await run([json(META), redirect(), tgz()], target(), { limits: { maxFileBytes: 10 } });
    expect(errorOf(big.r)).toMatchObject({ code: "file_too_large", message: expect.stringContaining("하위 폴더를 지정해 범위를 좁혀 보세요.") });
  });

  it("gzip이 아니면 풀지 못했다고 알린다", async () => {
    expect(errorOf((await run([json(META), redirect(), tgz(new TextEncoder().encode("not gzip"))])).r)?.code).toBe("bad_archive");
  });

  it("시간 제한을 넘으면 중단한다", async () => {
    // 응답하지 않고 중단 신호만 기다리는 fetch
    const slowFetch = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
    const r = await readGithubRepo(target(), { token: "", fetch: slowFetch, limits: { timeoutMs: 30 } });
    expect(errorOf(r)).toMatchObject({ code: "timeout", message: expect.stringContaining("0.03초 안에 받지 못했습니다") });
  });

  it("연결 실패는 네트워크 오류로 알린다", async () => {
    expect(errorOf((await run([() => Promise.reject(new TypeError("fetch failed"))])).r)?.code).toBe("network");
  });
});
