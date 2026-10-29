import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, listProjects } from "../db/projects";
import { handleProjectsGet, handleProjectsPost } from "./projects-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/projects", () => ({ createProject: vi.fn(), listProjects: vi.fn() }));

const db = {} as never;
const unauthorized = new Response(JSON.stringify({ error: { code: "unauthorized" } }), { status: 401 });
const STACK = { framework: "next", styling: "tailwind", architecture: "feature-based" } as const;
const project = { id: "p1", name: "내 프로젝트", stack: STACK, createdAt: "c", updatedAt: "u" };
const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/projects", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "u1" });
  vi.mocked(createProject).mockReset();
  vi.mocked(listProjects).mockReset();
});

describe("GET /api/projects", () => {
  it("세션이 없으면 401이고 DB를 호출하지 않는다", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ok: false, response: unauthorized });
    const res = await handleProjectsGet();
    expect(res.status).toBe(401);
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("목록 200 (빈 목록 포함)", async () => {
    vi.mocked(listProjects).mockResolvedValue({ ok: true, data: [project] });
    expect(await (await handleProjectsGet()).json()).toEqual({ projects: [project] });
    vi.mocked(listProjects).mockResolvedValue({ ok: true, data: [] });
    expect(await (await handleProjectsGet()).json()).toEqual({ projects: [] });
  });

  it("DB 오류는 503 retryable", async () => {
    vi.mocked(listProjects).mockResolvedValue({ ok: false, kind: "unavailable", message: "잠시 후 다시 시도해 주세요." });
    const res = await handleProjectsGet();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatchObject({ code: "db_unavailable", retryable: true });
  });
});

describe("POST /api/projects", () => {
  it("세션이 없으면 401이고 본문을 읽지도 DB를 호출하지도 않는다", async () => {
    vi.mocked(requireSession).mockResolvedValue({ ok: false, response: unauthorized });
    const res = await handleProjectsPost(post("not json"));
    expect(res.status).toBe(401);
    expect(createProject).not.toHaveBeenCalled();
  });

  it("생성 201, name·stack만 lib/db에 전달한다(user_id 없음)", async () => {
    vi.mocked(createProject).mockResolvedValue({ ok: true, data: project });
    const res = await handleProjectsPost(post({ name: "내 프로젝트", stack: STACK, user_id: "someone-else" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ project });
    expect(createProject).toHaveBeenCalledWith(db, { name: "내 프로젝트", stack: STACK });
  });

  it.each([[{ stack: STACK }], [{ name: 5, stack: STACK }], [null], [[]]])("name이 문자열이 아니거나 본문이 객체가 아니면 400: %j", async (body) => {
    const res = await handleProjectsPost(post(body));
    expect(res.status).toBe(400);
    expect(createProject).not.toHaveBeenCalled();
  });

  it("JSON이 아니면 400, 스키마 위반은 422와 필드 경로", async () => {
    expect((await handleProjectsPost(post("{oops"))).status).toBe(400);
    expect((await handleProjectsPost(post({ name: "x" }, { "content-type": "text/plain" }))).status).toBe(400);
    vi.mocked(createProject).mockResolvedValue({ ok: false, kind: "invalid_data", message: "스택 설정이 올바르지 않습니다.", fields: [{ path: "framework", message: "x" }] });
    const res = await handleProjectsPost(post({ name: "x", stack: {} }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields).toEqual([{ path: "framework", message: "x" }]);
  });
});
