import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fake-db";
import { createProject, getProject, listProjects, renameProject } from "./projects";

const STACK = { framework: "next", styling: "tailwind", architecture: "feature-based" };
const row = { id: "p1", name: "내 프로젝트", framework: "next", styling: "tailwind", architecture: "feature-based", created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T01:00:00Z" };
const called = (calls: unknown[][], name: string) => calls.find((c) => c[0] === name);

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

describe("createProject", () => {
  it("name과 스택만 보내고 user_id는 보내지 않는다(DB가 auth.uid()로 채움)", async () => {
    const { db, calls } = fakeDb({ data: row });
    const r = await createProject(db, { name: "  내 프로젝트 ", stack: STACK });
    expect(called(calls, "from")).toEqual(["from", "projects"]);
    expect(called(calls, "insert")).toEqual(["insert", { name: "내 프로젝트", ...STACK }]);
    expect(r).toEqual({ ok: true, data: { id: "p1", name: "내 프로젝트", stack: STACK, createdAt: row.created_at, updatedAt: row.updated_at } });
  });

  it("이름이 비었거나 100자를 넘으면 DB를 호출하지 않고 invalid_data", async () => {
    for (const name of ["   ", "a".repeat(101)]) {
      const { db, calls } = fakeDb();
      const r = await createProject(db, { name, stack: STACK });
      expect(r).toMatchObject({ ok: false, kind: "invalid_data" });
      expect(calls).toEqual([]);
    }
  });

  it("스택 값이 올바르지 않으면 invalid_data(필드 경로 포함), DB 미호출", async () => {
    const { db, calls } = fakeDb();
    const r = await createProject(db, { name: "x", stack: { framework: "vue", styling: "tailwind", architecture: "fsd" } });
    expect(r).toMatchObject({ ok: false, kind: "invalid_data", fields: [{ path: "framework" }] });
    expect(calls).toEqual([]);
  });

  it("DB 오류는 unavailable과 한국어 메시지이며 원본 문구를 노출·로그하지 않는다", async () => {
    const { db } = fakeDb({ error: { code: "XX000", name: "PostgrestError", message: "secret detail" } as never });
    const r = await createProject(db, { name: "x", stack: STACK });
    expect(r).toEqual({ ok: false, kind: "unavailable", message: "프로젝트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요." });
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("secret detail");
  });
});

describe("listProjects", () => {
  it("최근 수정 순·최대 100개로 요청하고 camelCase로 변환한다", async () => {
    const { db, calls } = fakeDb({ data: [row] });
    const r = await listProjects(db);
    expect(called(calls, "order")).toEqual(["order", "updated_at", { ascending: false }]);
    expect(called(calls, "limit")).toEqual(["limit", 100]);
    expect(r).toMatchObject({ ok: true, data: [{ id: "p1", stack: STACK }] });
  });

  it("빈 목록도 정상", async () => {
    expect(await listProjects(fakeDb({ data: [] }).db)).toEqual({ ok: true, data: [] });
  });

  it("DB 오류는 unavailable", async () => {
    expect(await listProjects(fakeDb({ error: { code: "XX000" } }).db)).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("getProject", () => {
  it("id로 조회하고 camelCase로 변환한다", async () => {
    const { db, calls } = fakeDb({ data: row });
    const r = await getProject(db, "p1");
    expect(called(calls, "eq")).toEqual(["eq", "id", "p1"]);
    expect(r).toMatchObject({ ok: true, data: { id: "p1", stack: STACK } });
  });

  it("없거나 남의 프로젝트(행이 안 보임)는 not_found", async () => {
    expect(await getProject(fakeDb({ data: null }).db, "p1")).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("DB 오류는 unavailable", async () => {
    expect(await getProject(fakeDb({ error: { code: "XX000" } }).db, "p1")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("renameProject", () => {
  it("name만 갱신하고 trim한다", async () => {
    const { db, calls } = fakeDb({ data: { ...row, name: "새 이름" } });
    const r = await renameProject(db, "p1", "  새 이름 ");
    expect(called(calls, "update")).toEqual(["update", { name: "새 이름" }]);
    expect(called(calls, "eq")).toEqual(["eq", "id", "p1"]);
    expect(r).toMatchObject({ ok: true, data: { id: "p1", name: "새 이름", stack: STACK } });
  });

  it("빈 이름·100자 초과는 DB를 호출하지 않고 invalid_data", async () => {
    for (const name of ["   ", "a".repeat(101)]) {
      const { db, calls } = fakeDb();
      expect(await renameProject(db, "p1", name)).toMatchObject({ ok: false, kind: "invalid_data", fields: [{ path: "name" }] });
      expect(calls).toEqual([]);
    }
  });

  it("바뀐 행이 없으면(없거나 남의 프로젝트, RLS) not_found", async () => {
    expect(await renameProject(fakeDb({ data: null }).db, "p1", "x")).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("DB 오류는 unavailable", async () => {
    expect(await renameProject(fakeDb({ error: { code: "XX000", name: "PostgrestError" } }).db, "p1", "x")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});
