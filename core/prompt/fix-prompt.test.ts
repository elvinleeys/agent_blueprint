import { describe, expect, it } from "vitest";
import { readCodeModel } from "../code-model/facts";
import { loadBlueprint, loadCode } from "../impl-check/load-fixture";
import { checkImplementation } from "../impl-check/run";
import { FIX_ACTIONS, buildFixPrompt, type FixPromptInput } from "./fix-prompt";

// 수정 지시서(승인된 기대 결과 표): 입력은 fixtures/implementation-check/next 사례의 검사 결과다.

const BASE: FixPromptInput["baseline"] = { revision: 3, source: "export" };
const check = (name: string, confirmed: Parameters<typeof checkImplementation>[2] = []) => checkImplementation(loadBlueprint("next", name), readCodeModel(loadCode("next", name)), confirmed);
const build = (name: string, include: string[] = [], baseline = BASE) => buildFixPrompt({ baseline, result: check(name), include });
const headerOf = (doc: string) => doc.split("\n").find((l) => l.startsWith("> 설계 준수"));

describe("고칠 것이 없음과 확실한 항목", () => {
  it("correct: 고칠 항목이 없고 설계 준수는 65개 중 일치 65개", () => {
    const doc = build("correct");
    expect(doc).toContain("## 고칠 항목\n\n고칠 항목이 없습니다.");
    expect(doc).not.toContain("## 확실한 수정");
    expect(doc).not.toContain("## 확인 뒤 수정");
    expect(headerOf(doc)).toBe("> 설계 준수: 65개 중 일치 65개 (불일치 0, 확인 필요 0)");
  });

  it("wrong-IC-03: 확실한 항목 1개(IC-03 · AddToCartButton), 근거에 파일 경로, 일치 64개", () => {
    const doc = build("wrong-IC-03");
    expect(doc).toContain("## 확실한 수정 (오류 → 경고 → 정보 순)");
    expect(doc.match(/^### /gm)).toHaveLength(1);
    expect(doc).toContain("### 1. [IC-03 · 경고] AddToCartButton");
    expect(doc).toMatch(/- 근거: .*\.tsx/);
    expect(doc).toContain(`- 할 일: ${FIX_ACTIONS["IC-03"]}`);
    expect(headerOf(doc)).toBe("> 설계 준수: 65개 중 일치 64개 (불일치 1, 확인 필요 0)");
  });

  it("오류 → 경고 → 정보 순(검사 결과 순서 그대로)", () => {
    const result = check("wrong-ICN-03");
    const doc = buildFixPrompt({ baseline: BASE, result, include: [] });
    const labels = [...doc.matchAll(/^### \d+\. \[[A-Z0-9-]+ · (오류|경고|정보)\]/gm)].map((m) => m[1]);
    const rank = { 오류: 0, 경고: 1, 정보: 2 } as const;
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.map((l) => rank[l as keyof typeof rank])).toEqual([...labels.map((l) => rank[l as keyof typeof rank])].sort());
    expect(doc).toContain("### 1. [ICN-03 · 오류]");
  });

  it("설계 밖 발견(IC-02)은 고칠 항목이 아니라 '건드리지 않을 것'에 이름만", () => {
    const doc = build("wrong-IC-02");
    expect(doc).toContain("## 고칠 항목\n\n고칠 항목이 없습니다.");
    expect(doc).toMatch(/## 건드리지 않을 것\n\n- 설계 밖: .*설계에 없는 컴포넌트.*\n- 위에 적지 않은 코드는 바꾸지 않는다\n/);
    expect(doc.match(/^### /gm)).toBeNull();
  });
});

describe("확인 필요 항목: 기본은 제외, 포함한 것만 '확인 뒤 수정'", () => {
  const result = check("renamed");
  const reviewIds = result.findings.filter((f) => f.certainty === "review").map((f) => f.id);
  const galleryId = "IC-01|n-gallery|pair";

  it("renamed 검사 결과는 확인 필요 3건(IC-01·IC-05·IC-06)이다", () => {
    expect(result.findings.filter((f) => f.certainty === "review").map((f) => f.rule).sort()).toEqual(["IC-01", "IC-05", "IC-06"]);
    expect(reviewIds).toContain(galleryId);
  });

  it("포함하지 않으면 '확인 뒤 수정' 구역이 없고, '건드리지 않을 것'에는 확인 필요 건수를 적지 않는다. 집계는 56/65·확인 필요 9", () => {
    const doc = build("renamed");
    expect(doc).not.toContain("## 확인 뒤 수정");
    expect(doc).toContain("## 건드리지 않을 것\n\n- 위에 적지 않은 코드는 바꾸지 않는다\n");
    expect(doc).not.toMatch(/확인 필요 항목 \d+건/);
    expect(headerOf(doc)).toBe("> 설계 준수: 65개 중 일치 56개 (불일치 0, 확인 필요 9)");
  });

  it("IC-01 카드를 포함하면 그 항목만 '확인 뒤 수정'에 나오고, 포함하지 않은 둘은 건수로도 적지 않는다", () => {
    const doc = build("renamed", [galleryId]);
    expect(doc).toContain("## 확인 뒤 수정 (사용자가 포함한 확인 필요 항목)");
    expect(doc.match(/^### /gm)).toHaveLength(1);
    expect(doc).toContain("### 1. [IC-01 · 짝 확인 필요] ProductGallery ↔ ItemImages");
    expect(doc).not.toMatch(/확인 필요 항목 \d+건/);
  });

  it("IC-01 짝 확인 필요의 할 일은 import 경로·이름 변경까지 적는다", () => {
    const doc = build("renamed", [galleryId]);
    expect(doc).toContain("후보 코드(ItemImages)가 설계의 ProductGallery가 맞는지 확인한 뒤, 맞으면 설계 이름·위치로 맞추고 설계대로 고친다. 이 컴포넌트를 가져오는 모든 파일의 import 경로와 가져오는 이름도 함께 변경한다.");
  });

  it("다른 확인 필요 항목의 할 일은 확인 뒤 설계대로 고치되 확실하지 않으면 보고", () => {
    const doc = build("renamed", reviewIds);
    expect(doc).toContain("- 할 일: 설계와 맞는지 확인하고, 다르면 설계대로 고친다. 확실하지 않으면 고치지 말고 보고한다.");
    expect(doc.match(/^### /gm)).toHaveLength(3);
  });

  it("포함하지 않아도 집계를 바꾸지 않는다: 모두 포함한 문서와 모두 제외한 문서의 머리말이 같고 항목 구역만 다르다", () => {
    const all = build("renamed", reviewIds);
    const none = build("renamed", []);
    expect(headerOf(all)).toBe(headerOf(none));
    expect(headerOf(none)).toContain("일치 56개 (불일치 0, 확인 필요 9)");
    expect(all).not.toBe(none);
  });

  it("검사 결과가 가진 집계 숫자는 지시서를 만들어도 바뀌지 않는다(입력 summary 불변)", () => {
    const before = JSON.stringify(result.summary);
    buildFixPrompt({ baseline: BASE, result, include: reviewIds });
    buildFixPrompt({ baseline: BASE, result, include: [] });
    expect(JSON.stringify(result.summary)).toBe(before);
  });
});

describe("같은 입력이면 같은 출력", () => {
  it("같은 입력을 두 번, 포함 목록의 순서·중복을 바꿔도 문자열이 같다", () => {
    const ids = check("renamed").findings.filter((f) => f.certainty === "review").map((f) => f.id);
    const a = build("renamed", ids);
    expect(build("renamed", ids)).toBe(a);
    expect(build("renamed", [...ids].reverse())).toBe(a);
    expect(build("renamed", [...ids, ...ids])).toBe(a);
    expect(build("renamed", [...ids, "없는|카드|id"])).toBe(a);
  });
});

describe("기준 판 머리말", () => {
  it("지시서를 내보낸 판 / 내보낸 기록이 없어 최신 판 / 이후 판이 있음", () => {
    expect(build("correct")).toContain("> 출처: implementation-check (AgentBlueprint 구현 검사). 기준: 설계도 판 3(지시서를 내보낸 판)");
    expect(build("correct", [], { revision: 4, source: "latest" })).toContain("기준: 설계도 판 4(내보낸 기록이 없어 최신 판)");
    const newer = build("correct", [], { revision: 3, source: "export", newerRevision: 5 });
    expect(newer).toContain("> 이후 판 5가 있습니다. 이 지시서는 판 3 기준입니다.");
    expect(build("correct")).not.toContain("이후 판");
  });
});

describe("규칙 문구와 코드 내용", () => {
  it("모든 구현 검사 규칙(확실한 카드)에 '할 일' 문구가 있고 ICN-03은 children으로 넘기게 한다", () => {
    const rules = ["IC-01", ...Array.from({ length: 10 }, (_, i) => `IC-${String(i + 3).padStart(2, "0")}`), "ICN-01", "ICN-02", "ICN-03", "ICN-04", "ICR-01", "ICF-01"];
    for (const r of rules) expect(FIX_ACTIONS[r], r).toBeTruthy();
    expect(FIX_ACTIONS["ICN-03"]).toBe("server 컴포넌트를 client 파일에서 직접 가져오지 말고, server 부모에서 children으로 넘긴다.");
    expect(FIX_ACTIONS["IC-02"]).toBeUndefined(); // 설계 밖 발견은 고칠 항목이 아니다
  });

  it("코드 본문(표식 문자열)은 지시서에 들어가지 않는다", () => {
    const MARK = "SECRET_CODE_MARKER_5530";
    const bp = loadBlueprint("next", "wrong-IC-03");
    const files = loadCode("next", "wrong-IC-03").map((f) => (f.path.endsWith("AddToCartButton.tsx") ? { ...f, content: `// ${MARK}\n${f.content}` } : f));
    const doc = buildFixPrompt({ baseline: BASE, result: checkImplementation(bp, readCodeModel(files)), include: [] });
    expect(doc).toContain("AddToCartButton");
    expect(doc).not.toContain(MARK);
  });
});
