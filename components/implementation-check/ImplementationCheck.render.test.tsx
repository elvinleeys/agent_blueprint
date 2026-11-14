import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readCodeModel } from "@/core/code-model/facts";
import { loadBlueprint, loadCode } from "@/core/impl-check/load-fixture";
import { checkImplementation } from "@/core/impl-check/run";
import type { CheckResponse, PairReview } from "@/lib/client/run-implementation-check";
import ImplementationCheckPanel, { AI_RESTRICTED_TEXT, AI_SEND_NOTE, REPO_RESTRICTED_TEXT, RepoSource } from "./ImplementationCheckPanel";
import ResultView from "./ResultView";
import { baselineText, configText, designSummaryText, groupFindings, removedTexts, repoText } from "./result-view";
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

const view = (data: CheckResponse, selection: Selection = new Set(), extra: Partial<React.ComponentProps<typeof ResultView>> = {}) =>
  text(<ResultView data={data} confirmed={[]} selection={selection} running={false} stale={false} nameOf={(id) => id} onToggle={() => {}} onConfirm={() => {}} onCancelConfirm={() => {}} {...extra} />);

describe("ImplementationCheckPanel", () => {
  const out = text(<ImplementationCheckPanel projectId="p1" onGoStructure={() => {}} />);

  it("업로드 칸·검사 버튼·tsconfig 안내를 그리고, 결과는 아직 없다", () => {
    for (const t of ["1. 검사할 코드", "폴더 선택", "파일 선택", "검사하기", "tsconfig.json·jsconfig.json도 함께 선택하면", "폴더 선택을 권장합니다", "프로젝트 맨 위 설정으로 간주", "json 파일은 이 두 설정 파일만 씁니다", "설계도를 먼저 만들어 두어야 합니다", "저장하지 않으며", "새로고침하면 사라집니다"]) expect(out).toContain(t);
    expect(out).not.toContain("2. 검사 결과");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>검사하기<\/button>/);
    expect(out).toContain("검사할 .ts·.tsx 파일을 올려 주세요.");
  });

  it("코드를 가져오는 방법(폴더 올리기·GitHub 저장소)을 고르고, 처음은 폴더 올리기", () => {
    expect(out).toContain("검사할 코드를 가져오는 방법");
    expect(out).toMatch(/<input[^>]*type="radio"[^>]*checked=""[^>]*>폴더 올리기/);
    expect(out).toContain("GitHub 저장소");
  });

  it("허용되지 않은 사용자(기본값)는 처음 화면부터 '현재 제한된 기능' 안내가 보이고 GitHub 저장소를 고를 수 없다", () => {
    // 서버 설정이 꺼진 경우와 허용 목록 밖인 경우는 모두 WorkspaceLoader가 false로 내려 준다(판단은 lib/api/feature-access.test.ts)
    expect(out).toContain(REPO_RESTRICTED_TEXT);
    expect(out).toMatch(/<input[^>]*type="radio"[^>]*disabled=""[^>]*aria-describedby="ic-repo-restricted"[^>]*>GitHub 저장소 \(제한됨\)/);
    expect(out).toMatch(/<p id="ic-repo-restricted"[^>]*>GitHub 저장소 검사는 현재 제한된 기능으로, 허용된 계정에서만 쓸 수 있습니다/);
  });

  it("허용된 사용자는 안내 없이 GitHub 저장소를 고를 수 있다", () => {
    const allowed = text(<ImplementationCheckPanel projectId="p1" onGoStructure={() => {}} repoCheckAllowed />);
    expect(allowed).not.toContain(REPO_RESTRICTED_TEXT);
    // AI 켜기가 "(제한됨)"을 따로 보일 수 있어 저장소 선택지만 본다(5-5, 사용자 승인 2026-11-14)
    expect(allowed).not.toContain("GitHub 저장소 (제한됨)");
    expect(allowed).toMatch(/<input[^>]*type="radio"[^>]*name="ic-mode"(?![^>]*disabled="")[^>]*>GitHub 저장소/);
  });

  it("폴더·파일 입력은 숨기고 버튼으로 대신한다", () => {
    const inputs = out.match(/<input[^>]*type="file"[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(2);
    for (const i of inputs) expect(i).toMatch(/\bhidden\b/);
  });
});

describe("AI 제안 켜기", () => {
  it("허용되지 않은 사용자(기본값)는 막힌 선택지와 '현재 제한된 기능' 안내만 보인다", () => {
    const out = text(<ImplementationCheckPanel projectId="p1" onGoStructure={() => {}} />);
    expect(out).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*aria-describedby="ic-ai-note"[^>]*>AI 제안도 받기 \(OpenAI\) \(제한됨\)/);
    expect(out).toContain(AI_RESTRICTED_TEXT);
    expect(out).not.toContain(AI_SEND_NOTE);
  });

  it("허용된 사용자는 켜기 전부터 무엇이 외부 AI로 전송되는지 안내가 보이고, 처음은 꺼져 있다", () => {
    const out = text(<ImplementationCheckPanel projectId="p1" onGoStructure={() => {}} aiAllowed />);
    expect(out).toContain("코드 일부가 외부 AI(OpenAI)로 전송됩니다");
    expect(out).toContain("파일 전체는 보내지 않고 저장하지 않습니다");
    expect(out).toContain("AI 의견은 설계 준수 집계에 넣지 않습니다");
    expect(out).toMatch(/<input type="checkbox"(?![^>]*checked="")(?![^>]*disabled="")[^>]*aria-describedby="ic-ai-note"[^>]*>AI 제안도 받기 \(OpenAI\)<\/label>/);
    expect(out).not.toContain(AI_RESTRICTED_TEXT);
  });
});

