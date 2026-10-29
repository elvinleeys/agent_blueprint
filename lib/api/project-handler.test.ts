import { beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject } from "../db/projects";
import { handleProjectPatch } from "./project-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/projects", () => ({ renameProject: vi.fn() }));

const db = {} as never;
const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(`http://localhost/api/projects/${ID}`, { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body), headers });
const project = { id: ID, name: "새 이름" };

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "u1" });
  vi.mocked(renameProject).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/projects/[id]", () => {
  it("세션이 없으면 401이고 DB를 호출하지 않는다", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ok: false, response: new Response("{}", { status: 401 }) });
    expect((await handleProjectPatch(patch({ name: "x" }), ctx())).status).toBe(401);
    expect(renameProject).not.toHaveBeenCalled();
  });

  it("[id]가 uuid가 아니면 400", async () => {
    expect((await handleProjectPatch(patch({ name: "x" }), ctx("abc"))).status).toBe(400);
  });

  it("JSON이 아니면 400, 본문이 1MB를 넘으면 413", async () => {
    expect((await handleProjectPatch(patch("{}", { "content-type": "text/plain" }), ctx())).status).toBe(400);
    expect((await handleProjectPatch(patch({ name: "a".repeat(1024 * 1024) }), ctx())).status).toBe(413);
  });

  it.each([[{}], [{ name: 1 }], [{ name: "x", stack: {} }], [{ stack: {} }], [[]], [null]])("name 외 필드가 있거나 name이 문자열이 아니면 400: %j", async (body) => {
    expect((await handleProjectPatch(patch(body), ctx())).status).toBe(400);
    expect(renameProject).not.toHaveBeenCalled();
  });

  it("성공하면 200 { project }", async () => {
    vi.mocked(renameProject).mockResolvedValue({ ok: true, data: project as never });
    const res = await handleProjectPatch(patch({ name: "새 이름" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project });
    expect(renameProject).toHaveBeenCalledWith(db, ID, "새 이름");
  });

  it("빈 이름은 422 invalid_data(fields 포함)", async () => {
    vi.mocked(renameProject).mockResolvedValue({ ok: false, kind: "invalid_data", message: "프로젝트 이름은 1~100자여야 합니다.", fields: [{ path: "name", message: "1~100자" }] });
    const res = await handleProjectPatch(patch({ name: "  " }), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatchObject({ code: "invalid_data", fields: [{ path: "name" }] });
  });

  it("없거나 남의 프로젝트는 404", async () => {
    vi.mocked(renameProject).mockResolvedValue({ ok: false, kind: "not_found", message: "m" });
    expect((await handleProjectPatch(patch({ name: "x" }), ctx())).status).toBe(404);
  });

  it("DB 오류는 503", async () => {
    vi.mocked(renameProject).mockResolvedValue({ ok: false, kind: "unavailable", message: "m" });
    expect((await handleProjectPatch(patch({ name: "x" }), ctx())).status).toBe(503);
  });
});
