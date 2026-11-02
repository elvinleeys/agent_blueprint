import { describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";
import { postExport, runExport, SAVE_FAILED_MESSAGE, type ExportData, type ExportOutcome } from "./run-export";

const data: ExportData = { revision: 2, specEmpty: false, documents: [{ format: "claude_md", fileName: "a.md", content: "규칙", recorded: true }, { format: "prompt", fileName: "a-prompt.md", content: "지시", recorded: true }] };
const done: ExportOutcome = { kind: "done", data };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("runExport 순서", () => {
  it("drain이 끝난 뒤에만 요청한다(drain → post)", async () => {
    const order: string[] = [];
    const drain = vi.fn(async () => (order.push("drain"), true));
    const post = vi.fn(async () => (order.push("post"), done));
    expect(await runExport({ drain, post })).toBe(done);
    expect(order).toEqual(["drain", "post"]);
  });

  it("drain이 아직 끝나지 않았으면 요청하지 않는다", async () => {
    let finish!: (v: boolean) => void;
    const post = vi.fn(async () => done);
    const running = runExport({ drain: () => new Promise((r) => (finish = r)), post });
    await Promise.resolve();
    expect(post).not.toHaveBeenCalled();
    finish(true);
    await running;
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("drain이 실패(false)하면 요청하지 않고 저장 실패 안내", async () => {
    const post = vi.fn(async () => done);
    const r = await runExport({ drain: async () => false, post });
    expect(r).toMatchObject({ kind: "failed", reason: "save_failed", message: SAVE_FAILED_MESSAGE });
    expect(post).not.toHaveBeenCalled();
  });

  it("drain이 예외를 던져도 요청하지 않는다", async () => {
    const post = vi.fn(async () => done);
    const r = await runExport({ drain: async () => Promise.reject(new Error("x")), post });
    expect(r).toMatchObject({ kind: "failed", message: SAVE_FAILED_MESSAGE });
    expect(post).not.toHaveBeenCalled();
  });
});

describe("postExport", () => {
  it("성공하면 주소를 본문으로 보내고 결과를 돌려준다", async () => {
    const fetchFn = vi.fn(async () => json(data));
    expect(await postExport("p1", "/products/[id]", fetchFn as never)).toEqual({ kind: "done", data });
    expect(fetchFn).toHaveBeenCalledWith("/api/projects/p1/exports", expect.objectContaining({ method: "POST", body: JSON.stringify({ route: "/products/[id]" }) }));
  });

  it("401은 로그인 안내, 서버 문구가 있으면 그대로, 없으면 일반 문구, 네트워크 오류는 연결 안내", async () => {
    expect(await postExport("p", null, (async () => json({}, 401)) as never)).toMatchObject({ kind: "failed", needsLogin: true });
    expect(await postExport("p", null, (async () => json({ error: { code: "not_found", message: "내보낼 설계도가 없습니다." } }, 404)) as never)).toMatchObject({ message: "내보낼 설계도가 없습니다." });
    expect(await postExport("p", null, (async () => new Response("<html>", { status: 500 })) as never)).toMatchObject({ message: expect.stringContaining("만들지 못했습니다") });
    expect(await postExport("p", null, (async () => Promise.reject(new Error("net"))) as never)).toMatchObject({ message: expect.stringContaining("연결하지 못했습니다") });
  });

  it("200이어도 형식이 틀린 본문은 실패로 본다", async () => {
    expect(await postExport("p", null, (async () => json({ revision: 1, documents: [] })) as never)).toMatchObject({ kind: "failed" });
  });
});

describe("copyText", () => {
  it("클립보드 API가 되면 copied", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText("a", { writeText, legacyCopy: () => false })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("a");
  });
  it("클립보드 API가 거부되면 대체 방식으로 복사한다", async () => {
    const legacyCopy = vi.fn(() => true);
    expect(await copyText("a", { writeText: async () => Promise.reject(new Error("denied")), legacyCopy })).toBe("copied-fallback");
    expect(legacyCopy).toHaveBeenCalledWith("a");
  });
  it("API가 없으면 바로 대체 방식, 둘 다 실패하면 failed", async () => {
    expect(await copyText("a", { legacyCopy: () => true })).toBe("copied-fallback");
    expect(await copyText("a", { writeText: async () => Promise.reject(new Error("x")), legacyCopy: () => false })).toBe("failed");
    expect(await copyText("a", { legacyCopy: () => { throw new Error("x"); } })).toBe("failed");
  });
});
