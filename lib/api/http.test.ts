import { describe, expect, it } from "vitest";
import type { DbFailure } from "../db/result";
import { dbFailureToHttp, isUuid, MAX_JSON_BYTES, readJson } from "./http";

const fail = (kind: DbFailure["kind"], extra: Partial<DbFailure> = {}): DbFailure => ({ ok: false, kind, message: "사용자용 문구", ...extra });
const req = (body: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers });

describe("dbFailureToHttp", () => {
  it.each([
    ["not_found", 404, "not_found", false],
    ["conflict", 409, "conflict", false],
    ["unavailable", 503, "db_unavailable", true],
  ] as const)("%s → %i %s", (kind, status, code, retryable) => {
    expect(dbFailureToHttp(fail(kind))).toEqual({ status, body: { error: { code, message: "사용자용 문구", retryable } } });
  });

  it("입력 스키마 위반(invalid_data)은 422와 필드 경로", () => {
    const e = dbFailureToHttp(fail("invalid_data", { fields: [{ path: "nodes.1.name", message: "x" }] }));
    expect(e).toMatchObject({ status: 422, body: { error: { code: "invalid_data", retryable: false, fields: [{ path: "nodes.1.name" }] } } });
  });

  it("DB에서 읽은 값이 손상(source: stored)이면 500 stored_data_invalid이고 필드 경로는 숨긴다", () => {
    const e = dbFailureToHttp(fail("invalid_data", { fields: [{ path: "nodes.1.name", message: "x" }] }), "stored");
    expect(e.status).toBe(500);
    expect(e.body.error.code).toBe("stored_data_invalid");
    expect(e.body.error).not.toHaveProperty("fields");
  });
});

describe("isUuid", () => {
  it("uuid 형식만 통과", () => {
    expect(isUuid("3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f")).toBe(true);
    for (const v of ["", "abc", "../etc", "3f2b8c1e9a4d4e0b8d7a1c2b3a4d5e6f", "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f; drop"]) expect(isUuid(v)).toBe(false);
  });
});

describe("readJson", () => {
  it("application/json 본문을 파싱한다", async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
  });

  it("content-type이 JSON이 아니면 400", async () => {
    const r = await readJson(req('{"a":1}', { "content-type": "text/plain" }));
    expect(r).toMatchObject({ ok: false, error: { status: 400, body: { error: { code: "invalid_input" } } } });
  });

  it("JSON이 깨졌으면 400", async () => {
    expect(await readJson(req("{oops"))).toMatchObject({ ok: false, error: { status: 400 } });
  });

  it("content-length가 1MB를 넘으면 본문을 읽기 전에 413", async () => {
    const r = await readJson(req("{}", { "content-type": "application/json", "content-length": String(MAX_JSON_BYTES + 1) }));
    expect(r).toMatchObject({ ok: false, error: { status: 413, body: { error: { code: "payload_too_large" } } } });
  });

  it("content-length가 없어도 실제 본문이 1MB를 넘으면 413", async () => {
    const big = JSON.stringify({ s: "a".repeat(MAX_JSON_BYTES) });
    expect(await readJson(req(big))).toMatchObject({ ok: false, error: { status: 413 } });
  });
});
