import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpecInput } from "../../core/schema/spec-input";
import { draftBlueprint, estimateCostUsd, type DraftClient, type DraftInput, type DraftProgress } from "./draft-blueprint";

vi.mock("server-only", () => ({}));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- 테스트용 변형 편의

const sample = (): Json => JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8"));
// 이름이 겹치는 응답: 자동 보정 대상이 아니라 스키마 검증 실패로 남는다(재시도 테스트용)
const invalid = (): Json => {
  const b = sample();
  b.nodes[2].name = b.nodes[1].name;
  return b;
};
// 자동 보정 대상 오류: grid에 direction, 형제 order 겹침
const fixable = (): Json => {
  const b = sample();
  b.nodes[0].layout.direction = "column";
  b.nodes[2].order = b.nodes[1].order;
  return b;
};

const input = (over: Partial<DraftInput> = {}): DraftInput => ({
  spec: { version: "1.2", imageCount: 0, overview: "상품 상세 화면" } as SpecInput,
  stack: { framework: "next", styling: "css-modules", architecture: "fsd" },
  route: "/products/[id]",
  images: [],
  ...over,
});

const response = (text: string, tokens = { in: 1000, out: 2000, reasoning: 0 }, extra: Json = {}) => ({
  status: "completed",
  incomplete_details: null,
  output: [],
  output_text: text,
  usage: { input_tokens: tokens.in, output_tokens: tokens.out, output_tokens_details: { reasoning_tokens: tokens.reasoning } },
  ...extra,
});

