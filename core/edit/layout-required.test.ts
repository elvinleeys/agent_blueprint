import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../schema/blueprint";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));

// 연산이 layout을 채우지 않으면 어떻게 되는지 스키마 수준에서 고정한다. 채우는 이유를 설명하는 테스트다.
describe("훅이 아닌 자식을 가진 노드는 layout이 필요하다(스키마)", () => {
  it("layout이 없는 노드 아래로 일반 노드를 옮기면 거부된다", () => {
    const bp = sample();
    const nodes = bp.nodes.map((n) => (n.id === "n-gallery" ? { ...n, parentId: "n-price", order: 0 } : n));
    const r = BlueprintSchema.safeParse({ ...bp, nodes });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("nodes.3.layout"); // n-price
  });

  it("훅만 자식이면 layout이 없어도 통과한다", () => {
    const bp = sample();
    const nodes = bp.nodes.map((n) => (n.id === "n-use-cart" ? { ...n, parentId: "n-price", order: 0 } : n));
    expect(BlueprintSchema.safeParse({ ...bp, nodes }).success).toBe(true);
  });
});
