import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readCodeModel } from "@/core/code-model/facts";
import { loadBlueprint, loadCode } from "@/core/impl-check/load-fixture";
import { checkImplementation } from "@/core/impl-check/run";
import type { CheckResponse, PairReview } from "@/lib/client/run-implementation-check";
import ImplementationCheckPanel from "./ImplementationCheckPanel";
import ResultView from "./ResultView";
import { baselineText, configText, designSummaryText, groupFindings, removedTexts } from "./result-view";
import type { Selection } from "./selection";

// 서버 렌더링 스모크 테스트: 파일 선택·검사·복사 같은 클릭 흐름과 탭을 바꿔도 유지되는지는 브라우저에서 확인한다
// (요청 처리는 lib/client/run-implementation-check.test.ts, 선택 복원은 selection.test.ts)
const text = (node: React.ReactElement) => renderToString(node).replaceAll("<!-- -->", "");

function response(name: string, over: Partial<CheckResponse["baseline"]> = {}): CheckResponse {
  const r = checkImplementation(loadBlueprint("next", name), readCodeModel(loadCode("next", name)));
  const { pairing, ...result } = r;
  const pairReviews: PairReview[] = pairing.reviews.map((p) => ({
    nodeId: p.nodeId,
    nodeName: p.nodeName,
    reason: p.reason,
    candidates: p.candidates.map((c) => ({ name: c.unit.name, path: c.unit.path, kind: c.unit.kind, exported: c.unit.exported, score: c.score, ...(c.contestedBy ? { contestedBy: c.contestedBy } : {}), evidence: c.evidence.map((e) => ({ kind: e.kind, detail: e.detail })) })),
  }));
  return { baseline: { revision: 3, source: "export", ...over }, result, pairReviews, meta: { timing: { totalMs: 12.4, requestNumber: 1, first: true }, files: 11, bytes: 2000, nodes: 8, confirmedApplied: 0, configs: { read: 1, unsupported: 0 } } };
}

const view = (data: CheckResponse, selection: Selection = {}, extra: Partial<React.ComponentProps<typeof ResultView>> = {}) =>
  text(<ResultView data={data} confirmed={[]} selection={selection} running={false} stale={false} nameOf={(id) => id} onChoice={() => {}} onConfirm={() => {}} onCancelConfirm={() => {}} {...extra} />);