describe("AI 제안 구역(ResultView)", () => {
  const data = response("renamed");
  const PAIR = { nodeId: "n-gallery", path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages", verdict: "same" as const, reason: "images prop으로 이미지를 그린다.", id: "AI|pair|n-gallery|src/entities/product/ui/ItemImages.tsx#ItemImages", nodeName: "ProductGallery" };
  const MISSING = { nodeId: "n-cart", responsibility: "수량 검증", verdict: "missing" as const, reason: "수량을 확인하는 코드가 없다.", id: "AI|resp|n-cart|수량 검증", nodeName: "AddToCartButton" };
  const DONE = { nodeId: "n-price", responsibility: "가격 표시", verdict: "done" as const, reason: "가격을 그린다.", id: "AI|resp|n-price|가격 표시", nodeName: "PriceTag" };
  const META = { model: "gpt-6.1-terra", attempts: 1, elapsedMs: 1000, costUsd: 0.01 };
  const OMIT = { pairNodes: [], responsibilityNodes: [] };
  const ok: NonNullable<CheckResponse["ai"]> = { status: "ok", suggestions: { pairs: [PAIR], responsibilities: [MISSING, DONE], dropped: 0 }, omitted: OMIT, meta: META };

  it("AI 제안이 없으면 구역을 그리지 않는다", () => {
    expect(view(data)).not.toContain("AI 제안");
  });

  it("짝 제안은 판정·근거와 [받아들이기], 책임 제안은 missing에만 '수정 요청에 포함' 체크(기본 꺼짐)", () => {
    const out = view(data, undefined, { ai: ok });
    expect(out).toContain("AI 의견 · 집계에 넣지 않음");
    expect(out).toContain("ProductGallery ↔ ItemImages: 같은 것으로 보임");
    expect(out).toContain("AI 근거: images prop으로 이미지를 그린다.");
    expect(out).toContain('aria-label="받아들이기: ProductGallery ↔ ItemImages"');
    expect(out).toContain("코드 검사 판정이 아니라, AI가 코드 조각을 보고 낸 의견입니다");
    expect(out).toContain("[받아들이기]를 누르면 그 짝을 직접 고른 것처럼 확정하고 코드로 다시 검사합니다");
    expect(out).toContain("체크한 것은 수정 지시서에만 들어가고 설계 준수 집계는 바뀌지 않습니다");
    expect(out).toMatch(/<section[^>]*aria-labelledby="ic-ai-title"/);
    expect(out).toContain("AddToCartButton · 수량 검증: 수행하지 않은 것 같음");
    expect(out).toContain("PriceTag · 가격 표시: 수행함");
    const aiChecks = out.match(/<input id="ic-ai-include-[^"]*"[^>]*>/g) ?? [];
    expect(aiChecks).toHaveLength(1);
    expect(aiChecks[0]).not.toMatch(/checked=""/);
    expect(out).toContain("수행하지 않은 것 같은 책임 1건 중 0건을 수정 요청에 포함했습니다.");
  });

  it("짝이 이미 정해진 노드(확인 필요가 아님)의 짝 제안과 '같음'이 아닌 짝 제안의 받아들이기는 보이지 않는다", () => {
    const correct = response("correct");
    expect(view(correct, undefined, { ai: ok })).not.toContain("ProductGallery ↔ ItemImages");
    const differ: NonNullable<CheckResponse["ai"]> = { ...ok, suggestions: { ...ok.suggestions, pairs: [{ ...PAIR, verdict: "different" }] } };
    const out = view(data, undefined, { ai: differ });
    expect(out).toContain("ProductGallery ↔ ItemImages: 다른 것으로 보임");
    expect(out).not.toContain("받아들이기: ");
  });

  it("missing을 체크하면 수정 지시서에 'AI 제안(사용자 확인)'이 생기지만, 설계 준수 집계·확인 필요 카드 수는 바뀌지 않는다", () => {
    const lines = (out: string) => ({
      summary: out.match(/설계 항목 \d+개 중 일치 \d+개 · 불일치 \d+개 · 확인 필요 \d+개/)?.[0],
      review: out.match(/확인 필요 카드 \d+장 중 \d+장 포함/)?.[0],
      header: out.match(/설계 준수: [^\n]*/)?.[0],
    });
    const off = view(data, new Set(), { ai: ok });
    const on = view(data, new Set([MISSING.id]), { ai: ok });
    expect(off).not.toContain("## AI 제안(사용자 확인)");
    expect(on).toContain("## AI 제안(사용자 확인)");
    expect(on).toContain("[AI 제안 · 책임 확인] AddToCartButton");
    expect(on).toContain("수행하지 않은 것 같은 책임 1건 중 1건을 수정 요청에 포함했습니다.");
    expect(lines(on)).toEqual(lines(off));
    expect(lines(on)).toEqual(lines(view(data)));
    expect(lines(on).summary).toBe("설계 항목 65개 중 일치 56개 · 불일치 0개 · 확인 필요 9개");
  });

  it("실패·건너뜀·생략을 알린다(코드 판정 결과는 그대로라고)", () => {
    const failed = view(data, undefined, { ai: { status: "failed", failure: "timeout", omitted: OMIT, meta: META } });
    expect(failed).toContain("AI 제안을 받지 못했습니다(AI 응답이 시간 안에 오지 않았습니다). 위의 코드 판정 결과는 그대로이고, 잠시 뒤 “다시 검사하기”로 다시 시도할 수 있습니다.");
    expect(view(data, undefined, { ai: { status: "skipped", omitted: OMIT } })).toContain("AI를 부르지 않았습니다");
    const omitted = view(data, undefined, { ai: { ...ok, omitted: { pairNodes: [], responsibilityNodes: ["PriceTag", "useCart"] } } });
    expect(omitted).toContain("AI에 보내지 않은 대상: 책임 확인 PriceTag, useCart");
  });
});

describe("RepoSource: GitHub 저장소 입력", () => {
  const repo = (urlError: string | null = null, subdirError: string | null = null) =>
    text(<RepoSource url="" subdir="" onUrl={() => {}} onSubdir={() => {}} urlError={urlError} subdirError={subdirError} disabled={false} />);

  it("저장소 주소(필수)·하위 폴더(선택) 입력칸(라벨 연결)과 브랜치 안내를 보이고, 오류가 없으면 알림이 없다", () => {
    const out = repo();
    expect(out).toMatch(/<label[^>]*for="ic-repo-url"[^>]*>저장소 주소 <span[^>]*>\(필수\)/);
    expect(out).toMatch(/<input[^>]*id="ic-repo-url"[^>]*aria-invalid="false"/);
    expect(out).toMatch(/<input[^>]*id="ic-repo-subdir"/);
    expect(out).toContain("공개 저장소만 검사할 수 있습니다");
    expect(out).toContain("/tree/브랜치 이름을 붙이세요");
    expect(out).not.toContain('role="alert"');
  });

  it("주소 오류와 하위 폴더 오류는 각 칸에 따로 붙고(낭독기 알림), 브랜치 안내는 그대로 남는다", () => {
    const bad = repo("github.com의 https 주소만 받습니다.");
    expect(bad).toMatch(/<input[^>]*id="ic-repo-url"[^>]*aria-describedby="ic-repo-url-error ic-repo-hint"[^>]*aria-invalid="true"|<input[^>]*id="ic-repo-url"[^>]*aria-invalid="true"[^>]*aria-describedby="ic-repo-url-error ic-repo-hint"/);
    expect(bad).toMatch(/<p id="ic-repo-url-error" role="alert"[^>]*>github.com의 https 주소만 받습니다\./);
    expect(bad).toContain("/tree/브랜치 이름을 붙이세요");
    const sub = repo(null, "하위 폴더는 apps/web처럼 저장소 안의 상대 경로로 넣어 주세요.");
    expect(sub).toMatch(/<input[^>]*id="ic-repo-subdir"[^>]*aria-invalid="true"/);
    expect(sub).toMatch(/<input[^>]*id="ic-repo-url"[^>]*aria-invalid="false"/);
    expect(sub).toMatch(/<p id="ic-repo-subdir-error" role="alert"/);
  });
});

describe("ResultView: 기준 판·집계·카드", () => {
  it("GitHub 저장소에서 읽은 결과면 저장소·브랜치·커밋·하위 폴더를 보이고, 올린 파일이면 보이지 않는다", () => {
    const r = response("correct");
    const out = view({ ...r, repo: { name: "acme/shop", ref: "main", commit: "0123456789abcdef0123456789abcdef01234567", subdir: "apps/web" } });
    expect(out).toContain("GitHub acme/shop · 브랜치 main · 커밋 0123456 · 하위 폴더 apps/web");
    expect(view(r)).not.toContain("GitHub ");
    // 같은 커밋으로 다시 검사한 결과(ref가 커밋 id)는 브랜치를 따로 적지 않는다
    expect(repoText({ name: "acme/shop", ref: "0123456789abcdef0123456789abcdef01234567", commit: "0123456789abcdef0123456789abcdef01234567", subdir: null })).toBe("GitHub acme/shop · 커밋 0123456");
  });

  const data = response("renamed");

  it("기준 판·설계 준수 집계·금지 규칙·설정 파일·서버 시간을 보인다", () => {
    const out = view(data);
    for (const t of ["설계도 판 3 기준(지시서를 내보낸 판)", "설계 항목 65개 중 일치 56개 · 불일치 0개 · 확인 필요 9개", "금지 규칙(인라인 style·바깥 여백): 위반 0개 · 확인 불가 2개", "설정 파일 1개 읽음 / 못 따라간 설정 0개", "서버 처리 12ms (이 서버의 첫 요청)", "확인 필요 카드 3장", "확실한 카드 0장"]) expect(out).toContain(t);
  });

  it("후보 코드는 이름·파일 경로·근거와 [같은 것으로 짝짓기]를 보인다", () => {
    const out = view(data);
    expect(out).toContain("ItemImages");
    expect(out).toContain("src/entities/product/ui/ItemImages.tsx");
    expect(out).toContain("ProductGallery를 ItemImages(src/entities/product/ui/ItemImages.tsx)와 같은 것으로 짝짓기");
    expect(out).toContain("수정 요청에 포함");
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
    expect(out).not.toContain(">무시<");
  });

  it("다른 노드의 1순위이기도 한 후보에는 그 사실을 보인다", () => {
    const withContest: CheckResponse = { ...data, pairReviews: data.pairReviews.map((p) => ({ ...p, candidates: p.candidates.map((c) => ({ ...c, contestedBy: ["PriceTag"] })) })) };
    expect(view(withContest)).toContain("다른 노드(PriceTag)의 1순위 후보이기도 함");
    expect(view(data)).not.toContain("1순위 후보이기도 함");
  });

  it("체크한 카드는 체크 상태·포함됨 표시·지시서 항목이 생기고, 'N장 중 M장 포함'이 바뀐다. 미결정 문구는 없다", () => {
    const id = "IC-01|n-gallery|pair";
    const base = view(data);
    expect(base).toContain("ProductGallery의 짝이 ItemImages인지 확인이 필요합니다.");
    expect(base).toContain("확인 필요 카드 3장 중 0장 포함");
    expect(base).not.toMatch(/checked=""/);
    expect(base).not.toContain("## 확인 뒤 수정");
    const included = view(data, new Set([id]));
    expect(included).toContain("확인 필요 카드 3장 중 1장 포함");
    expect(included).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
    expect(included).toContain("수정 요청에 포함됨");
    expect(included).toContain("## 확인 뒤 수정");
    for (const out of [base, included]) expect(out).not.toContain("미결정");
  });

  it("체크는 설계 준수 집계를 바꾸지 않는다(화면의 집계 줄·제목이 모든 선택에서 같다)", () => {
    const ids = data.result.findings.filter((f) => f.certainty === "review").map((f) => f.id);
    const noneChecked: Selection = new Set();
    const allIncluded: Selection = new Set(ids);
    const lines = (out: string) => ({
      summary: out.match(/설계 항목 \d+개 중 일치 \d+개 · 불일치 \d+개 · 확인 필요 \d+개/)?.[0],
      review: out.match(/확인 필요 카드 \d+장/)?.[0],
      header: out.match(/설계 준수: [^\n]*/)?.[0],
    });
    const none = lines(view(data));
    expect(lines(view(data, noneChecked))).toEqual(none);
    expect(lines(view(data, allIncluded))).toEqual(none);
    expect(none.summary).toBe("설계 항목 65개 중 일치 56개 · 불일치 0개 · 확인 필요 9개");
    expect(none.review).toBe("확인 필요 카드 3장");
    expect(none.header).toBe("설계 준수: 65개 중 일치 56개 (불일치 0, 확인 필요 9)");
  });

  it("확정한 짝이 있으면 목록과 [확정 취소]를 보인다. 파일이 바뀌면 다시 검사하라는 안내를 보인다", () => {
    const out = view(data, undefined, { confirmed: [{ nodeId: "n-gallery", path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages" }], nameOf: () => "ProductGallery", stale: true });
    expect(out).toContain("확정한 짝 1개");
    expect(out).toContain("ProductGallery ↔ ItemImages");
    expect(out).toContain("ProductGallery의 확정 취소");
    expect(out).toContain("올린 파일이 바뀌었습니다");
    expect(view(data)).not.toContain("올린 파일이 바뀌었습니다");
  });

  it("확실한 항목(wrong-IC-03)과 수정 지시서 카드를 그린다", () => {
    const out = view(response("wrong-IC-03", { source: "latest", newerRevision: 5 }));
    for (const t of ["확실한 카드 1장", "IC-03 · AddToCartButton", "내보낸 기록이 없어 최신 판 3 기준. 이후 판 5가 있습니다.", "3. 수정 지시서", "implementation-fix-prompt.md · 저장하지 않음", "복사", ".md 내려받기"]) expect(out).toContain(t);
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
