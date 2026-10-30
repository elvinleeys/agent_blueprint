import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_MS, requestDraft, TIMEOUT_IMAGE_MS, TIMEOUT_TEXT_MS, type DraftStage } from "./draft-stream";

const NDJSON = { "content-type": "application/x-ndjson; charset=utf-8" };
const line = (o: object) => `${JSON.stringify(o)}\n`;
const doneLine = line({ type: "done", blueprint: { title: "b" }, meta: { attempts: 1, elapsedMs: 5, normalized: [] } });

/** 테스트가 조각을 직접 밀어 넣는 스트림 응답 */
function liveStream() {
  const enc = new TextEncoder();
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  return {
    fetchFn: vi.fn(async () => new Response(body, { headers: NDJSON })) as unknown as typeof fetch,
    push: (text: string) => ctrl.enqueue(enc.encode(text)),
    close: () => ctrl.close(),
  };
}

const staticStream = (chunks: string[]) => {
  const s = liveStream();
  const fetchFn = vi.fn(async () => {
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ start: (c) => (chunks.forEach((t) => c.enqueue(enc.encode(t))), c.close()) }), { headers: NDJSON });
  }) as unknown as typeof fetch;
  void s;
  return fetchFn;
};

const form = () => new FormData();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("requestDraft — 정상", () => {
  it("단계 알림을 순서대로 전달하고 done(blueprint·meta)을 돌려준다. ping은 무시한다", async () => {
    const stages: DraftStage[] = [];
    const fetchFn = staticStream([
      line({ type: "stage", stage: "accepted" }),
      line({ type: "stage", stage: "generating", attempt: 1 }),
      line({ type: "ping" }),
      line({ type: "stage", stage: "normalizing", changes: 2 }),
      doneLine,
    ]);
    const r = await requestDraft(form(), { hasImages: false, fetchFn, onStage: (s) => stages.push(s) });
    expect(r).toEqual({ kind: "done", blueprint: { title: "b" }, meta: { attempts: 1, elapsedMs: 5, normalized: [] } });
    expect(stages).toEqual([{ stage: "accepted" }, { stage: "generating", attempt: 1 }, { stage: "normalizing", changes: 2 }]);
  });

  it("줄이 조각 사이에서 잘려 와도 이어 붙인다(멀티바이트 한글 포함)", async () => {
    const full = line({ type: "stage", stage: "generating", attempt: 1 }) + doneLine;
    const bytes = new TextEncoder().encode(full);
    const stages: DraftStage[] = [];
    const fetchFn = vi.fn(async () => {
      const cut = [7, 20, 50, bytes.length];
      let from = 0;
      return new Response(new ReadableStream({ start: (c) => (cut.forEach((to) => (c.enqueue(bytes.slice(from, to)), (from = to))), c.close()) }), { headers: NDJSON });
    }) as unknown as typeof fetch;
    const r = await requestDraft(form(), { hasImages: false, fetchFn, onStage: (s) => stages.push(s) });
    expect(r.kind).toBe("done");
    expect(stages).toEqual([{ stage: "generating", attempt: 1 }]);
  });

  it("마지막 줄에 개행이 없어도 해석한다", async () => {
    const r = await requestDraft(form(), { hasImages: false, fetchFn: staticStream([doneLine.trimEnd()]) });
    expect(r.kind).toBe("done");
  });
});

