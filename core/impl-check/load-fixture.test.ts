import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURE_ROOT, changedPaths, correctPaths, listCaseDirs, loadBlueprint, loadCode, readCorrect, readExpected } from "./load-fixture";

const RULES = new Set(["IC-01", "IC-02", "IC-03", "IC-04", "IC-05", "IC-06", "IC-07", "IC-08", "IC-09", "IC-10", "IC-11", "IC-12", "ICN-01", "ICN-02", "ICN-03", "ICN-04", "ICR-01", "ICF-01"]);

describe.each(["next", "react"])("구현 검사 시험 데이터: %s 묶음", (bundle) => {
  const expected = readExpected(bundle);
  const caseNames = Object.keys(expected.cases);

  it("기대 결과 표의 사례와 폴더가 일치한다", () => {
    const dirs = listCaseDirs(bundle).sort();
    expect(dirs).toEqual(caseNames.sort());
  });

  it("설계도가 스키마를 통과하고 스택이 묶음과 맞는다", () => {
    const b = loadBlueprint(bundle, "correct");
    expect(b.stack.framework).toBe(bundle);
    expect(b.stack.styling).toBe("tailwind");
    expect(b.stack.architecture).toBe(bundle === "next" ? "fsd" : "type-based");
    expect(loadBlueprint(bundle, "correct").nodes).toHaveLength(8);
  });

  it("기대 결과의 규칙 id와 노드 이름이 실제로 있다", () => {
    const names = new Set(loadBlueprint(bundle, "correct").nodes.map((n) => n.name));
    for (const [name, c] of Object.entries(expected.cases)) {
      for (const x of c.certain) {
        expect(RULES.has(x.rule), `${name}: ${x.rule}`).toBe(true);
        // IC-02는 코드에만 있는 컴포넌트라 설계도에 없다
        expect(x.rule === "IC-02" || names.has(x.node), `${name}: ${x.node}`).toBe(true);
      }
      for (const x of c.needsReview) expect(names.has(x.node), `${name}: ${x.node}`).toBe(true);
    }
  });

  it.each(caseNames.filter((n) => n !== "correct"))("%s: 덮어쓰기가 correct와 실제로 다르고 지우는 파일이 있다", (name) => {
    const { written, deleted } = changedPaths(bundle, name);
    const known = new Set(correctPaths(bundle));
    for (const p of deleted) expect(known.has(p), `${p} 삭제`).toBe(true);
    // 이미 있는 파일을 같은 내용으로 덮어쓰면 아무것도 안 바꾼 것
    for (const p of written) if (known.has(p)) expect(readCorrect(bundle, p), `${p}가 correct와 같음`).not.toBe(readFileSync(join(FIXTURE_ROOT, bundle, name, p), "utf8"));
    expect(written.length + deleted.length).toBeGreaterThan(0);
    expect(loadCode(bundle, name).length).toBeGreaterThan(0);
  });

  it("`wrong-*` 사례는 확실 1건만 기대한다. 그 밖의 사례는 expected.json에 적은 기대 결과와 비교한다(바른 코드·이름만 바꾼 코드·스택 불일치는 확실 0건)", () => {
    for (const [name, c] of Object.entries(expected.cases)) {
      if (name.startsWith("wrong-")) expect(c.certain, name).toHaveLength(1);
    }
    for (const name of ["correct", "renamed", "stack-mismatch"]) expect(expected.cases[name].certain, name).toHaveLength(0);
    expect(expected.cases.correct.needsReview).toHaveLength(0);
    expect(expected.cases["stack-mismatch"].needsReview).toHaveLength(0);
    expect(expected.cases.renamed.needsReview.map((r) => r.kind).sort()).toEqual(["pair", "prop", "state"]);
  });
});
