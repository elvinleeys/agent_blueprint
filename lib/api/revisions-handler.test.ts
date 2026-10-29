import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBlueprintRevision, listBlueprintRevisions } from "../db/blueprints";
import { getProject } from "../db/projects";
import { handleRevisionsGet, handleRevisionsPost } from "./revisions-handler";
import { requireSession } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ requireSession: vi.fn() }));
vi.mock("../db/blueprints", () => ({ createBlueprintRevision: vi.fn(), listBlueprintRevisions: vi.fn() }));
vi.mock("../db/projects", () => ({ getProject: vi.fn() }));

const db = {} as never;
const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const unauthorized = new Response("{}", { status: 401 });
const get = () => new Request(`http://localhost/api/projects/${ID}/revisions`);
const post = (body: unknown) =>
  new Request(`http://localhost/api/projects/${ID}/revisions`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.mocked(requireSession).mockReset().mockResolvedValue({ ok: true, db, userId: "u1" });
  vi.mocked(getProject).mockReset().mockResolvedValue({ ok: true, data: {} as never });
  vi.mocked(createBlueprintRevision).mockReset();
  vi.mocked(listBlueprintRevisions).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/projects/[id]/revisions", () => {
  it("세션이 없으면 401, uuid가 아니면 400, DB 미호출", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce({ ok: false, response: unauthorized });
    expect((await handleRevisionsGet(get(), ctx())).status).toBe(401);
    expect((await handleRevisionsGet(get(), ctx("x"))).status).toBe(400);
    expect(listBlueprintRevisions).not.toHaveBeenCalled();
  });

  it("판 목록 200(최신 순 요약), 판이 없으면 빈 배열", async () => {
    const revisions = [{ id: "b2", revision: 2, title: "t", generatedBy: "user", createdAt: "c", updatedAt: "u" }];
    vi.mocked(listBlueprintRevisions).mockResolvedValue({ ok: true, data: revisions as never });
    expect(await (await handleRevisionsGet(get(), ctx())).json()).toEqual({ revisions });
    vi.mocked(listBlueprintRevisions).mockResolvedValue({ ok: true, data: [] });
    expect(await (await handleRevisionsGet(get(), ctx())).json()).toEqual({ revisions: [] });
  });

  it("DB 오류는 503", async () => {
    vi.mocked(listBlueprintRevisions).mockResolvedValue({ ok: false, kind: "unavailable", message: "m" });
    expect((await handleRevisionsGet(get(), ctx())).status).toBe(503);
  });
});

describe("GET /api/projects/[id]/revisions 소유 확인", () => {
  it("없거나 남의 프로젝트는 404이고 판 목록을 조회하지 않는다", async () => {
    vi.mocked(getProject).mockResolvedValue({ ok: false, kind: "not_found", message: "m" });
    const res = await handleRevisionsGet(get(), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(listBlueprintRevisions).not.toHaveBeenCalled();
  });

  it("프로젝트 조회가 DB 오류면 503", async () => {
    vi.mocked(getProject).mockResolvedValue({ ok: false, kind: "unavailable", message: "m" });
    expect((await handleRevisionsGet(get(), ctx())).status).toBe(503);
  });
});

describe("POST /api/projects/[id]/revisions", () => {
  const blueprint = { title: "상품 상세" };

  it("세션이 없으면 401, uuid가 아니면 400, DB 미호출", async () => {
    vi.mocked(requireSession).mockResolvedValueOnce({ ok: false, response: unauthorized });
    expect((await handleRevisionsPost(post(blueprint), ctx())).status).toBe(401);
    expect((await handleRevisionsPost(post(blueprint), ctx("x"))).status).toBe(400);
    expect(createBlueprintRevision).not.toHaveBeenCalled();
  });

  it("새 판 추가 201 { revision, updatedAt }", async () => {
    vi.mocked(createBlueprintRevision).mockResolvedValue({ ok: true, data: { revision: 3, updatedAt: "t" } });
    const res = await handleRevisionsPost(post(blueprint), ctx());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ revision: 3, updatedAt: "t" });
    expect(createBlueprintRevision).toHaveBeenCalledWith(db, ID, blueprint);
  });

  it("스키마 위반 422, 남의 프로젝트 404, 동시 추가 충돌은 503(재시도 안내)", async () => {
    vi.mocked(createBlueprintRevision).mockResolvedValueOnce({ ok: false, kind: "invalid_data", message: "m", fields: [{ path: "nodes", message: "x" }] });
    expect((await handleRevisionsPost(post(blueprint), ctx())).status).toBe(422);
    vi.mocked(createBlueprintRevision).mockResolvedValueOnce({ ok: false, kind: "not_found", message: "m" });
    expect((await handleRevisionsPost(post(blueprint), ctx())).status).toBe(404);
    vi.mocked(createBlueprintRevision).mockResolvedValueOnce({ ok: false, kind: "unavailable", message: "m" });
    const res = await handleRevisionsPost(post(blueprint), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error.retryable).toBe(true);
  });
});