describe("requestDraft — 오류", () => {
  it("시작 전 오류(JSON)는 상태 코드와 error를 돌려준다", async () => {
    const fetchFn = vi.fn(async () => Response.json({ error: { code: "not_found", message: "대상을 찾을 수 없습니다.", retryable: false } }, { status: 404 })) as unknown as typeof fetch;
    expect(await requestDraft(form(), { hasImages: false, fetchFn })).toEqual({
      kind: "error", status: 404, error: { code: "not_found", message: "대상을 찾을 수 없습니다.", retryable: false },
    });
  });

  it("JSON이 아닌 오류 응답도 일반 오류로 처리한다", async () => {
    const fetchFn = vi.fn(async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    const r = await requestDraft(form(), { hasImages: false, fetchFn });
    expect(r).toMatchObject({ kind: "error", status: 502, error: { code: "unknown", retryable: true } });
  });

  it("스트림 안의 error 알림은 status·fields를 담고, 저장 실패는 blueprint가 함께 온다", async () => {
    const e = { code: "invalid_output", message: "규칙 위반", retryable: true, fields: [{ path: "nodes.2.name", message: "중복" }] };
    const r1 = await requestDraft(form(), { hasImages: false, fetchFn: staticStream([line({ type: "stage", stage: "accepted" }), line({ type: "error", status: 422, error: e })]) });
    expect(r1).toEqual({ kind: "error", status: 422, error: e });

    const saveErr = { code: "db_unavailable", message: "저장하지 못했습니다.", retryable: true };
    const r2 = await requestDraft(form(), { hasImages: false, fetchFn: staticStream([line({ type: "error", status: 503, error: saveErr, blueprint: { title: "kept" } })]) });
    expect(r2).toEqual({ kind: "error", status: 503, error: saveErr, blueprint: { title: "kept" } });
  });

  it("done·error 없이 스트림이 끝나면 연결이 끊긴 것으로 본다", async () => {
    const r = await requestDraft(form(), { hasImages: false, fetchFn: staticStream([line({ type: "stage", stage: "accepted" }), line({ type: "ping" })]) });
    expect(r).toEqual({ kind: "disconnected" });
  });

  it("네트워크 오류(fetch 실패)", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await requestDraft(form(), { hasImages: false, fetchFn })).toEqual({ kind: "network" });
  });
});

describe("requestDraft — 끊김 감지와 제한 시간", () => {
  it("마지막 줄 이후 30초 동안 아무것도 오지 않으면 끊긴 것으로 본다", async () => {
    const s = liveStream();
    const p = requestDraft(form(), { hasImages: false, fetchFn: s.fetchFn, timeoutMs: 1_000_000 }); // 전체 제한은 끄고 끊김 감지만 본다
    await vi.advanceTimersByTimeAsync(0);
    s.push(line({ type: "stage", stage: "generating", attempt: 1 }));
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    s.push(line({ type: "ping" })); // 마지막 줄을 받으면 30초를 다시 센다
    await vi.advanceTimersByTimeAsync(0); // 읽기 처리가 끝나도록 흘려보낸다
    await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ kind: "disconnected" });
  });

  it("하트비트가 계속 오면 끊긴 것으로 보지 않고 done을 받는다(전체 제한 안에서)", async () => {
    const s = liveStream();
    const p = requestDraft(form(), { hasImages: false, fetchFn: s.fetchFn });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
      s.push(line({ type: "ping" }));
      await vi.advanceTimersByTimeAsync(0);
    }
    s.push(doneLine);
    expect((await p).kind).toBe("done");
  });

  it.each([
    [false, TIMEOUT_TEXT_MS],
    [true, TIMEOUT_IMAGE_MS],
  ])("이미지 %s이면 전체 제한은 %i ms(서버 마감 45·60초보다 길다)", async (hasImages, limit) => {
    const s = liveStream();
    const p = requestDraft(form(), { hasImages, fetchFn: s.fetchFn, idleMs: 10 * limit }); // 끊김 감지는 끄고 전체 제한만 본다
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(limit - 1);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ kind: "timeout" });
    expect(TIMEOUT_TEXT_MS).toBeGreaterThan(45_000);
    expect(TIMEOUT_IMAGE_MS).toBeGreaterThan(60_000);
  });

  it("사용자가 취소하면 aborted", async () => {
    const s = liveStream();
    const ctrl = new AbortController();
    const p = requestDraft(form(), { hasImages: false, fetchFn: s.fetchFn, signal: ctrl.signal });
    await vi.advanceTimersByTimeAsync(0);
    ctrl.abort();
    expect(await p).toEqual({ kind: "aborted" });
  });

  it("끝나면 타이머를 남기지 않는다(완료·끊김·시간 초과 모두)", async () => {
    await requestDraft(form(), { hasImages: false, fetchFn: staticStream([doneLine]) });
    expect(vi.getTimerCount()).toBe(0);
    await requestDraft(form(), { hasImages: false, fetchFn: staticStream([]) });
    expect(vi.getTimerCount()).toBe(0);
  });
});
