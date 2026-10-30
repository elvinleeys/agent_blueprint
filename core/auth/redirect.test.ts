import { describe, expect, it } from "vitest";
import { decideRedirect, isProtectedPath, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["//evil.com"], ["/\\evil.com"], ["/\t/evil.com"], ["/\n/evil.com"], ["https://evil.com"], ["javascript:alert(1)"],
    ["evil.com"], [""], [null], [undefined], [["/projects"]], [123], ["/" + "a".repeat(512)],
    ["/login"], ["/login?next=/x"], ["/auth/callback"], ["/"], ["/?next=/x"], ["/#a"],
  ])("차단하고 fallback으로 바꾼다: %j", (input) => {
    expect(safeNextPath(input)).toBe("/projects");
  });

  it.each([["/projects"], ["/projects/1"], ["/account"], ["/projects?tab=1#a"], ["/loginx"], ["/%2F%2Fevil.com"]])("내부 경로는 그대로 통과: %s", (p) => {
    expect(safeNextPath(p)).toBe(p);
  });

  it("fallback을 지정할 수 있다", () => expect(safeNextPath("//x", "/")).toBe("/"));
});

describe("isProtectedPath", () => {
  it.each([["/projects"], ["/projects/1"], ["/account"], ["/account/x"]])("보호: %s", (p) => expect(isProtectedPath(p)).toBe(true));
  it.each([["/"], ["/login"], ["/projectsx"], ["/accounts"], ["/auth/callback"], ["/api/draft"]])("공개: %s", (p) => expect(isProtectedPath(p)).toBe(false));
});

describe("decideRedirect", () => {
  it("비로그인 + 보호 경로 → /?next= (인코딩, 되돌아오면 같은 경로)", () => {
    const to = decideRedirect({ pathname: "/projects", search: "?tab=1", isAuthed: false })!;
    expect(to).toBe("/?next=%2Fprojects%3Ftab%3D1");
    expect(safeNextPath(new URLSearchParams(to.split("?")[1]).get("next"))).toBe("/projects?tab=1");
  });

  it("로그인 + /login → next 또는 /projects", () => {
    expect(decideRedirect({ pathname: "/login", search: "?next=%2Faccount", isAuthed: true })).toBe("/account");
    expect(decideRedirect({ pathname: "/login", search: "", isAuthed: true })).toBe("/projects");
  });

  it("로그인 + /login?next=외부 주소는 /projects로", () => {
    expect(decideRedirect({ pathname: "/login", search: "?next=https%3A%2F%2Fevil.com", isAuthed: true })).toBe("/projects");
    expect(decideRedirect({ pathname: "/login", search: "?next=%2F%2Fevil.com", isAuthed: true })).toBe("/projects");
  });

  it("비로그인 + /login → 홈으로, next·error 쿼리 유지", () => {
    expect(decideRedirect({ pathname: "/login", search: "", isAuthed: false })).toBe("/");
    expect(decideRedirect({ pathname: "/login", search: "?next=%2Faccount&error=auth", isAuthed: false })).toBe("/?next=%2Faccount&error=auth");
  });

  it("로그인 + 홈 → next 또는 /projects (외부 주소·홈 자신은 /projects)", () => {
    expect(decideRedirect({ pathname: "/", search: "", isAuthed: true })).toBe("/projects");
    expect(decideRedirect({ pathname: "/", search: "?next=%2Fprojects%2F1", isAuthed: true })).toBe("/projects/1");
    expect(decideRedirect({ pathname: "/", search: "?next=%2F%2Fevil.com", isAuthed: true })).toBe("/projects");
    expect(decideRedirect({ pathname: "/", search: "?next=%2F", isAuthed: true })).toBe("/projects");
  });

  it("이동 끝점은 다시 이동하지 않는다 (루프 없음)", () => {
    for (const isAuthed of [true, false]) {
      for (const pathname of ["/", "/login", "/projects", "/account"]) {
        const to = decideRedirect({ pathname, search: "?next=%2Fprojects", isAuthed });
        if (!to) continue;
        const u = new URL(to, "http://localhost");
        const again = decideRedirect({ pathname: u.pathname, search: u.search, isAuthed });
        if (again) expect(decideRedirect({ pathname: new URL(again, "http://localhost").pathname, search: new URL(again, "http://localhost").search, isAuthed })).toBeNull();
      }
    }
  });

  it("그 외는 이동 없음", () => {
    expect(decideRedirect({ pathname: "/projects", search: "", isAuthed: true })).toBeNull();
    expect(decideRedirect({ pathname: "/", search: "", isAuthed: false })).toBeNull();
    expect(decideRedirect({ pathname: "/api/draft", search: "", isAuthed: false })).toBeNull();
  });
});
