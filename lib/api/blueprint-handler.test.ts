import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBlueprint, saveBlueprint } from "../db/blueprints";
import { handleBlueprintGet, handleBlueprintPut } from "./blueprint-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/blueprints", () => ({ loadBlueprint: vi.fn(), saveBlueprint: vi.fn() }));

const db = {} as never;
const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const unauthorized = new Response("{}", { status: 401 });
const get = (qs = "") => new Request(`http://localhost/api/projects/${ID}/blueprint${qs}`);
const put = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(`http://localhost/api/projects/${ID}/blueprint`, { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body), headers });
const blueprint = { title: "상품 상세" };

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "u1" });
  vi.mocked(loadBlueprint).mockReset();
  vi.mocked(saveBlueprint).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/projects/[id]/blueprint", () => {
  it("세션이 없으면 401이고 DB를 호출하지 않는다", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ok: false, response: unauthorized });
    expect((await handleBlueprintGet(get(), ctx())).status).toBe(401);
    expect(loadBlueprint).not.toHaveBeenCalled();
  });

  it("[id]가 uuid가 아니면 400", async () => {
    expect((await handleBlueprintGet(get(), ctx("../x"))).status).toBe(400);
    expect(loadBlueprint).not.toHaveBeenCalled();
  });

  it("revision을 생략하면 최신 판을 조회한다", async () => {
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: true, data: blueprint as never });
    const res = await handleBlueprintGet(get(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ blueprint });
    expect(loadBlueprint).toHaveBeenCalledWith(db, ID, {});
  });

  it("revision을 지정하면 그 판을 조회한다", async () => {
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: true, data: blueprint as never });
    await handleBlueprintGet(get("?revision=2"), ctx());
    expect(loadBlueprint).toHaveBeenCalledWith(db, ID, { revision: 2 });
  });

  it.each([["?revision=0"], ["?revision=-1"], ["?revision=abc"], ["?revision=1.5"], ["?revision="]])("revision 형식이 틀리면 400: %s", async (qs) => {
    expect((await handleBlueprintGet(get(qs), ctx())).status).toBe(400);
    expect(loadBlueprint).not.toHaveBeenCalled();
  });

  it("판이 없는 새 프로젝트는 200 { blueprint: null }", async () => {
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: true, data: null });
    const res = await handleBlueprintGet(get(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ blueprint: null });
  });

  it("저장된 값이 손상됐으면 500 stored_data_invalid(필드 경로는 숨김)", async () => {
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: false, kind: "invalid_data", message: "저장된 설계도가 올바르지 않아 불러오지 못했습니다.", fields: [{ path: "nodes.1", message: "x" }] });
    const res = await handleBlueprintGet(get(), ctx());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("stored_data_invalid");
    expect(body.error).not.toHaveProperty("fields");
  });

  it("DB 오류는 503", async () => {
    vi.mocked(loadBlueprint).mockResolvedValue({ ok: false, kind: "unavailable", message: "잠시 후 다시 시도해 주세요." });
    expect((await handleBlueprintGet(get(), ctx())).status).toBe(503);
  });
});

describe("PUT /api/projects/[id]/blueprint", () => {
  it("세션이 없으면 401", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ok: false, response: unauthorized });
    expect((await handleBlueprintPut(put(blueprint), ctx())).status).toBe(401);
    expect(saveBlueprint).not.toHaveBeenCalled();
  });

  it("[id]가 uuid가 아니면 400, JSON이 아니면 400", async () => {
    expect((await handleBlueprintPut(put(blueprint), ctx("nope"))).status).toBe(400);
    expect((await handleBlueprintPut(put("{oops"), ctx())).status).toBe(400);
    expect((await handleBlueprintPut(put(blueprint, { "content-type": "text/plain" }), ctx())).status).toBe(400);
    expect(saveBlueprint).not.toHaveBeenCalled();
  });

  it("본문이 1MB를 넘으면 413", async () => {
    const res = await handleBlueprintPut(put({ s: "a".repeat(1024 * 1024) }), ctx());
    expect(res.status).toBe(413);
    expect(saveBlueprint).not.toHaveBeenCalled();
  });

  it("저장 성공 200 { revision, updatedAt }, 본문을 그대로 lib/db에 넘긴다", async () => {
    vi.mocked(saveBlueprint).mockResolvedValue({ ok: true, data: { revision: 2, updatedAt: "t" } });
    const res = await handleBlueprintPut(put(blueprint), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 2, updatedAt: "t" });
    expect(saveBlueprint).toHaveBeenCalledWith(db, ID, blueprint);
  });

  it("스키마 위반 422(필드 경로), 없거나 남의 프로젝트 404, 이전 판 보호 409", async () => {
    vi.mocked(saveBlueprint).mockResolvedValueOnce({ ok: false, kind: "invalid_data", message: "m", fields: [{ path: "nodes.1.name", message: "x" }] });
    const a = await handleBlueprintPut(put(blueprint), ctx());
    expect(a.status).toBe(422);
    expect((await a.json()).error.fields).toEqual([{ path: "nodes.1.name", message: "x" }]);

    vi.mocked(saveBlueprint).mockResolvedValueOnce({ ok: false, kind: "not_found", message: "대상을 찾을 수 없습니다." });
    expect((await handleBlueprintPut(put(blueprint), ctx())).status).toBe(404);

    vi.mocked(saveBlueprint).mockResolvedValueOnce({ ok: false, kind: "conflict", message: "이전 판은 수정할 수 없습니다." });
    expect((await handleBlueprintPut(put(blueprint), ctx())).status).toBe(409);
  });
});