describe("ImplementationCheckPanel", () => {
  const out = text(<ImplementationCheckPanel projectId="p1" onGoStructure={() => {}} />);

  it("업로드 칸·검사 버튼·tsconfig 안내를 그리고, 결과는 아직 없다", () => {
    for (const t of ["1. 검사할 코드", "폴더 선택", "파일 선택", "검사하기", "tsconfig.json·jsconfig.json도 함께 선택하면", "없으면 별칭으로 가져온 import는", "설계도를 먼저 만들어 두어야 합니다", "저장하지 않으며", "새로고침하면 사라집니다"]) expect(out).toContain(t);
    expect(out).not.toContain("2. 검사 결과");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>검사하기<\/button>/);
    expect(out).toContain("검사할 .ts·.tsx 파일을 올려 주세요.");
  });

  it("폴더·파일 입력은 숨기고 버튼으로 대신한다", () => {
    const inputs = out.match(/<input[^>]*type="file"[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(2);
    for (const i of inputs) expect(i).toMatch(/\bhidden\b/);
  });
});

describe("ResultView: 기준 판·집계·카드", () => {
  const data = response("renamed");

  it("기준 판·설계 준수 집계·금지 규칙·설정 파일·서버 시간을 보인다", () => {
    const out = view(data);
    for (const t of ["설계도 판 3 기준(지시서를 내보낸 판)", "설계 항목 65개 중 일치 56개 · 불일치 0개 · 확인 필요 9개", "금지 규칙(인라인 style·바깥 여백): 위반 0개 · 확인 불가 2개", "설정 파일 1개 읽음 / 못 따라간 설정 0개", "서버 처리 12ms (이 서버의 첫 요청)", "확인 필요 3건", "확실한 항목 0건"]) expect(out).toContain(t);
  });

  it("후보 코드는 이름·파일 경로·근거와 [같은 것으로 짝짓기]를 보인다", () => {
    const out = view(data);
    expect(out).toContain("ItemImages");
    expect(out).toContain("src/entities/product/ui/ItemImages.tsx");
    expect(out).toContain("ProductGallery를 ItemImages(src/entities/product/ui/ItemImages.tsx)와 같은 것으로 짝짓기");
    expect(out).toContain("수정 요청에 포함");
    expect(out).toContain(">무시<");
  });

  it("다른 노드의 1순위이기도 한 후보에는 그 사실을 보인다", () => {
    const withContest: CheckResponse = { ...data, pairReviews: data.pairReviews.map((p) => ({ ...p, candidates: p.candidates.map((c) => ({ ...c, contestedBy: ["PriceTag"] })) })) };
    expect(view(withContest)).toContain("다른 노드(PriceTag)의 1순위 후보이기도 함");
    expect(view(data)).not.toContain("1순위 후보이기도 함");
  });

  it("무시한 카드는 설명을 접고 표시만 남기며, 포함한 카드는 포함됨 표시와 지시서 항목이 생긴다", () => {
    const id = "IC-01|n-gallery|pair";
    const base = view(data);
    expect(base).toContain("ProductGallery의 짝이 ItemImages인지 확인이 필요합니다.");
    const ignored = view(data, { [id]: "ignore" });
    expect(ignored).toContain("무시함");
    expect(ignored).not.toContain("ProductGallery의 짝이 ItemImages인지 확인이 필요합니다.");
    expect(ignored).toMatch(/aria-pressed="true"[^>]*>무시<\/button>/); // 라벨은 고정하고 눌림 상태만 알린다
    const included = view(data, { [id]: "include" });
    expect(included).toContain("수정 요청에 포함됨");
    expect(included).toContain("## 확인 뒤 수정");
    expect(base).not.toContain("## 확인 뒤 수정");
  });

  it("무시·포함은 설계 준수 집계를 바꾸지 않는다(화면의 집계 줄·제목이 모든 선택에서 같다)", () => {
    const ids = data.result.findings.filter((f) => f.certainty === "review").map((f) => f.id);
    const allIgnored = Object.fromEntries(ids.map((i) => [i, "ignore" as const]));
    const allIncluded = Object.fromEntries(ids.map((i) => [i, "include" as const]));
    const lines = (out: string) => ({
      summary: out.match(/설계 항목 [^<]*/)?.[0],
      review: out.match(/확인 필요 \d+건/)?.[0],
      header: out.match(/설계 준수: [^\n]*/)?.[0],
    });
    const none = lines(view(data));
    expect(lines(view(data, allIgnored))).toEqual(none);
    expect(lines(view(data, allIncluded))).toEqual(none);
    expect(none.summary).toBe("설계 항목 65개 중 일치 56개 · 불일치 0개 · 확인 필요 9개");
    expect(none.review).toBe("확인 필요 3건");
    expect(none.header).toBe("설계 준수: 65개 중 일치 56개 (불일치 0, 확인 필요 9)");
  });

  it("확정한 짝이 있으면 목록과 [확정 취소]를 보인다. 파일이 바뀌면 다시 검사하라는 안내를 보인다", () => {
    const out = view(data, {}, { confirmed: [{ nodeId: "n-gallery", path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages" }], nameOf: () => "ProductGallery", stale: true });
    expect(out).toContain("확정한 짝 1개");
    expect(out).toContain("ProductGallery ↔ ItemImages");
    expect(out).toContain("ProductGallery의 확정 취소");
    expect(out).toContain("올린 파일이 바뀌었습니다");
    expect(view(data)).not.toContain("올린 파일이 바뀌었습니다");
  });

  it("확실한 항목(wrong-IC-03)과 수정 지시서 카드를 그린다", () => {
    const out = view(response("wrong-IC-03", { source: "latest", newerRevision: 5 }));
    for (const t of ["확실한 항목 1건", "IC-03 · AddToCartButton", "내보낸 기록이 없어 최신 판 3 기준. 이후 판 5가 있습니다.", "3. 수정 지시서", "implementation-fix-prompt.md · 저장하지 않음", "복사", ".md 내려받기"]) expect(out).toContain(t);
  });

  it("고칠 것이 없는 결과(correct)도 그린다", () => {
    const out = view(response("correct"));
    expect(out).toContain("설계와 다르다고 확인된 항목이 없습니다.");
    expect(out).toContain("확인이 필요한 항목이 없습니다.");
    expect(out).toContain("고칠 항목이 없습니다.");
  });
});

describe("result-view 계산", () => {
  it("구역을 나눈다: 확실(설계 밖 제외)·확인 필요·설계 밖", () => {
    const g = groupFindings(response("wrong-IC-02").result.findings);
    expect(g.certain).toEqual([]);
    expect(g.outside.map((f) => f.rule)).toEqual(["IC-02"]);
    expect(groupFindings(response("renamed").result.findings).review).toHaveLength(3);
  });

  it("기준 판·설정·집계 문구", () => {
    expect(baselineText({ revision: 2, source: "export" })).toBe("설계도 판 2 기준(지시서를 내보낸 판)");
    expect(baselineText({ revision: 2, source: "latest", newerRevision: 4 })).toBe("내보낸 기록이 없어 최신 판 2 기준. 이후 판 4가 있습니다.");
    expect(configText({ read: 2, unsupported: 1 })).toBe("설정 파일 2개 읽음 / 못 따라간 설정 1개(그 설정에 기대는 import는 해석하지 못해 확인 필요로 보냄)");
    expect(designSummaryText({ design: { total: 4, match: 3, mismatch: 1, review: 0 }, ban: { violated: 0, unknown: 0 }, outsideDesign: 0, outOfScope: [] })).toBe("설계 항목 4개 중 일치 3개 · 불일치 1개 · 확인 필요 0개");
  });

  it("제거된 확정 짝을 사유와 함께 알린다(노드 이름을 모르면 id)", () => {
    expect(removedTexts([{ nodeId: "n-gallery", reason: "unknown-code" }, { nodeId: "x", reason: "already-certain-node" }], (id) => (id === "n-gallery" ? "ProductGallery" : id))).toEqual([
      "ProductGallery: 올린 코드에 없는 컴포넌트·훅입니다.",
      "x: 이미 확실한 짝이 있는 노드를 다른 코드로 확정할 수 없습니다.",
    ]);
  });
});
