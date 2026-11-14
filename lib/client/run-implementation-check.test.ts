import { describe, expect, it, vi } from "vitest";
import type { ConfirmedPair } from "../../core/impl-check/types";
import { checkWithAutoRemoval, runImplementationCheck, type CheckOutcome } from "./run-implementation-check";

const files = [{ path: "src/A.tsx", content: "export const A = 1;" }];
const A: ConfirmedPair = { nodeId: "a", path: "src/A.tsx", name: "A" };
const B: ConfirmedPair = { nodeId: "b", path: "src/B.tsx", name: "B" };
const C: ConfirmedPair = { nodeId: "c", path: "src/C.tsx", name: "C" };

const OK: CheckOutcome = { ok: true, data: { baseline: { revision: 1, source: "latest" }, result: { items: [], bans: [], findings: [], summary: { design: { total: 0, match: 0, mismatch: 0, review: 0 }, ban: { violated: 0, unknown: 0 }, outsideDesign: 0, outOfScope: [] } }, pairReviews: [], meta: { timing: { totalMs: 1, requestNumber: 1, first: true }, files: 1, bytes: 1, nodes: 0, confirmedApplied: 0, configs: { read: 0, unsupported: 0 } } } };
const invalid = (...items: { index: number; nodeId: string; reason: string; removable: boolean }[]): CheckOutcome => ({ ok: false, failure: { message: "확정한 짝이 올바르지 않습니다.", details: [], retryable: false, code: "invalid_confirmed", invalid: items } });
const other = (code: string): CheckOutcome => ({ ok: false, failure: { message: code, details: [], retryable: false, code } });