type Step = Json | Error | (() => Promise<Json>);
function makeClient(...steps: Step[]) {
  const create = vi.fn();
  for (const s of steps) {
    if (typeof s === "function") create.mockImplementationOnce(s as () => Promise<Json>);
    else if (s instanceof Error) create.mockRejectedValueOnce(s);
    else create.mockResolvedValueOnce(s);
  }
  return { client: { responses: { create } } as unknown as DraftClient, create };
}
const never = () => new Promise<Json>(() => {});
const slow = (ms: number, text: string) => async () => {
  vi.setSystemTime(Date.now() + ms); // 모델이 ms만큼 걸린 것처럼 시계를 앞당긴다
  return response(text);
};
const httpError = (status: number, message = "boom") => Object.assign(new Error(message), { status });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("draftBlueprint — 성공", () => {
  it("첫 시도에서 통과하면 재시도 없이 끝나고 비용을 계산한다", async () => {
    const { client, create } = makeClient(response(JSON.stringify(sample())));
    const r = await draftBlueprint(input(), { client });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.attempts).toBe(1);
    expect(r.usage).toEqual({ inputTokens: 1000, outputTokens: 2000, reasoningTokens: 0 });
    expect(r.costUsd).toBeCloseTo(0.011, 6); // (1000×$1 + 2000×$5) / 1e6
  });

  it("추론 토큰은 출력 토큰에 포함이라 비용에 따로 더하지 않는다", () => {
    const usage = { inputTokens: 1000, outputTokens: 2000, reasoningTokens: 1500 };
    expect(estimateCostUsd("gpt-6.1-terra", usage)).toBeCloseTo(0.011, 6);
  });

  it("요청 값(stack·route·source·generatedBy·version)으로 덮어쓴다", () => {
    const tampered = sample();
    tampered.stack = { framework: "react", styling: "tailwind", architecture: "type-based" };
    tampered.route = "/other";
    tampered.source = { hasSpec: false, imageCount: 3 };
    tampered.generatedBy = "user";
    tampered.version = "9.9";
    const { client } = makeClient(response(JSON.stringify(tampered)));
    return draftBlueprint(input(), { client }).then((r) => {
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.blueprint.stack).toEqual({ framework: "next", styling: "css-modules", architecture: "fsd" });
      expect(r.blueprint.route).toBe("/products/[id]");
      expect(r.blueprint.source).toEqual({ hasSpec: true, imageCount: 0 });
      expect(r.blueprint.generatedBy).toBe("ai");
      expect(r.blueprint.version).toBe("1.2");
    });
  });

  it("strict 스키마 때문에 선택 필드에 채워진 null은 제거한 뒤 검증한다", async () => {
    const b = sample();
    b.nodes.forEach((n: Json) => (n.assumedFields = null));
    const { client } = makeClient(response(JSON.stringify(b)));
    expect((await draftBlueprint(input(), { client })).ok).toBe(true);
  });

  it("요청 파라미터: 모델·추론 강도·상한·저장 안 함·strict 스키마", async () => {
    const { client, create } = makeClient(response(JSON.stringify(sample())));
    await draftBlueprint(input(), { client });
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({
      model: "gpt-6.1-terra",
      reasoning: { effort: "low" },
      max_output_tokens: 16000,
      store: false,
      text: { format: { type: "json_schema", name: "blueprint", strict: true } },
    });
    expect(create.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("이미지는 data URL로 보내고 imageCount·원본 가로 안내를 프롬프트에 반영한다", async () => {
    const { client, create } = makeClient(response(JSON.stringify(sample())));
    const r = await draftBlueprint(
      input({ images: [{ mediaType: "image/png", base64: "AAAA", originalWidth: 1920 }] }),
      { client },
    );
    expect(r.ok).toBe(true);
    const parts = create.mock.calls[0][0].input[0].content;
    expect(parts[0].text).toContain("source.imageCount: 1"); // 요청의 spec.imageCount가 0이어도 이미지 수가 기준
    expect(parts[0].text).toContain("원본 가로 1920px를 축소해 전달함");
    expect(parts[1]).toEqual({ type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "auto" });
    if (r.ok) expect(r.blueprint.source.imageCount).toBe(1);
  });
});

describe("draftBlueprint — 재시도", () => {
  it("검증 실패 후 오류를 붙여 재시도해 성공하면 사용량·비용을 합산한다", async () => {
    const bad = JSON.stringify(invalid());
    const { client, create } = makeClient(response(bad), response(JSON.stringify(sample())));
    const r = await draftBlueprint(input(), { client });

    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.attempts).toBe(2);
    expect(r.usage).toEqual({ inputTokens: 2000, outputTokens: 4000, reasoningTokens: 0 });
    expect(r.costUsd).toBeCloseTo(0.022, 6);

    const items = create.mock.calls[1][0].input;
    expect(items).toHaveLength(3);
    expect(items[1]).toEqual({ role: "assistant", content: bad }); // 직전 출력
    expect(items[2].role).toBe("user");
    expect(items[2].content).toContain("name"); // 오류 경로·메시지
    expect(items[2].content).toContain("nodes[2]"); // 노드 이름으로 위치를 알려 준다
    expect(r.log[0].fields?.length).toBeGreaterThan(0);
  });

  it("재시도 후에도 실패하면 invalid_output과 두 번째 시도의 실패 항목을 반환한다", async () => {
    const bad = JSON.stringify(invalid());
    const { client, create } = makeClient(response(bad), response(bad));
    const r = await draftBlueprint(input(), { client });
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("invalid_output");
    expect(r.attempts).toBe(2);
    expect(r.retrySkipped).toBeUndefined();
    expect(r.fields?.[0].path).toBe("nodes.2.name");
    expect(r.costUsd).toBeCloseTo(0.022, 6); // 실패해도 쓴 비용은 남는다
  });

  it("남은 시간이 부족하면 재시도하지 않고 첫 시도의 실패 항목으로 끝낸다", async () => {
    const { client, create } = makeClient(slow(30_000, JSON.stringify(invalid())));
    const r = await draftBlueprint(input(), { client }); // 45초 − 30초 − 1.5초 < 30초
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("invalid_output");
    expect(r.retrySkipped).toBe(true);
    expect(r.fields?.[0].path).toBe("nodes.2.name");
  });

  it.each([
    [20_000, true], // 남은 23.5초 ≥ max(20초, 15초)
    [22_000, false], // 남은 21.5초 < 22초
  ])("첫 시도가 %i ms 걸리면 재시도 여부는 %s", async (ms, retried) => {
    const { client, create } = makeClient(slow(ms, JSON.stringify(invalid())), response(JSON.stringify(sample())));
    const r = await draftBlueprint(input(), { client });
    expect(create).toHaveBeenCalledTimes(retried ? 2 : 1);
    expect(r.ok).toBe(retried);
  });

  it("첫 시도가 빨라도 남은 시간이 15초 미만이면 재시도하지 않는다", async () => {
    const { client, create } = makeClient(response(JSON.stringify(invalid())));
    const r = await draftBlueprint(input(), { client, budgetMs: 10_000 }); // 남은 8.5초 < 15초
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.ok === false && r.retrySkipped).toBe(true);
  });

  it("재시도 없이 끝내는 응답: refusal·incomplete·JSON 아님", async () => {
    const refusal = response("", undefined, { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] });
    const incomplete = response("{", undefined, { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    const notJson = response("죄송합니다");
    for (const res of [refusal, incomplete, notJson]) {
      const { client, create } = makeClient(res);
      const r = await draftBlueprint(input(), { client });
      expect(create).toHaveBeenCalledTimes(1);
      expect(r.ok === false && r.kind).toBe("invalid_output");
    }
  });
});

