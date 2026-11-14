import { describe, expect, it } from "vitest";
import { parseRepoUrl, parseSubdir } from "./github-url";

describe("GitHub 저장소 주소: 받는 형식", () => {
  it.each([
    ["https://github.com/vercel/next.js", { owner: "vercel", repo: "next.js", ref: null }],
    ["https://github.com/vercel/next.js/", { owner: "vercel", repo: "next.js", ref: null }],
    ["https://github.com/vercel/next.js.git", { owner: "vercel", repo: "next.js", ref: null }],
    ["  https://github.com/a-b/c_d  ", { owner: "a-b", repo: "c_d", ref: null }],
    ["https://github.com/owner/repo/tree/canary", { owner: "owner", repo: "repo", ref: "canary" }],
    ["https://github.com/owner/repo/tree/v1.2.0", { owner: "owner", repo: "repo", ref: "v1.2.0" }],
  ])("%s", (url, want) => {
    expect(parseRepoUrl(url)).toEqual({ ok: true, target: { ...want, subdir: null } });
  });

  it("하위 폴더를 함께 받는다(앞뒤 ./·/ 정리)", () => {
    expect(parseRepoUrl("https://github.com/o/r", "./apps/web/")).toEqual({ ok: true, target: { owner: "o", repo: "r", ref: null, subdir: "apps/web" } });
    expect(parseSubdir("  ")).toEqual({ ok: true, subdir: null });
  });
});

describe("GitHub 저장소 주소: 거부(서버 요청 위조 방어)", () => {
  it.each([
    "http://github.com/o/r",
    "https://gist.github.com/o/r",
    "https://api.github.com/repos/o/r",
    "https://github.com.evil.com/o/r",
    "https://evil.com/github.com/o/r",
    "https://github.com:8443/o/r",
    "https://user:pass@github.com/o/r",
    "https://evil.com@github.com/o/r",
    "https://github.com/o/r?x=1",
    "https://github.com/o/r#readme",
    "https://github.com/o",
    "https://github.com/o/r/blob/main/a.ts",
    "https://github.com/o/r/tree/feature/x",
    "https://github.com/o/r/tree/..",
    "https://github.com/o/r/tree/.",
    "https://github.com/o/r/tree/./",
    "https://github.com/x/y\\..\\..\\o/r",
    "https://github.com/o\\r",
    "https://github.com/o/%2e%2e",
    "https://github.com/o/r%2f..",
    "https://github.com/-o/r",
    "https://github.com/o/..",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "github.com/o/r",
    "",
  ])("%s", (url) => {
    const r = parseRepoUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("https://github.com/<owner>/<repo>");
  });

  it.each(["../x", "/abs", "apps/../../x", "a\\b", "a/./b", "a/b c"])("하위 폴더 거부: %s", (s) => {
    expect(parseRepoUrl("https://github.com/o/r", s).ok).toBe(false);
  });
});
