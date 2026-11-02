import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecInput } from "../../core/schema/spec-input";
import { fakeDb } from "./fake-db";
import { loadSpecInput, saveSpecInput, saveSpecRoute } from "./spec-inputs";

const find = (calls: unknown[][], name: string) => calls.filter((c) => c[0] === name);
const spec = (over: Partial<SpecInput> = {}): SpecInput => ({ version: "1.2", imageCount: 0, overview: "상품 상세", stateData: "장바구니 개수", ...over });

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));

describe("saveSpecInput", () => {
  it("project_id 기준으로 덮어쓴다(upsert, 빈 항목은 null, 이미지는 개수만)", async () => {
    const { db, calls } = fakeDb({ error: null });
    const r = await saveSpecInput(db, "p1", { spec: spec({ tokens: "   ", imageCount: 2 }), route: "/products/[id]" });
    expect(r).toEqual({ ok: true, data: null });
    expect(find(calls, "from")[0][1]).toBe("spec_inputs");
    const [, row, options] = find(calls, "upsert")[0] as [string, Record<string, unknown>, unknown];
    expect(options).toEqual({ onConflict: "project_id" });
    expect(row).toEqual({
      project_id: "p1", version: "1.2",
      overview: "상품 상세", tokens: null, layout: null, component_rules: null, state_data: "장바구니 개수", accessibility: null, constraints: null,
      route: "/products/[id]", image_count: 2,
    });
    expect(JSON.stringify(row)).not.toContain("base64"); // 이미지 원본 열은 없다
  });

  it("화면 주소가 없으면 route는 null", async () => {
    const { db, calls } = fakeDb({ error: null });
    await saveSpecInput(db, "p1", { spec: spec(), route: null });
    expect((find(calls, "upsert")[0][1] as Record<string, unknown>).route).toBeNull();
  });

  it("DB 오류는 사용자용 메시지로 바꾸고 원문을 노출하지 않는다", async () => {
    const { db } = fakeDb({ error: { code: "XX000", name: "PostgresError" } });
    const r = await saveSpecInput(db, "p1", { spec: spec(), route: null });
    expect(r).toEqual({ ok: false, kind: "unavailable", message: "스펙 입력을 저장하지 못했습니다." });
  });

  it("남의 프로젝트(RLS 거부)는 not_found", async () => {
    const { db } = fakeDb({ error: { code: "42501" } });
    expect(await saveSpecInput(db, "p1", { spec: spec(), route: null })).toMatchObject({ ok: false, kind: "not_found" });
  });
});

describe("loadSpecInput", () => {
  const row = { overview: "상품 상세", tokens: null, layout: null, component_rules: null, state_data: "장바구니", accessibility: null, constraints: null, route: "/p", image_count: 1 };

  it("저장된 값을 입력칸 형태(camelCase, 있는 항목만)로 돌려준다", async () => {
    const { db, calls } = fakeDb({ data: row });
    const r = await loadSpecInput(db, "p1");
    expect(r).toEqual({ ok: true, data: { spec: { overview: "상품 상세", stateData: "장바구니" }, route: "/p", imageCount: 1 } });
    expect(find(calls, "eq")).toContainEqual(["eq", "project_id", "p1"]);
  });

  it("저장된 입력이 없으면 data가 null", async () => {
    const { db } = fakeDb({ data: null });
    expect(await loadSpecInput(db, "p1")).toEqual({ ok: true, data: null });
  });

  it("손상된 값은 invalid_data로 거절한다", async () => {
    const { db } = fakeDb({ data: { ...row, image_count: 9 } });
    expect(await loadSpecInput(db, "p1")).toMatchObject({ ok: false, kind: "invalid_data" });
  });

  it("DB 오류는 사용자용 메시지", async () => {
    const { db } = fakeDb({ error: { code: "XX000" } });
    expect(await loadSpecInput(db, "p1")).toMatchObject({ ok: false, kind: "unavailable" });
  });
});

describe("saveSpecRoute (보완 B)", () => {
  it("행이 있으면 route만 update하고 insert·upsert는 하지 않는다(스펙 항목·이미지 수 보존)", async () => {
    const { db, calls } = fakeDb({ data: [{ id: "s1" }] });
    expect(await saveSpecRoute(db, "p1", "/products/[id]")).toEqual({ ok: true, data: null });
    expect(find(calls, "update")).toEqual([["update", { route: "/products/[id]" }]]);
    expect(find(calls, "eq")).toContainEqual(["eq", "project_id", "p1"]);
    expect(find(calls, "insert")).toEqual([]);
    expect(find(calls, "upsert")).toEqual([]);
  });

  it("행이 없으면 빈 스펙으로 새로 만든다", async () => {
    const { db, calls } = fakeDb({ data: [] }, {});
    expect(await saveSpecRoute(db, "p1", "/p")).toEqual({ ok: true, data: null });
    expect(find(calls, "insert")[0][1]).toEqual({ project_id: "p1", version: "1.2", route: "/p", image_count: 0 });
  });

  it("null이면 주소를 지운다", async () => {
    const { db, calls } = fakeDb({ data: [{ id: "s1" }] });
    await saveSpecRoute(db, "p1", null);
    expect(find(calls, "update")).toEqual([["update", { route: null }]]);
  });

  it("형식이 틀리면 DB를 부르지 않고 invalid_data", async () => {
    for (const bad of ["products", "/a b", "", "/" + "x".repeat(200)]) {
      const { db, calls } = fakeDb();
      expect(await saveSpecRoute(db, "p1", bad)).toMatchObject({ ok: false, kind: "invalid_data" });
      expect(calls).toEqual([]);
    }
  });

  it("DB 오류는 unavailable, RLS 거부는 not_found", async () => {
    expect(await saveSpecRoute(fakeDb({ error: { code: "XX000" } }).db, "p1", "/p")).toMatchObject({ ok: false, kind: "unavailable" });
    expect(await saveSpecRoute(fakeDb({ data: [] }, { error: { code: "42501" } }).db, "p1", "/p")).toMatchObject({ ok: false, kind: "not_found" });
  });
});