describe("checkWithAutoRemoval: 유효하지 않은 확정 짝만 빼고 한 번만 다시 검사", () => {
  it("성공하면 그대로 돌려주고 다시 검사하지 않는다", async () => {
    const run = vi.fn(async () => OK);
    const r = await checkWithAutoRemoval(run, [A, B]);
    expect(r).toMatchObject({ outcome: OK, removed: [], confirmed: [A, B] });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("코드·설계도가 바뀐 사유(없는 코드·없는 노드·이미 확실한 짝)만이면 그 짝만 빼고 나머지로 한 번 다시 검사한다", async () => {
    const run = vi.fn(async (c: ConfirmedPair[]) => (c.length === 3 ? invalid({ index: 1, nodeId: "b", reason: "unknown-code", removable: true }, { index: 2, nodeId: "c", reason: "already-certain-node", removable: true }) : OK));
    const r = await checkWithAutoRemoval(run, [A, B, C]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(2, [A]);
    expect(r.outcome).toBe(OK);
    expect(r.removed).toEqual([{ nodeId: "b", reason: "unknown-code" }, { nodeId: "c", reason: "already-certain-node" }]);
    expect(r.confirmed).toEqual([A]);
  });

  it("없는 노드·남의 확실한 짝인 코드도 자동으로 뺀다", async () => {
    const run = vi.fn(async (c: ConfirmedPair[]) => (c.length === 2 ? invalid({ index: 0, nodeId: "a", reason: "unknown-node", removable: true }, { index: 1, nodeId: "b", reason: "code-taken", removable: true }) : OK));
    const r = await checkWithAutoRemoval(run, [A, B]);
    expect(run).toHaveBeenNthCalledWith(2, []);
    expect(r.removed.map((x) => x.reason)).toEqual(["unknown-node", "code-taken"]);
  });

  it("중복·종류 불일치가 하나라도 섞이면 아무것도 빼지 않고 다시 검사하지 않고 오류로 돌려준다", async () => {
    const failing = invalid({ index: 0, nodeId: "a", reason: "unknown-code", removable: true }, { index: 1, nodeId: "b", reason: "duplicate-node", removable: false });
    const run = vi.fn(async () => failing);
    const r = await checkWithAutoRemoval(run, [A, B]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ outcome: failing, removed: [], confirmed: [A, B] });
    const kind = invalid({ index: 0, nodeId: "a", reason: "kind-mismatch", removable: false });
    expect((await checkWithAutoRemoval(async () => kind, [A])).removed).toEqual([]);
  });

  it("다시 검사해서도 실패하면 그 오류를 그대로 돌려주고 더 시도하지 않는다(한 번만)", async () => {
    const again = other("no_blueprint");
    const run = vi.fn(async (c: ConfirmedPair[]) => (c.length === 2 ? invalid({ index: 1, nodeId: "b", reason: "unknown-code", removable: true }) : again));
    const r = await checkWithAutoRemoval(run, [A, B]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.outcome).toBe(again);
    expect(r.removed).toEqual([{ nodeId: "b", reason: "unknown-code" }]);
  });

  it("다시 검사에서 또 invalid_confirmed가 와도 다시 빼지 않는다", async () => {
    const run = vi.fn(async () => invalid({ index: 0, nodeId: "a", reason: "unknown-code", removable: true }));
    const r = await checkWithAutoRemoval(run, [A, B]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.outcome.ok).toBe(false);
  });

  it("확정 짝 문제가 아닌 422(판 없음 등)는 빼지 않고 그대로 돌려준다", async () => {
    for (const code of ["no_blueprint", "unsupported_stack", "invalid_input"]) {
      const run = vi.fn(async () => other(code));
      const r = await checkWithAutoRemoval(run, [A]);
      expect(run).toHaveBeenCalledTimes(1);
      expect(r.removed).toEqual([]);
      expect(r.confirmed).toEqual([A]);
    }
  });

  it("invalid_confirmed인데 invalid 목록이 없으면 빼지 않는다", async () => {
    const run = vi.fn(async () => other("invalid_confirmed"));
    await checkWithAutoRemoval(run, [A]);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("runImplementationCheck: 요청과 오류 변환", () => {
  const res = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("confirmed가 없으면 { codeFiles }만, 있으면 함께 보낸다", async () => {
    const f = vi.fn((url: string, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(OK.ok ? OK.data : {}), { status: 200 })).then((r) => (void url, void init, r)));
    await runImplementationCheck("p1", files, [], f as unknown as typeof fetch);
    await runImplementationCheck("p1", files, [A], f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toBe("/api/projects/p1/implementation-check");
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual({ codeFiles: files });
    expect(JSON.parse(f.mock.calls[1][1]!.body as string)).toEqual({ codeFiles: files, confirmed: [A] });
  });

  it("GitHub 저장소는 { repo }로 보내고(codeFiles 없음), 확정한 짝과 함께 보낼 수 있다. 서버의 403·429 문구를 그대로 보인다", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(OK.ok && OK.data), { status: 200 }));
    await runImplementationCheck("p1", { url: "https://github.com/acme/shop", subdir: null }, [], f as unknown as typeof fetch);
    await runImplementationCheck("p1", { url: "https://github.com/acme/shop", subdir: "apps/web", commit: "a".repeat(40) }, [A], f as unknown as typeof fetch);
    const bodies = f.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies).toEqual([{ repo: { url: "https://github.com/acme/shop", subdir: null } }, { repo: { url: "https://github.com/acme/shop", subdir: "apps/web", commit: "a".repeat(40) }, confirmed: [A] }]);

    const res = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const restricted = await runImplementationCheck("p1", { url: "https://github.com/acme/shop" }, [], res(403, { error: { code: "feature_restricted", message: "GitHub 저장소 검사는 현재 제한된 기능입니다.", retryable: false } }));
    expect(restricted).toEqual({ ok: false, failure: { message: "GitHub 저장소 검사는 현재 제한된 기능입니다.", details: [], retryable: false, code: "feature_restricted" } });
    const limited = await runImplementationCheck("p1", { url: "https://github.com/acme/shop" }, [], res(429, { error: { code: "rate_limited", message: "GitHub 요청 한도에 걸렸습니다. 2분 뒤 다시 시도해 주세요.", retryable: true } }));
    expect(limited).toMatchObject({ ok: false, failure: { message: "GitHub 요청 한도에 걸렸습니다. 2분 뒤 다시 시도해 주세요.", retryable: true } });
  });

  it("invalid_confirmed의 code·invalid·fields를 구분해 담고, 다른 422는 invalid가 없다", async () => {
    const inv = [{ index: 0, nodeId: "a", reason: "unknown-code", removable: true }];
    const a = await runImplementationCheck("p1", files, [A], res(422, { error: { code: "invalid_confirmed", message: "m", retryable: false, fields: [{ path: "confirmed[0]", message: "올린 코드에 없는 컴포넌트·훅입니다." }], invalid: inv } }));
    expect(a).toEqual({ ok: false, failure: { message: "m", details: ["올린 코드에 없는 컴포넌트·훅입니다."], retryable: false, code: "invalid_confirmed", invalid: inv } });
    const b = await runImplementationCheck("p1", files, [A], res(422, { error: { code: "no_blueprint", message: "검사할 설계도가 없습니다.", retryable: false } }));
    expect(b).toEqual({ ok: false, failure: { message: "검사할 설계도가 없습니다.", details: [], retryable: false, code: "no_blueprint" } });
  });

  it("401·404·네트워크 실패·본문이 JSON이 아님·형식이 다른 성공 응답을 사용자용 문구로 바꾼다", async () => {
    expect(((await runImplementationCheck("p1", files, [], res(401, {}))) as { failure: { message: string } }).failure.message).toContain("로그인");
    expect(((await runImplementationCheck("p1", files, [], res(404, {}))) as { failure: { message: string } }).failure.message).toContain("찾을 수 없습니다");
    const net = (await runImplementationCheck("p1", files, [], (async () => { throw new Error("x"); }) as unknown as typeof fetch)) as { failure: { retryable: boolean } };
    expect(net.failure.retryable).toBe(true);
    const text = (await runImplementationCheck("p1", files, [], (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch)) as { failure: { message: string; retryable: boolean } };
    expect(text.failure).toMatchObject({ retryable: true });
    expect((await runImplementationCheck("p1", files, [], res(200, { result: {} }))).ok).toBe(false);
  });
});
