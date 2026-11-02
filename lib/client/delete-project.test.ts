import { describe, expect, it, vi } from "vitest";
import { canConfirmDelete, requestDeleteProject } from "./delete-project";

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

describe("canConfirmDelete", () => {
  it("이름을 그대로 다시 입력해야 한다(앞뒤 공백만 무시, 대소문자·일부 일치는 불가)", () => {
    expect(canConfirmDelete("내 프로젝트", "내 프로젝트")).toBe(true);
    expect(canConfirmDelete("  내 프로젝트 ", "내 프로젝트")).toBe(true);
    expect(canConfirmDelete("내 프로", "내 프로젝트")).toBe(false);
    expect(canConfirmDelete("My App", "my app")).toBe(false);
    expect(canConfirmDelete("", "")).toBe(false);
  });
});

describe("requestDeleteProject", () => {
  it("DELETE로 요청하고 성공이면 done", async () => {
    const fetchFn = vi.fn(async () => json({ id: "p1" }, 200));
    expect(await requestDeleteProject("p1", fetchFn as never)).toEqual({ kind: "done" });
    expect(fetchFn).toHaveBeenCalledWith("/api/projects/p1", { method: "DELETE" });
  });

  it("401은 로그인 안내, 서버 문구는 그대로, 본문이 없으면 일반 문구, 네트워크 오류는 연결 안내", async () => {
    expect(await requestDeleteProject("p", (async () => json({}, 401)) as never)).toMatchObject({ kind: "failed", needsLogin: true });
    expect(await requestDeleteProject("p", (async () => json({ error: { message: "대상을 찾을 수 없습니다." } }, 404)) as never)).toMatchObject({ message: "대상을 찾을 수 없습니다." });
    expect(await requestDeleteProject("p", (async () => new Response("<html>", { status: 500 })) as never)).toMatchObject({ message: expect.stringContaining("삭제하지 못했습니다") });
    expect(await requestDeleteProject("p", (async () => Promise.reject(new Error("net"))) as never)).toMatchObject({ message: expect.stringContaining("네트워크") });
  });
});
