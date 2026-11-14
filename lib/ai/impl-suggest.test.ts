import { describe, expect, it, vi } from "vitest";
import type { AiInput } from "../../core/impl-check/ai-input";
import { buildImplAiInput, IMPL_AI_INSTRUCTIONS } from "../../core/prompt/impl-ai-prompt";
import { estimateCostUsd, type DraftClient } from "./draft-blueprint";
import { IMPL_AI_MAX_OUTPUT_TOKENS, suggestImplementation } from "./impl-suggest";

vi.mock("server-only", () => ({}));

// 구현 검사 AI 제안 호출: 가짜 클라이언트로만 시험한다(실제 OpenAI 호출 없음)

const SNIPPET = "export function ItemImages({ images }) { return <ul>{images.map((i) => <li key={i}>{i}</li>)}</ul>; }";
const INPUT: AiInput = {
  pairTasks: [{ nodeId: "n-gallery", nodeName: "ProductGallery", nodeKind: "presentational", responsibilities: ["상품 이미지 목록 표시"], props: ["images"], candidates: [{ path: "src/ItemImages.tsx", name: "ItemImages" }] }],
  responsibilityTasks: [],
  units: [{ path: "src/ItemImages.tsx", name: "ItemImages", kind: "component", snippet: SNIPPET, truncated: false }],
  omitted: { pairNodes: [], responsibilityNodes: [] },
};
const GOOD = { pairs: [{ nodeId: "n-gallery", path: "src/ItemImages.tsx", name: "ItemImages", verdict: "same", reason: "images prop으로 목록을 그린다." }], responsibilities: [] };

const response = (text: string, extra: Record<string, unknown> = {}) => ({
  status: "completed",
  incomplete_details: null,
  output: [],
  output_text: text,
  usage: { input_tokens: 1000, output_tokens: 300, output_tokens_details: { reasoning_tokens: 100 } },
  ...extra,
});

type Body = Parameters<DraftClient["responses"]["create"]>[0];
function fakeClient(replies: (() => unknown)[]) {
  const bodies: Body[] = [];
  const client = {
    responses: {
      create: vi.fn(async (body: Body) => {
        bodies.push(body);
        const r = replies[bodies.length - 1];
        if (!r) throw new Error("예상하지 못한 호출");
        return r();
      }),
    },
  } as unknown as DraftClient;
  return { client, bodies };
}

describe("정상 응답", () => {
  it("한 번 호출해 검증한 제안을 돌려주고, 요청은 저장 안 함·strict 스키마·출력 상한·템플릿 입력만 쓴다", async () => {
    const { client, bodies } = fakeClient([() => response(JSON.stringify(GOOD))]);
    const r = await suggestImplementation(INPUT, { client });
    expect(r).toMatchObject({ ok: true, attempts: 1, model: "gpt-6.1-terra", suggestions: { pairs: [{ nodeId: "n-gallery", verdict: "same", nodeName: "ProductGallery" }], responsibilities: [], dropped: 0 } });
    expect(r.costUsd).toBeCloseTo(estimateCostUsd("gpt-6.1-terra", { inputTokens: 1000, outputTokens: 300, reasoningTokens: 100 }));
    expect(bodies[0]).toMatchObject({
      store: false,
      instructions: IMPL_AI_INSTRUCTIONS,
      max_output_tokens: IMPL_AI_MAX_OUTPUT_TOKENS,
      input: [{ role: "user", content: buildImplAiInput(INPUT) }],
      text: { format: { type: "json_schema", name: "impl_suggestions", strict: true } },
    });
  });

  it("결과(성공·실패)에 코드 조각이 들어가지 않는다", async () => {
    const ok = await suggestImplementation(INPUT, { client: fakeClient([() => response(JSON.stringify(GOOD))]).client });
    const bad = await suggestImplementation(INPUT, { client: fakeClient([() => response("not json"), () => response("still not json")]).client });
    for (const r of [ok, bad]) expect(JSON.stringify(r)).not.toContain("images.map");
  });
});

describe("형식이 틀리면 남은 시간이 있을 때만 1번 다시 요청한다", () => {
  it("첫 응답이 스키마에 맞지 않고 다시 요청한 응답이 맞으면 성공(2번 호출, 다시 요청에 문제를 적음)", async () => {
    const { client, bodies } = fakeClient([() => response(JSON.stringify({ pairs: [{ ...GOOD.pairs[0], verdict: "maybe" }], responsibilities: [] })), () => response(JSON.stringify(GOOD))]);
    const r = await suggestImplementation(INPUT, { client });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    const retry = bodies[1].input as { role: string; content: string }[];
    expect(retry).toHaveLength(3);
    expect(retry[2].content).toContain("형식에 맞지 않았습니다");
    expect(retry[2].content).toContain("pairs.0.verdict");
  });

  it("다시 요청해도 틀리면 invalid_output(더 요청하지 않음)", async () => {
    const { client, bodies } = fakeClient([() => response("not json"), () => response("{}")]);
    expect(await suggestImplementation(INPUT, { client })).toMatchObject({ ok: false, kind: "invalid_output", attempts: 2 });
    expect(bodies).toHaveLength(2);
  });

  it("남은 시간이 max(첫 시도 시간, 15초)보다 적으면 다시 요청하지 않는다", async () => {
    const { client, bodies } = fakeClient([() => response("not json")]);
    const r = await suggestImplementation(INPUT, { client, budgetMs: 10_000 });
    expect(r).toMatchObject({ ok: false, kind: "invalid_output", retrySkipped: true, attempts: 1 });
    expect(bodies).toHaveLength(1);
  });

  it("중간에 끝난 응답·거부는 다시 요청하지 않는다", async () => {
    const incomplete = fakeClient([() => response("", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })]);
    expect(await suggestImplementation(INPUT, { client: incomplete.client })).toMatchObject({ ok: false, kind: "invalid_output", issues: ["응답이 중간에 끝났습니다(max_output_tokens)"] });
    const refusal = fakeClient([() => response("", { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })]);
    expect(await suggestImplementation(INPUT, { client: refusal.client })).toMatchObject({ ok: false, kind: "invalid_output", attempts: 1 });
  });
});

describe("호출 오류", () => {
  it("마감을 넘기면 timeout", async () => {
    const { client } = fakeClient([() => new Promise(() => {})]);
    expect(await suggestImplementation(INPUT, { client, budgetMs: 1_600 })).toMatchObject({ ok: false, kind: "timeout" });
  });

  it("429는 rate_limited, 그 밖의 오류는 upstream(다시 요청하지 않음)", async () => {
    const limited = fakeClient([() => Promise.reject(Object.assign(new Error("rate"), { status: 429 }))]);
    expect(await suggestImplementation(INPUT, { client: limited.client })).toMatchObject({ ok: false, kind: "rate_limited", attempts: 1 });
    const down = fakeClient([() => Promise.reject(Object.assign(new Error("boom"), { status: 500 }))]);
    expect(await suggestImplementation(INPUT, { client: down.client })).toMatchObject({ ok: false, kind: "upstream", attempts: 1 });
  });
});
