import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBlueprintRevision, listBlueprintRevisions, loadBlueprint, saveBlueprint } from "./blueprints";
import { fakeDb } from "./fake-db";

const sample = () => JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"));
const find = (calls: unknown[][], name: string) => calls.filter((c) => c[0] === name);
const written = { revision: 3, updated_at: "2026-10-29T02:00:00Z" };
const dbRow = (b = sample()) => ({ version: b.version, title: b.title, stack: b.stack, route: b.route, source: b.source, generated_by: b.generatedBy, nodes: b.nodes });

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

describe("saveBlueprint (최근 판 갱신)", () => {
  it("최근 판이 있으면 그 행을 update한다(snake_case, nodes는 평면 배열 그대로, children 없음)", async () => {
    const { db, calls } = fakeDb({ data: { id: "bp-latest" } }, { data: written });
    const r = await saveBlueprint(db, "p1", sample());
    expect(r).toEqual({ ok: true, data: { revision: 3, updatedAt: written.updated_at } });
    expect(find(calls, "insert")).toEqual([]);
    expect(find(calls, "eq")).toContainEqual(["eq", "id", "bp-latest"]);
    const payload = find(calls, "update")[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ version: "1.2", generated_by: sample().generatedBy });
    expect(payload).not.toHaveProperty("project_id"); // 소유 프로젝트는 바꾸지 않는다
    expect(JSON.stringify(payload.nodes)).not.toContain('"children"');
    expect(payload.nodes).toEqual(sample().nodes);
  });

  it("판이 하나도 없으면 첫 판을 insert한다(revision은 보내지 않음)", async () => {
    const { db, calls } = fakeDb({ data: null }, { data: { revision: 1, updated_at: "t" } });
    const r = await saveBlueprint(db, "p1", sample());
    expect(r).toMatchObject({ ok: true, data: { revision: 1 } });
    const payload = find(calls, "insert")[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ project_id: "p1" });
    expect(payload).not.toHaveProperty("revision");
    expect(find(calls, "update")).toEqual([]);
  });

  it("스키마 위반이면 DB를 호출하지 않고 invalid_data + 필드 경로", async () => {
    const bad = sample();
    bad.nodes[1].name = "productGallery";
    const { db, calls } = fakeDb();
    const r = await saveBlueprint(db, "p1", bad);
    expect(r).toMatchObject({ ok: false, kind: "invalid_data", fields: [{ path: "nodes.1.name" }] });
    expect(calls).toEqual([]);
  });

  it("RLS 거부(42501)·행 없음(PGRST116)은 not_found", async () => {
    for (const code of ["42501", "PGRST116"]) {
      const r = await saveBlueprint(fakeDb({ data: null }, { error: { code } }).db, "someone-elses", sample());
      expect(r).toMatchObject({ ok: false, kind: "not_found" });
    }
  });

  it("그 외 DB 오류는 unavailable", async () => {
    expect(await saveBlueprint(fakeDb({ error: { code: "XX000" } }).db, "p1", sample())).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("createBlueprintRevision (새 판 추가)", () => {
  it("insert만 하고 revision·user_id는 보내지 않는다", async () => {
    const { db, calls } = fakeDb({ data: written });
    const r = await createBlueprintRevision(db, "p1", sample());
    expect(r).toEqual({ ok: true, data: { revision: 3, updatedAt: written.updated_at } });
    const payload = find(calls, "insert")[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ project_id: "p1" });
    expect(payload).not.toHaveProperty("revision");
    expect(payload).not.toHaveProperty("user_id");
    expect(find(calls, "update")).toEqual([]);
  });

  it("스키마 위반이면 DB 미호출, 동시 저장 충돌(23505)은 unavailable", async () => {
    const bad = { ...sample(), nodes: [] };
    const a = fakeDb();
    expect(await createBlueprintRevision(a.db, "p1", bad)).toMatchObject({ ok: false, kind: "invalid_data" });
    expect(a.calls).toEqual([]);
    expect(await createBlueprintRevision(fakeDb({ error: { code: "23505" } }).db, "p1", sample())).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("loadBlueprint", () => {
  it("기본값은 가장 최근 판(revision 내림차순 1개)이고 camelCase 설계도로 돌려준다", async () => {
    const { db, calls } = fakeDb({ data: dbRow() });
    const r = await loadBlueprint(db, "p1");
    expect(find(calls, "order")).toEqual([["order", "revision", { ascending: false }]]);
    expect(find(calls, "limit")).toEqual([["limit", 1]]);
    expect(r).toEqual({ ok: true, data: sample() });
  });

  it("revision을 지정하면 그 판을 조회한다", async () => {
    const { db, calls } = fakeDb({ data: dbRow() });
    await loadBlueprint(db, "p1", { revision: 2 });
    expect(find(calls, "eq")).toContainEqual(["eq", "revision", 2]);
    expect(find(calls, "order")).toEqual([]);
  });

  it("판이 없으면 data가 null", async () => {
    expect(await loadBlueprint(fakeDb({ data: null }).db, "p1")).toEqual({ ok: true, data: null });
  });

  it("저장된 값이 스키마에 맞지 않으면 그대로 돌려주지 않고 invalid_data", async () => {
    const broken = dbRow();
    (broken.nodes as { parentId: string | null }[])[1].parentId = "missing";
    expect(await loadBlueprint(fakeDb({ data: broken }).db, "p1")).toMatchObject({ ok: false, kind: "invalid_data" });
  });

  it("DB 오류는 unavailable, RLS 거부는 not_found", async () => {
    expect(await loadBlueprint(fakeDb({ error: { code: "XX000" } }).db, "p1")).toMatchObject({ ok: false, kind: "unavailable" });
    expect(await loadBlueprint(fakeDb({ error: { code: "42501" } }).db, "p1")).toMatchObject({ ok: false, kind: "not_found" });
  });
});

describe("listBlueprintRevisions", () => {
  it("최신 판부터 요약만 돌려준다(nodes 미요청)", async () => {
    const { db, calls } = fakeDb({ data: [
      { id: "b2", revision: 2, title: "t", generated_by: "user", created_at: "c2", updated_at: "u2" },
      { id: "b1", revision: 1, title: "t", generated_by: "ai", created_at: "c1", updated_at: "u1" },
    ] });
    const r = await listBlueprintRevisions(db, "p1");
    expect(find(calls, "order")).toEqual([["order", "revision", { ascending: false }]]);
    expect(String(find(calls, "select")[0][1])).not.toContain("nodes");
    expect(r).toMatchObject({ ok: true, data: [{ id: "b2", revision: 2, generatedBy: "user" }, { id: "b1", revision: 1, generatedBy: "ai" }] });
  });

  it("DB 오류는 unavailable", async () => {
    expect(await listBlueprintRevisions(fakeDb({ error: { code: "XX000" } }).db, "p1")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});
