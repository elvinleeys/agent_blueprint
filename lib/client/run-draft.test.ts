import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runDraft } from "./run-draft";

const sample = () => JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"));
const NDJSON = { "content-type": "application/x-ndjson" };
const line = (o: object) => `${JSON.stringify(o)}\n`;
const stream = (...lines: string[]) =>
  vi.fn(async () => new Response(lines.join(""), { headers: NDJSON })) as unknown as typeof fetch;
const doneLine = (blueprint: unknown = sample(), extra: object = {}) =>
  line({ type: "done", blueprint, meta: { attempts: 1, elapsedMs: 10, normalized: [{ nodeId: "n-page", path: "order", detail: "d" }], saved: { revision: 2, updatedAt: "t" }, ...extra } });
const input = (over: object = {}) => ({ projectId: "p1", spec: { overview: "x" }, route: "/p", images: [] as File[], ...over });
const image = () => new File([new Uint8Array([1])], "a.png", { type: "image/png" });

describe("runDraft — 성공", () => {
  it("설계도를 검증해 돌려주고 보정 내역·저장 여부를 담는다. 단계 알림을 전달한다", async () => {
    const stages: string[] = [];
    const r = await runDraft(input(), {
      fetchFn: stream(line({ type: "stage", stage: "accepted" }), line({ type: "stage", stage: "saving" }), doneLine()),
      onStage: (s) => stages.push(s.stage),
    });
    expect(r.kind).toBe("done");
    if (r.kind !== "done") return;
    expect(r.blueprint.title).toBe(sample().title);
    expect(r.normalized).toEqual([{ nodeId: "n-page", path: "order", detail: "d" }]);
    expect(r.saved).toBe(true);
    expect(stages).toEqual(["accepted", "saving"]);
  });

  it("이미지가 없으면 축소를 부르지 않고, 있으면 축소 → 요청 순서로 진행하며 이미지 전송 정보를 담는다", async () => {
    const resize = vi.fn();
    await runDraft(input(), { fetchFn: stream(doneLine()), resize });
    expect(resize).not.toHaveBeenCalled();

    const order: string[] = [];
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      order.push("fetch");
      const form = init?.body as FormData;
      expect(JSON.parse(String(form.get("imageMeta")))).toEqual([{ originalWidth: 2400 }]);
      expect((form.getAll("images") as File[]).length).toBe(1);
      return new Response(doneLine(), { headers: NDJSON });
    }) as unknown as typeof fetch;
    const r = await runDraft(input({ images: [image()] }), {
      fetchFn,
      onResizing: () => order.push("resizing"),
      onRunning: () => order.push("running"),
      resize: async () => ({ ok: true, images: [{ file: image(), originalWidth: 2400 }] }),
    });
    expect(r.kind).toBe("done");
    expect(order).toEqual(["resizing", "running", "fetch"]);
  });
});

describe("runDraft — 실패는 입력을 건드리지 않고 사용자용 오류로 바꾼다", () => {
  it("이미지 축소 실패면 요청하지 않는다", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const r = await runDraft(input({ images: [image()] }), { fetchFn, resize: async () => ({ ok: false, message: "이미지를 처리하지 못했습니다." }) });
    expect(r).toMatchObject({ kind: "failed", error: { message: "이미지를 처리하지 못했습니다.", retryable: false } });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("스트림 error: 상태 코드·코드·원인 필드를 담고 422는 다시 시도할 수 있다", async () => {
    const fields = [{ path: "nodes.2.name", message: "중복" }];
    const e = { code: "invalid_output", message: "AI가 만든 설계도가 규칙을 통과하지 못했습니다.", retryable: false, fields };
    const r = await runDraft(input(), { fetchFn: stream(line({ type: "error", status: 422, error: e })) });
    expect(r).toEqual({ kind: "failed", error: { message: e.message, status: 422, code: "invalid_output", fields, retryable: true, needsLogin: false } });
  });

  it("401은 로그인 안내가 필요하다", async () => {
    const fetchFn = vi.fn(async () => Response.json({ error: { code: "unauthorized", message: "로그인이 필요합니다.", retryable: false } }, { status: 401 })) as unknown as typeof fetch;
    const r = await runDraft(input(), { fetchFn });
    expect(r).toMatchObject({ kind: "failed", error: { status: 401, needsLogin: true, retryable: false } });
  });

  it("저장 실패(blueprint가 함께 옴)는 초안을 보여 주고 저장되지 않았다는 안내를 붙인다", async () => {
    const e = { code: "db_unavailable", message: "설계도를 저장하지 못했습니다.", retryable: true };
    const r = await runDraft(input(), { fetchFn: stream(line({ type: "error", status: 503, error: e, blueprint: sample() })) });
    expect(r.kind).toBe("failed");
    if (r.kind !== "failed") return;
    expect(r.keptBlueprint?.title).toBe(sample().title);
    expect(r.error.message).toContain("저장되지 않았습니다. 새로고침하면 사라질 수 있습니다.");
    expect(r.error.status).toBe(503);
  });

  it.each([
    ["끊김(done·error 없이 종료)", stream(line({ type: "stage", stage: "accepted" })), "연결이 끊겼습니다"],
    ["네트워크 오류", vi.fn(async () => { throw new TypeError("x"); }) as unknown as typeof fetch, "네트워크에 연결할 수 없습니다"],
  ])("%s → 다시 시도 가능한 안내", async (_name, fetchFn, text) => {
    const r = await runDraft(input(), { fetchFn });
    expect(r).toMatchObject({ kind: "failed", error: { retryable: true, needsLogin: false } });
    expect(r.kind === "failed" && r.error.message).toContain(text);
  });

  it("서버가 보낸 설계도가 스키마를 통과하지 못하면 화면에 반영하지 않는다", async () => {
    const bad = sample();
    bad.nodes[1].name = "productGallery";
    const r = await runDraft(input(), { fetchFn: stream(doneLine(bad)) });
    expect(r).toMatchObject({ kind: "failed", error: { retryable: true } });
    expect(r.kind).toBe("failed");
  });
});
