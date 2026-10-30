import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema, type Blueprint } from "../schema/blueprint";
import { changeDisplay, displayChangeImpact, withResponsive } from "./layout";
import { updateNode } from "./update-node";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const layoutOf = (bp: Blueprint, id: string) => bp.nodes.find((n) => n.id === id)!.layout!;

describe("withResponsive", () => {
  it("한 breakpoint의 줄을 추가·교체하고 다른 줄은 그대로 둔다", () => {
    const grid = layoutOf(sample(), "n-page"); // 모바일 1열
    const tablet = withResponsive(grid, "tablet", { columns: 3 });
    expect(tablet.responsive).toEqual([{ breakpoint: "mobile", columns: 1 }, { breakpoint: "tablet", columns: 3 }]);
    const replaced = withResponsive(tablet, "tablet", { columns: 4 });
    expect(replaced.responsive).toEqual([{ breakpoint: "mobile", columns: 1 }, { breakpoint: "tablet", columns: 4 }]);
  });

  it("null이거나 값이 없으면 그 줄을 지우고, 줄이 하나도 없으면 responsive 필드를 없앤다", () => {
    const grid = layoutOf(sample(), "n-page");
    expect(withResponsive(grid, "mobile", null).responsive).toBeUndefined();
    expect("responsive" in withResponsive(grid, "mobile", {})).toBe(false);
    expect(withResponsive(grid, "tablet", null).responsive).toEqual([{ breakpoint: "mobile", columns: 1 }]);
  });

  it("입력 layout을 바꾸지 않는다", () => {
    const grid = layoutOf(sample(), "n-page");
    const before = JSON.stringify(grid);
    withResponsive(grid, "tablet", { columns: 3 });
    withResponsive(grid, "mobile", null);
    expect(JSON.stringify(grid)).toBe(before);
  });

  it("스키마와 이어 쓰면: flex는 direction 줄만, grid는 columns 줄만 통과한다", () => {
    const bp = sample();
    const flex = layoutOf(bp, "n-info");
    expect(updateNode(bp, "n-info", { layout: withResponsive(flex, "mobile", { direction: "column" }) }).ok).toBe(true);
    expect(updateNode(bp, "n-info", { layout: withResponsive(flex, "mobile", { columns: 2 }) })).toMatchObject({ ok: false, path: ["layout", "responsive", 0, "columns"] });
    expect(updateNode(bp, "n-page", { layout: withResponsive(layoutOf(bp, "n-page"), "tablet", { direction: "row" }) }).ok).toBe(false);
  });
});

describe("displayChangeImpact — 배치 없음(null)", () => {
  it("배치를 없애면 grid의 차지 칸과 반응형이 사라진다고 알린다(자식이 있으면 스키마가 막는다)", () => {
    expect(displayChangeImpact(sample(), "n-page", null)).toEqual({ placements: 1, responsive: true });
  });
  it("원래 배치가 없는 노드를 없음으로 두면 변경이 아니다", () => {
    expect(displayChangeImpact(sample(), "n-price", null)).toBeNull();
  });
  it("배치가 없는 노드에 방식을 지정하면 잃는 것이 없다", () => {
    expect(displayChangeImpact(sample(), "n-price", "flex")).toEqual({ placements: 0, responsive: false });
    expect(changeDisplay(sample(), "n-price", "flex").ok).toBe(true);
  });
});
