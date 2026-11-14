import { describe, expect, it } from "vitest";
import { toStrictJsonSchema } from "../prompt/strict-json-schema";
import type { AiInput } from "./ai-input";
import { acceptAiResponse, aiPairId, aiResponsibilityId, AiResponseSchema } from "./ai-schema";

// AI 응답 검증: 스키마에 맞지 않으면 전체를 버리고, 보내지 않은 대상을 가리키는 항목은 그 항목만 버린다

const INPUT: AiInput = {
  pairTasks: [{ nodeId: "n-gallery", nodeName: "ProductGallery", nodeKind: "presentational", responsibilities: [], props: ["images"], candidates: [{ path: "src/ItemImages.tsx", name: "ItemImages" }] }],
  responsibilityTasks: [{ nodeId: "n-cart", nodeName: "AddToCartButton", responsibilities: ["장바구니에 담기", "수량 검증"], unit: { path: "src/AddToCartButton.tsx", name: "AddToCartButton" } }],
  units: [],
  omitted: { pairNodes: [], responsibilityNodes: [] },
};
const pair = { nodeId: "n-gallery", path: "src/ItemImages.tsx", name: "ItemImages", verdict: "same" as const, reason: "images prop으로 이미지를 그린다." };
const resp = { nodeId: "n-cart", responsibility: "수량 검증", verdict: "missing" as const, reason: "수량을 확인하는 코드가 없다." };

describe("스키마에 맞지 않으면 전체를 버린다", () => {
  it.each([
    ["필드 빠짐", { pairs: [{ ...pair, reason: undefined }], responsibilities: [] }],
    ["모르는 verdict", { pairs: [{ ...pair, verdict: "maybe" }], responsibilities: [] }],
    ["모르는 필드", { pairs: [pair], responsibilities: [], extra: 1 }],
    ["빈 근거", { pairs: [{ ...pair, reason: "" }], responsibilities: [] }],
    ["근거 500자 초과", { pairs: [], responsibilities: [{ ...resp, reason: "가".repeat(501) }] }],
    ["JSON 객체가 아님", "pairs"],
    ["null", null],
  ])("%s", (_, raw) => {
    const r = acceptAiResponse(raw, INPUT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe("맞는 응답", () => {
  it("짝·책임 제안에 화면용 id와 노드 이름을 붙인다", () => {
    const r = acceptAiResponse({ pairs: [pair], responsibilities: [resp] }, INPUT);
    expect(r).toEqual({
      ok: true,
      suggestions: {
        pairs: [{ ...pair, id: "AI|pair|n-gallery|src/ItemImages.tsx#ItemImages", nodeName: "ProductGallery" }],
        responsibilities: [{ ...resp, id: "AI|resp|n-cart|수량 검증", nodeName: "AddToCartButton" }],
        dropped: 0,
      },
    });
    expect(aiPairId("n", "p", "N")).toBe("AI|pair|n|p#N");
    expect(aiResponsibilityId("n", "책임")).toBe("AI|resp|n|책임");
  });

  it("보내지 않은 노드·후보가 아닌 코드·적히지 않은 책임·중복은 그 항목만 버리고 개수를 센다", () => {
    const r = acceptAiResponse(
      {
        pairs: [pair, pair, { ...pair, nodeId: "n-other" }, { ...pair, path: "src/Evil.tsx" }, { ...pair, nodeId: "n-cart" }],
        responsibilities: [resp, { ...resp, responsibility: "결제하기" }, { ...resp, nodeId: "n-gallery" }],
      },
      INPUT,
    );
    expect(r.ok && r.suggestions.pairs).toHaveLength(1);
    expect(r.ok && r.suggestions.responsibilities).toHaveLength(1);
    expect(r.ok && r.suggestions.dropped).toBe(6);
  });

  it("빈 응답도 맞는 응답이다(제안 0건)", () => {
    expect(acceptAiResponse({ pairs: [], responsibilities: [] }, INPUT)).toEqual({ ok: true, suggestions: { pairs: [], responsibilities: [], dropped: 0 } });
  });
});

describe("책임 판정 done은 근거 없이 판정만(missing·unsure만 근거)", () => {
  const done = { nodeId: "n-cart", responsibility: "장바구니에 담기", verdict: "done" as const };
  const input: AiInput = { ...INPUT, responsibilityTasks: [{ ...INPUT.responsibilityTasks[0], responsibilities: ["장바구니에 담기", "수량 검증"] }] };

  it("done은 reason이 null(strict 출력)이거나 없어도 통과하고, 결과에 reason이 없다", () => {
    for (const r of [{ ...done, reason: null }, done]) {
      const out = acceptAiResponse({ pairs: [], responsibilities: [r] }, input);
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.suggestions.responsibilities).toEqual([{ ...done, id: "AI|resp|n-cart|장바구니에 담기", nodeName: "AddToCartButton" }]);
        expect("reason" in out.suggestions.responsibilities[0]).toBe(false);
      }
    }
  });

  it("done에 근거가 붙어 와도 쓰지 않는다(판정만 남김)", () => {
    const out = acceptAiResponse({ pairs: [], responsibilities: [{ ...done, reason: "담기 버튼이 있다." }] }, input);
    expect(out.ok && "reason" in out.suggestions.responsibilities[0]).toBe(false);
  });

  it.each(["missing", "unsure"] as const)("%s는 reason이 null이거나 없으면 스키마 실패(전체를 버림)", (verdict) => {
    for (const r of [{ ...resp, verdict, reason: null }, { nodeId: resp.nodeId, responsibility: resp.responsibility, verdict }]) {
      const out = acceptAiResponse({ pairs: [], responsibilities: [r] }, input);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.issues.join(" ")).toContain("reason");
    }
  });

  it("짝 제안(pairs)은 지금처럼 모든 판정에 reason이 필요하다", () => {
    expect(acceptAiResponse({ pairs: [{ ...pair, reason: null }], responsibilities: [] }, input).ok).toBe(false);
  });
});

describe("Structured Outputs(strict) 변환", () => {
  it("책임의 reason은 strict에서 required이면서 null을 허용한다(done은 null로 보냄)", () => {
    const s = toStrictJsonSchema(AiResponseSchema) as { properties: { responsibilities: { items: { required: string[]; properties: { reason: { anyOf?: { type: string }[] } } } } } };
    const item = s.properties.responsibilities.items;
    expect(item.required).toEqual(["nodeId", "responsibility", "verdict", "reason"]);
    expect(item.properties.reason.anyOf?.map((b) => b.type)).toEqual(["string", "null"]);
  });

  it("모든 필드가 required이고 추가 필드를 막는다", () => {
    const s = toStrictJsonSchema(AiResponseSchema) as { required: string[]; additionalProperties: boolean; properties: Record<string, { items: { required: string[]; additionalProperties: boolean } }> };
    expect(s.required).toEqual(["pairs", "responsibilities"]);
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.pairs.items.required).toEqual(["nodeId", "path", "name", "verdict", "reason"]);
    expect(s.properties.responsibilities.items.additionalProperties).toBe(false);
  });
});