describe("draftBlueprint — 자동 보정", () => {
  it("보정 가능한 오류만 있으면 재시도 없이 보정해 통과하고 내역을 돌려준다", async () => {
    const { client, create } = makeClient(response(JSON.stringify(fixable())));
    const r = await draftBlueprint(input(), { client });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.attempts).toBe(1);
    expect(r.normalized.map((c) => c.path).sort()).toEqual(["layout.direction", "order"]);
    expect(r.normalized.find((c) => c.path === "layout.direction")?.nodeId).toBe("n-page");
    expect(r.log[0].normalized).toEqual(r.normalized);
  });

  it("보정이 필요 없는 응답은 normalized가 비어 있다", async () => {
    const { client } = makeClient(response(JSON.stringify(sample())));
    expect((await draftBlueprint(input(), { client })).normalized).toEqual([]);
  });

  it("보정 불가능한 오류는 기존처럼 재시도하고, 재시도 지시문에는 보정으로 해결된 오류가 빠진다", async () => {
    const mixed = fixable();
    mixed.nodes[2].name = mixed.nodes[1].name; // 보정 불가 오류도 함께
    const { client, create } = makeClient(response(JSON.stringify(mixed)), response(JSON.stringify(sample())));
    const r = await draftBlueprint(input(), { client });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    const repair = create.mock.calls[1][0].input[2].content as string;
    expect(repair).toContain("name");
    expect(repair).not.toContain("direction");
    expect(repair).not.toContain("order");
  });

  it("재시도 응답에도 자동 보정을 적용한다", async () => {
    const { client, create } = makeClient(response(JSON.stringify(invalid())), response(JSON.stringify(fixable())));
    const r = await draftBlueprint(input(), { client });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.normalized).toHaveLength(2);
    expect(r.log[0].normalized).toEqual([]);
  });

  it("보정 후에도 실패하고 시간이 부족하면 남은 오류만 담아 invalid_output으로 끝낸다", async () => {
    const mixed = fixable();
    mixed.nodes[2].name = mixed.nodes[1].name;
    const { client, create } = makeClient(slow(30_000, JSON.stringify(mixed)));
    const r = await draftBlueprint(input(), { client });
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.retrySkipped).toBe(true);
    expect(r.fields?.map((f) => f.path)).toEqual(["nodes.2.name"]); // 보정된 direction·order 오류는 남지 않는다
    expect(r.normalized).toHaveLength(2); // 적용한 보정은 기록으로 남는다
  });

  it("보정할 것이 없는 오류만 있으면 normalized는 비어 있다", async () => {
    const { client } = makeClient(response(JSON.stringify(invalid())), response(JSON.stringify(invalid())));
    const r = await draftBlueprint(input(), { client });
    expect(r.ok).toBe(false);
    expect(r.normalized).toEqual([]);
  });
});

