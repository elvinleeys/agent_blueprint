import { describe, expect, it } from "vitest";
import { compareDesignSystem } from "@/core/cleanup/compare";
import type { AnalyzedComponent } from "@/core/cleanup/types";
import { groupFindings } from "./result-view";

const comp = (name: string, o: Partial<AnalyzedComponent> = {}): AnalyzedComponent => ({
  name, path: `src/features/${name}.tsx`, props: [], variants: [], inherits: [], inheritsComponents: [], unresolved: [], exported: true, ...o,
});
const props = (...n: string[]) => n.map((name) => ({ name, type: "string", required: false }));

describe("groupFindings", () => {
  const r = compareDesignSystem({
    official: [{ name: "Button", variants: [], props: [{ name: "a", type: "string", required: true }], path: "ds/Button.tsx" }],
    analyzed: [
      comp("Button", { path: "src/features/Button.tsx" }),
      comp("UserCard", { props: props("n", "m") }),
      comp("UserCardWide", { props: props("n", "m") }),
      comp("Big", { props: props(..."abcdefghi".split("")) }),
      comp("Cart"),
    ],
    officialFromFiles: true,
  });
  const g = groupFindings(r.findings);

  it("경고(같은 이름의 별도 구현·나누기)가 맨 위 구역이고 정보는 섞이지 않는다", () => {
    expect(g.warnings.every((f) => f.severity === "warning")).toBe(true);
    expect(g.warnings.map((f) => f.rule).sort()).toEqual(["C-03", "C-05"]);
  });

  it("정보 합치기 후보와 '공식 목록에 없음'은 따로 모은다", () => {
    expect(g.infoMerge).toHaveLength(1);
    expect(g.infoMerge[0].members.map((m) => m.name)).toEqual(["UserCard", "UserCardWide"]);
    expect(g.notOfficial.map((f) => f.component.name)).toEqual(["Big", "Cart", "UserCard", "UserCardWide"]);
  });

  it("모든 결과가 정확히 한 구역에 들어간다", () => {
    expect(g.warnings.length + g.infoMerge.length + g.notOfficial.length).toBe(r.findings.length);
  });
});
