import { describe, expect, it } from "vitest";
import { describeLimitProblems, UPLOAD_LIMITS } from "../code-model/filter-files";
import { summarizeUpload } from "./upload-summary";

const e = (path: string, size = 100) => ({ path, size });

describe("summarizeUpload", () => {
  const entries = [e("src/ui/A.tsx"), e("src/ui/types.ts"), e("src/ui/A.test.tsx"), e("node_modules/x/B.tsx"), e("README.md")];

  it("전체 N개 중 분석 대상 M개와 거른 이유별 개수", () => {
    const s = summarizeUpload(entries, new Set());
    expect(s.total).toBe(5);
    expect(s.accepted.map((a) => a.path)).toEqual(["src/ui/A.tsx", "src/ui/types.ts"]);
    expect(s.rejectedByReason).toEqual({ "test-or-story": 1, "excluded-dir": 1, "not-source": 1 });
    expect(s.problems).toEqual([]);
  });

  it("체크를 해제한 파일은 보내지 않는다(분석 대상 수는 그대로)", () => {
    const s = summarizeUpload(entries, new Set(["src/ui/types.ts"]));
    expect(s.accepted).toHaveLength(2);
    expect(s.selected.map((a) => a.path)).toEqual(["src/ui/A.tsx"]);
  });

  it("상한은 체크한 파일 기준: 체크를 해제하면 상한 안으로 들어올 수 있다", () => {
    const many = Array.from({ length: UPLOAD_LIMITS.maxFiles + 2 }, (_, i) => e(`src/f${i}.tsx`));
    expect(summarizeUpload(many, new Set()).problems).toEqual([{ kind: "too-many-files" }]);
    expect(summarizeUpload(many, new Set(["src/f0.tsx", "src/f1.tsx"])).problems).toEqual([]);
  });

  it("거른 파일은 상한에 세지 않는다", () => {
    const big = [e("node_modules/p/Big.tsx", 5 * 1024 * 1024), e("src/A.tsx")];
    expect(summarizeUpload(big, new Set()).problems).toEqual([]);
  });
});

describe("describeLimitProblems", () => {
  it("문제가 없으면 빈 문자열, 있으면 더 좁은 폴더 안내를 붙인다", () => {
    expect(describeLimitProblems([])).toBe("");
    const msg = describeLimitProblems([{ kind: "too-many-files" }, { kind: "total-too-large" }]);
    expect(msg).toContain("파일이 30개를 넘습니다.");
    expect(msg).toContain("파일 합계가 1MB를 넘습니다.");
    expect(msg).toContain("더 좁은 폴더(예: src/components/ui)를 선택하세요");
  });
});