describe("draftBlueprint — 시간 초과와 OpenAI 오류", () => {
  it("텍스트만은 45초 마감 직전(1.5초 여유)에 끊고 timeout을 반환한다", async () => {
    const { client, create } = makeClient(never);
    let settled = false;
    const p = draftBlueprint(input(), { client }).then((r) => ((settled = true), r));
    await vi.advanceTimersByTimeAsync(43_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    const r = await p;
    expect(r.ok === false && r.kind).toBe("timeout");
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(43_500);
  });

  it("이미지가 있으면 마감이 60초다", async () => {
    const { client } = makeClient(never);
    let settled = false;
    const p = draftBlueprint(input({ images: [{ mediaType: "image/png", base64: "AA" }] }), { client }).then((r) => ((settled = true), r));
    await vi.advanceTimersByTimeAsync(44_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await p).ok === false).toBe(true);
  });

  it("재시도가 시간 초과로 끝나면 timeout이고 첫 시도의 실패 항목을 함께 남긴다", async () => {
    const { client, create } = makeClient(response(JSON.stringify(invalid())), never);
    const p = draftBlueprint(input(), { client });
    await vi.advanceTimersByTimeAsync(50_000);
    const r = await p;
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("timeout");
    expect(r.attempts).toBe(2);
    expect(r.fields?.[0].path).toBe("nodes.2.name");
  });

  it.each([
    [429, "rate_limited"],
    [500, "upstream"],
    [503, "upstream"],
    [401, "upstream"],
    [400, "upstream"],
  ])("OpenAI %i 응답은 %s이고 재시도하지 않으며 오류 문구를 결과에 담지 않는다", async (status, kind) => {
    const { client, create } = makeClient(httpError(status, "Incorrect API key provided: sk-secret-123"));
    const r = await draftBlueprint(input(), { client });
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.ok === false && r.kind).toBe(kind);
    if (!r.ok) expect(r.upstreamStatus).toBe(status);
    expect(JSON.stringify(r)).not.toContain("sk-secret");
  });

  it("SDK의 연결 시간 초과·중단 오류도 timeout으로 본다", async () => {
    const e = Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
    const { client } = makeClient(e);
    const r = await draftBlueprint(input(), { client });
    expect(r.ok === false && r.kind).toBe("timeout");
  });
});

describe("draftBlueprint — 진행 단계 알림", () => {
  const run = async (steps: Step[], over: Parameters<typeof draftBlueprint>[1] = {}) => {
    const events: DraftProgress[] = [];
    const { client } = makeClient(...steps);
    const r = await draftBlueprint(input(), { client, onProgress: (e) => events.push(e), ...over });
    return { r, events };
  };

  it("정상: generating → validating", async () => {
    const { r, events } = await run([response(JSON.stringify(sample()))]);
    expect(r.ok).toBe(true);
    expect(events).toEqual([{ stage: "generating", attempt: 1 }, { stage: "validating", attempt: 1 }]);
  });

  it("자동 보정: validating 다음에 normalizing(개수)", async () => {
    const { events } = await run([response(JSON.stringify(fixable()))]);
    expect(events).toEqual([
      { stage: "generating", attempt: 1 },
      { stage: "validating", attempt: 1 },
      { stage: "normalizing", changes: 2 },
    ]);
  });

  it("재시도: regenerating 뒤 validating이 한 번 더", async () => {
    const { r, events } = await run([response(JSON.stringify(invalid())), response(JSON.stringify(sample()))]);
    expect(r.ok).toBe(true);
    expect(events).toEqual([
      { stage: "generating", attempt: 1 },
      { stage: "validating", attempt: 1 },
      { stage: "regenerating", attempt: 2 },
      { stage: "validating", attempt: 2 },
    ]);
  });

  it("재시도 없이 끝나는 실패(시간 부족)는 regenerating이 없다", async () => {
    const { r, events } = await run([slow(40_000, JSON.stringify(invalid()))], {});
    expect(r.ok).toBe(false);
    expect(events.map((e) => e.stage)).toEqual(["generating", "validating"]);
  });

  it("OpenAI 오류면 validating 없이 generating만", async () => {
    const { r, events } = await run([httpError(429)]);
    expect(r.ok).toBe(false);
    expect(events).toEqual([{ stage: "generating", attempt: 1 }]);
  });

  it("콜백이 던져도 결과는 같다, 콜백이 없어도 같다", async () => {
    const bad = response(JSON.stringify(invalid()));
    const good = response(JSON.stringify(sample()));
    const withThrow = await draftBlueprint(input(), { client: makeClient(bad, good).client, onProgress: () => { throw new Error("x"); } });
    const without = await draftBlueprint(input(), { client: makeClient(bad, good).client });
    expect(withThrow.ok).toBe(true);
    expect(withThrow.attempts).toBe(without.attempts);
    expect(withThrow.ok && without.ok && withThrow.blueprint).toEqual(without.ok && without.blueprint);
  });
});
