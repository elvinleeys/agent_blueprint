import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./fake-db";
import { loadLatestBlueprintRef, loadLatestExportContent, loadLatestExportedRevision, savePromptExport } from "./prompt-exports";

const find = (calls: unknown[][], name: string) => calls.filter((c) => c[0] === name);

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

describe("savePromptExport", () => {
  it("설계도 판과 연결해 insert한다(snake_case, source_type blueprint)", async () => {
    const { db, calls } = fakeDb({});
    expect(await savePromptExport(db, "p1", { blueprintId: "b1", format: "prompt", content: "본문" })).toEqual({ ok: true, data: null });
    expect(find(calls, "insert")[0][1]).toEqual({ project_id: "p1", blueprint_id: "b1", format: "prompt", source_type: "blueprint", content: "본문" });
  });

  it("빈 내용·너무 긴 내용·모르는 형식은 DB를 부르지 않고 invalid_data", async () => {
    for (const bad of [{ content: "" }, { content: "x".repeat(200001) }, { format: "pdf" }]) {
      const { db, calls } = fakeDb();
      const r = await savePromptExport(db, "p1", { blueprintId: "b1", format: "prompt", content: "a", ...bad } as never);
      expect(r).toMatchObject({ ok: false, kind: "invalid_data" });
      expect(calls).toEqual([]);
    }
  });

  it("RLS 거부는 not_found, 그 외 오류는 unavailable", async () => {
    const input = { blueprintId: "b1", format: "claude_md" as const, content: "a" };
    expect(await savePromptExport(fakeDb({ error: { code: "42501" } }).db, "p1", input)).toMatchObject({ ok: false, kind: "not_found" });
    expect(await savePromptExport(fakeDb({ error: { code: "XX000" } }).db, "p1", input)).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("loadLatestBlueprintRef", () => {
  it("revision 내림차순 첫 행의 id·번호를 돌려준다", async () => {
    const { db, calls } = fakeDb({ data: { id: "b9", revision: 9 } });
    expect(await loadLatestBlueprintRef(db, "p1")).toEqual({ ok: true, data: { id: "b9", revision: 9 } });
    expect(find(calls, "order")[0]).toEqual(["order", "revision", { ascending: false }]);
  });
  it("판이 없으면 null, DB 오류는 unavailable", async () => {
    expect(await loadLatestBlueprintRef(fakeDb({ data: null }).db, "p1")).toEqual({ ok: true, data: null });
    expect(await loadLatestBlueprintRef(fakeDb({ error: { code: "XX000" } }).db, "p1")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("loadLatestExportedRevision (구현 검사의 기준 판)", () => {
  it("이 프로젝트에서 가장 최근에 내보낸 기록의 판 번호를 돌려준다", async () => {
    const { db, calls } = fakeDb({ data: { blueprint_id: "b3" } }, { data: { revision: 3 } });
    expect(await loadLatestExportedRevision(db, "p1")).toEqual({ ok: true, data: 3 });
    expect(find(calls, "eq")).toEqual([["eq", "project_id", "p1"], ["eq", "source_type", "blueprint"], ["eq", "id", "b3"], ["eq", "project_id", "p1"]]);
    expect(find(calls, "order")[0]).toEqual(["order", "created_at", { ascending: false }]);
  });
  it("내보낸 기록이 없으면 null(판은 조회하지 않음), DB 오류는 unavailable", async () => {
    const none = fakeDb({ data: null });
    expect(await loadLatestExportedRevision(none.db, "p1")).toEqual({ ok: true, data: null });
    expect(find(none.calls, "from").map((c) => c[1])).toEqual(["prompt_exports"]);
    expect(await loadLatestExportedRevision(fakeDb({ error: { code: "XX000" } }).db, "p1")).toMatchObject({ ok: false, kind: "unavailable" });
    expect(await loadLatestExportedRevision(fakeDb({ data: { blueprint_id: "b3" } }, { error: { code: "XX000" } }).db, "p1")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("loadLatestExportContent", () => {
  it("그 판·그 형식의 가장 최근 내용을 돌려준다", async () => {
    const { db, calls } = fakeDb({ data: { content: "이전" } });
    expect(await loadLatestExportContent(db, "b1", "prompt")).toEqual({ ok: true, data: "이전" });
    expect(find(calls, "eq")).toEqual([["eq", "blueprint_id", "b1"], ["eq", "format", "prompt"]]);
    expect(find(calls, "order")[0]).toEqual(["order", "created_at", { ascending: false }]);
  });
  it("없으면 null, DB 오류는 unavailable", async () => {
    expect(await loadLatestExportContent(fakeDb({ data: null }).db, "b1", "prompt")).toEqual({ ok: true, data: null });
    expect(await loadLatestExportContent(fakeDb({ error: { code: "XX000" } }).db, "b1", "prompt")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});
