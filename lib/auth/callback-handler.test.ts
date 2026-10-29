import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../supabase/server";
import { handleAuthCallback } from "./callback-handler";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));

const exchange = vi.fn();
const call = (qs: string) => handleAuthCallback(new Request(`http://localhost:3000/auth/callback${qs}`));
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  exchange.mockReset().mockResolvedValue({ error: null });
  vi.mocked(createClient).mockResolvedValue({ auth: { exchangeCodeForSession: exchange } } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handleAuthCallback", () => {
  it("code가 없으면 /login?error=auth이고 교환을 시도하지 않는다", async () => {
    const res = await call("");
    expect(location(res)).toBe("http://localhost:3000/login?error=auth");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("교환이 실패하면 /login?error=auth", async () => {
    exchange.mockResolvedValue({ error: { name: "AuthApiError", message: "bad code" } });
    expect(location(await call("?code=x&next=%2Faccount"))).toBe("http://localhost:3000/login?error=auth");
  });

  it("예외가 나도 /login?error=auth이고 원본 문구는 로그에 남기지 않는다", async () => {
    vi.mocked(createClient).mockRejectedValue(new Error("secret detail"));
    expect(location(await call("?code=x"))).toBe("http://localhost:3000/login?error=auth");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("secret detail");
  });

  it("성공하면 code로 교환하고 next 경로로 이동한다(쿼리 유지)", async () => {
    const res = await call("?code=abc&next=%2Fprojects%3Ftab%3D1");
    expect(exchange).toHaveBeenCalledWith("abc");
    expect(location(res)).toBe("http://localhost:3000/projects?tab=1");
  });

  it("next가 없으면 /projects", async () => {
    expect(location(await call("?code=abc"))).toBe("http://localhost:3000/projects");
  });

  it.each([["%2F%2Fevil.com"], ["https%3A%2F%2Fevil.com"], ["%2F%5Cevil.com"], ["javascript%3Aalert(1)"]])("next=%s 는 외부로 나가지 않고 /projects", async (next) => {
    expect(location(await call(`?code=abc&next=${next}`))).toBe("http://localhost:3000/projects");
  });
});
