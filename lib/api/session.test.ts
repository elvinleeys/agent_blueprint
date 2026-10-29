import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../supabase/server";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));

const getClaims = vi.fn();
beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue({ auth: { getClaims } } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requireSession", () => {
  it("로그인되어 있으면 클라이언트와 사용자 id를 돌려준다", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    const s = await requireSession();
    expect(s).toMatchObject({ ok: true, userId: "u1" });
  });

  it.each([
    [{ data: null, error: { message: "no session" } }],
    [{ data: { claims: null }, error: null }],
  ])("세션이 없으면 401 JSON: %j", async (result) => {
    getClaims.mockResolvedValue(result);
    const s = await requireSession();
    expect(s.ok).toBe(false);
    if (!s.ok) {
      expect(s.response.status).toBe(401);
      expect((await s.response.json()).error.code).toBe("unauthorized");
    }
  });

  it("예외가 나면 500이고 원본 문구를 노출·로그하지 않는다", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("secret detail"));
    const s = await requireSession();
    expect(s.ok).toBe(false);
    if (!s.ok) {
      expect(s.response.status).toBe(500);
      expect(JSON.stringify(await s.response.json())).not.toContain("secret detail");
    }
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("secret detail");
  });
});
