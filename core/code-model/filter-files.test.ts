import { describe, expect, it } from "vitest";
import { checkLimits, filterFiles, UPLOAD_LIMITS } from "./filter-files";

const e = (path: string, size = 100) => ({ path, size });
const reasons = (paths: string[]) => filterFiles(paths.map((p) => e(p))).rejected.map((r) => [r.entry.path, r.reason]);

describe("filterFiles", () => {
  it(".tsx와 .ts를 남긴다", () => {
    const { accepted } = filterFiles([e("src/ui/Button.tsx"), e("src/ui/types.ts"), e("Card.tsx")]);
    expect(accepted.map((a) => a.path)).toEqual(["src/ui/Button.tsx", "src/ui/types.ts", "Card.tsx"]);
  });

  it("제외 폴더는 어느 깊이든 거른다(경로 일부만 닮은 이름은 남긴다)", () => {
    expect(reasons(["node_modules/x/A.tsx", "a/.next/B.tsx", "dist/C.tsx", "p/build/D.tsx", "coverage/E.tsx", ".git/F.tsx"])).toEqual([
      ["node_modules/x/A.tsx", "excluded-dir"],
      ["a/.next/B.tsx", "excluded-dir"],
      ["dist/C.tsx", "excluded-dir"],
      ["p/build/D.tsx", "excluded-dir"],
      ["coverage/E.tsx", "excluded-dir"],
      [".git/F.tsx", "excluded-dir"],
    ]);
    expect(filterFiles([e("src/builder/A.tsx"), e("src/distance/B.tsx"), e("build.tsx")]).accepted).toHaveLength(3);
  });

  it("윈도 경로 구분자도 같은 규칙", () => {
    expect(reasons(["src\\node_modules\\A.tsx"])).toEqual([["src\\node_modules\\A.tsx", "excluded-dir"]]);
  });

  it("소스가 아닌 파일, 선언 파일, 테스트·스토리 파일을 거른다", () => {
    expect(reasons(["a.css", "b.json", "c.js", "d.jsx", "types.d.ts", "A.test.tsx", "A.spec.tsx", "A.stories.tsx", "u.test.ts", "u.spec.ts", "u.stories.ts"])).toEqual([
      ["a.css", "not-source"],
      ["b.json", "not-source"],
      ["c.js", "not-source"],
      ["d.jsx", "not-source"],
      ["types.d.ts", "declaration"],
      ["A.test.tsx", "test-or-story"],
      ["A.spec.tsx", "test-or-story"],
      ["A.stories.tsx", "test-or-story"],
      ["u.test.ts", "test-or-story"],
      ["u.spec.ts", "test-or-story"],
      ["u.stories.ts", "test-or-story"],
    ]);
  });

  it("거르는 이유가 겹치면 폴더가 먼저", () => {
    expect(reasons(["node_modules/a.css"])).toEqual([["node_modules/a.css", "excluded-dir"]]);
  });
});

describe("checkLimits", () => {
  const many = (n: number, size = 100) => Array.from({ length: n }, (_, i) => e(`f${i}.tsx`, size));

  it("상한 이내면 문제 없음(경계값 포함)", () => {
    expect(checkLimits(many(UPLOAD_LIMITS.maxFiles, 100))).toEqual([]);
    expect(checkLimits([e("a.tsx", UPLOAD_LIMITS.maxFileBytes)])).toEqual([]);
    expect(checkLimits(many(10, UPLOAD_LIMITS.maxTotalBytes / 10))).toEqual([]);
  });

  it("개수 초과, 파일 하나 초과, 합계 초과를 각각 알린다", () => {
    expect(checkLimits(many(UPLOAD_LIMITS.maxFiles + 1))).toEqual([{ kind: "too-many-files" }]);
    expect(checkLimits([e("big.tsx", UPLOAD_LIMITS.maxFileBytes + 1), e("ok.tsx")])).toEqual([{ kind: "file-too-large", paths: ["big.tsx"] }]);
    expect(checkLimits(many(11, UPLOAD_LIMITS.maxTotalBytes / 10))).toEqual([{ kind: "total-too-large" }]);
  });

  it("여러 문제가 있으면 모두 알린다", () => {
    const kinds = checkLimits(many(31, UPLOAD_LIMITS.maxFileBytes)).map((p) => p.kind);
    expect(kinds).toEqual(["too-many-files", "total-too-large"]);
  });
});
