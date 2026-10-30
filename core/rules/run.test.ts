import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripOptionalNulls } from "../prompt/strict-json-schema";
import { BlueprintSchema, type Blueprint } from "../schema/blueprint";
import sample from "../schema/sample-blueprint.json";
import { blueprint, NEXT_TAILWIND } from "./fixture";
import { checkBlueprint, countByNode } from "./run";

const count = (bp: Blueprint, ruleId: string) => checkBlueprint(bp).filter((v) => v.ruleId === ruleId).length;

describe("checkBlueprint", () => {
  it("샘플 설계도는 오류가 0건이다", () => {
    const bp = BlueprintSchema.parse(sample);
    expect(checkBlueprint(bp).filter((v) => v.severity === "error")).toEqual([]);
  });

  it("스택에 맞지 않는 규칙은 돌지 않는다(react에는 NX가, tailwind가 아니면 TW가, fsd가 아니면 AR이 없다)", () => {
    const react = blueprint([{ id: "a", state: [{ name: "x" }] }], { framework: "react", styling: "css-modules", architecture: "type-based" });
    expect(checkBlueprint(react).filter((v) => /^(NX|TW|AR)/.test(v.ruleId))).toEqual([]);
    const next = blueprint([{ id: "a", state: [{ name: "x" }] }]);
    expect(count(next, "NX-01")).toBe(1);
  });

  it("오류 → 경고 → 정보 순이고, 같은 심각도에서는 NX-04·NX-03·R-07이 먼저다", () => {
    const bp = blueprint(
      [
        { id: "a", state: [{ name: "x" }], responsibilities: ["1", "2", "3", "4"] }, // R-02 오류, R-01 경고
        { id: "b", state: [{ name: "x" }] },
        { id: "useX", name: "useX", kind: "hook" }, // NX-03(루트가 server)
        { id: "k", kind: "presentational" },
      ],
      NEXT_TAILWIND,
      { dataFetch: false, renderMode: "server" },
    );
    const ids = checkBlueprint(bp).map((v) => v.ruleId);
    expect(ids.indexOf("NX-03")).toBeLessThan(ids.indexOf("R-02"));
    expect(ids.indexOf("R-02")).toBeLessThan(ids.indexOf("R-07"));
    expect(ids.indexOf("R-07")).toBeLessThan(ids.indexOf("R-01"));
  });

  it("설계도를 바꾸지 않는다", () => {
    const bp = BlueprintSchema.parse(sample);
    const before = JSON.stringify(bp);
    checkBlueprint(bp);
    expect(JSON.stringify(bp)).toBe(before);
  });

  it("countByNode는 정보를 세지 않고 위반이 가리키는 노드마다 센다", () => {
    const bp = blueprint([{ id: "useX", name: "useX", kind: "hook" }]);
    const counts = countByNode(checkBlueprint(bp));
    expect(counts.get("useX")?.error).toBe(1); // NX-03
    expect(counts.get("root")?.error).toBe(1);
  });
});

// 사전 테스트(2026-10-29) 응답 원문 중 채점에서 위반이 확인된 것. tasks/draft-test-result.md 사례 C1·C4
describe("사전 테스트 응답 회귀", () => {
  const dir = join(process.cwd(), "tasks/draft-outputs/2026-10-29T06-30-55-935Z");
  const load = (file: string) => BlueprintSchema.parse(stripOptionalNulls(BlueprintSchema, JSON.parse(readFileSync(join(dir, file), "utf8"))));

  it.each([
    ["product-detail-text-gpt-6.1-terra-1.json", 4],
    ["product-detail-text-gpt-6-luna-1.json", 3],
    ["product-detail-both-gpt-6.1-terra-1.json", 5],
  ])("%s: client 아래 server(NX-04) %i건", (file, n) => {
    expect(count(load(file), "NX-04")).toBe(n);
  });

  it("product-detail-text-gpt-6-luna-1.json: 같은 계층 다른 슬라이스(AR-02) 4건", () => {
    expect(count(load("product-detail-text-gpt-6-luna-1.json"), "AR-02")).toBe(4);
  });
});
