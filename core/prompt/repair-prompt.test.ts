import { describe, expect, it } from "vitest";
import { buildRepairPrompt, MAX_REPAIR_ISSUES } from "./repair-prompt";

describe("buildRepairPrompt", () => {
  it("오류의 경로와 메시지를 모두 담는다", () => {
    const text = buildRepairPrompt({
      issues: [
        { path: ["nodes", 2, "order"], message: "같은 부모 아래 order가 겹칩니다" },
        { path: ["title"], message: "필수 값입니다" },
      ],
    });
    expect(text).toContain("nodes.2.order: 같은 부모 아래 order가 겹칩니다");
    expect(text).toContain("title: 필수 값입니다");
    expect(text).toContain("JSON만 출력");
  });

  it("노드 이름을 알면 nodes[N] 이름 형태로 바꾼다", () => {
    const text = buildRepairPrompt({
      issues: [{ path: ["nodes", 1, "layout", "responsive", 0, "direction"], message: "grid의 responsive는 columns만 가질 수 있습니다" }],
      nodeNames: ["ProductPage", "ProductContent"],
    });
    expect(text).toContain("nodes[1] ProductContent.layout.responsive.0.direction");
  });

  it("이름 목록에 없는 인덱스와 nodes 밖 경로는 그대로 쓴다", () => {
    const text = buildRepairPrompt({
      issues: [
        { path: ["nodes", 5, "name"], message: "x" },
        { path: ["stack", "framework"], message: "y" },
      ],
      nodeNames: ["A"],
    });
    expect(text).toContain("nodes.5.name: x");
    expect(text).toContain("stack.framework: y");
  });

  it(`오류는 최대 ${MAX_REPAIR_ISSUES}개만 보이고 나머지 개수를 알린다`, () => {
    const issues = Array.from({ length: 13 }, (_, i) => ({ path: ["nodes", i, "order"], message: `m${i}` }));
    const text = buildRepairPrompt({ issues });
    expect(text).toContain("m9");
    expect(text).not.toContain("m10");
    expect(text).toContain("그 밖의 오류 3개");
  });

  it("오류 목록이 비어 있어도 지시문은 만든다", () => {
    const text = buildRepairPrompt({ issues: [] });
    expect(text).toContain("다시 출력하라");
    expect(text).not.toContain("오류 (nodes[N]");
  });

  it("경로에 symbol이 있어도 던지지 않는다", () => {
    expect(() => buildRepairPrompt({ issues: [{ path: [Symbol("k")], message: "m" }] })).not.toThrow();
  });
});
