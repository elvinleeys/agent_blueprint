import { describe, expect, it, vi } from "vitest";
import { runAnalyze } from "./run-analyze";

const files = [{ path: "src/ui/A.tsx", content: "export const A = () => <i/>;" }];
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("runAnalyze", () => {
  it("폴더 스펙: designSystemFolder로, JSON 스펙: specJson으로 보낸다", async () => {
    const f = reply(200, { result: { officialCount: 1 } });
    await runAnalyze(files, { kind: "folder", folder: "src/ui" }, f);
    await runAnalyze(files, { kind: "json", text: "{}" }, f);
    const calls = vi.mocked(f).mock.calls;
    expect(calls[0][0]).toBe("/api/analyze");
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ files, designSystemFolder: "src/ui" });
    expect(JSON.parse(calls[1][1]!.body as string)).toEqual({ files, specJson: "{}" });
  });

  it("성공하면 결과를 돌려준다", async () => {
    expect(await runAnalyze(files, { kind: "folder", folder: "x" }, reply(200, { result: { officialCount: 3 } }))).toEqual({ ok: true, result: { officialCount: 3 } });
  });

  it("서버 오류 문구와 스펙 오류 목록을 그대로 전한다", async () => {
    const f = reply(422, { error: { code: "invalid_spec", message: "스펙 JSON이 올바르지 않습니다.", retryable: false, fields: [{ path: "specJson", message: "tokens.color: 필수" }] } });
    expect(await runAnalyze(files, { kind: "json", text: "{}" }, f)).toEqual({ ok: false, failure: { message: "스펙 JSON이 올바르지 않습니다.", details: ["tokens.color: 필수"], retryable: false } });
  });

  it("401은 로그인 안내, 413은 서버 문구(더 좁은 폴더 안내)", async () => {
    const r401 = await runAnalyze(files, { kind: "folder", folder: "x" }, reply(401, { error: { code: "unauthorized", message: "로그인이 필요합니다.", retryable: false } }));
    expect(r401).toMatchObject({ ok: false, failure: { message: expect.stringContaining("로그인"), retryable: false } });
    const r413 = await runAnalyze(files, { kind: "folder", folder: "x" }, reply(413, { error: { code: "payload_too_large", message: "파일이 30개를 넘습니다. 더 좁은 폴더(예: src/components/ui)를 선택하세요.", retryable: false } }));
    expect(r413).toMatchObject({ ok: false, failure: { message: expect.stringContaining("더 좁은 폴더") } });
  });

  it("연결 실패·JSON이 아닌 응답은 다시 시도할 수 있는 오류로", async () => {
    const down = vi.fn(async () => Promise.reject(new TypeError("fail"))) as unknown as typeof fetch;
    expect(await runAnalyze(files, { kind: "folder", folder: "x" }, down)).toMatchObject({ ok: false, failure: { retryable: true } });
    const html = vi.fn(async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    expect(await runAnalyze(files, { kind: "folder", folder: "x" }, html)).toMatchObject({ ok: false, failure: { retryable: true, message: expect.stringContaining("502") } });
  });
});
