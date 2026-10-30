import { describe, expect, it } from "vitest";
import { blueprint, NEXT_TAILWIND } from "../fixture";
import { r01, r04, r06, r07, r08 } from "./simple";

const R = (n: number) => Array.from({ length: n }, (_, i) => `책임 ${i + 1}`);
const style = (props: { property: string; value: string }[], ownsOuterSpacing = false) => ({
  scope: "utility" as const,
  properties: props.map((p) => ({ ...p, isToken: true })),
  ownsOuterSpacing,
});

describe("R-01 책임 과다", () => {
  it("3개 초과를 잡고 3개는 잡지 않는다", () => {
    expect(r01(blueprint([{ id: "a", responsibilities: R(4) }])).map((v) => v.nodeIds[0])).toEqual(["a"]);
    expect(r01(blueprint([{ id: "a", responsibilities: R(3) }]))).toEqual([]);
  });
});

describe("R-04 표시 전용 노드의 데이터 요청", () => {
  it("presentational + dataFetch를 잡는다", () => {
    const v = r04(blueprint([{ id: "a", kind: "presentational", dataFetch: true }]));
    expect(v[0]).toMatchObject({ ruleId: "R-04", severity: "error", nodeIds: ["a"] });
  });
  it("container·page의 요청이나 요청하지 않는 표시 노드는 잡지 않는다", () => {
    expect(r04(blueprint([{ id: "a", kind: "container", dataFetch: true }, { id: "b" }]))).toEqual([]);
  });
});

describe("R-07 데이터 요청 노드 부재", () => {
  it("요청 노드가 없으면 루트를 가리켜 알린다", () => {
    const v = r07(blueprint([{ id: "a" }], NEXT_TAILWIND, { dataFetch: false }));
    expect(v).toHaveLength(1);
    expect(v[0].nodeIds).toEqual(["root"]);
  });
  it("하나라도 있으면 잡지 않는다", () => {
    expect(r07(blueprint([{ id: "a" }]))).toEqual([]); // 루트가 dataFetch true
  });
});

describe("R-08 루트가 아닌 page", () => {
  it("루트가 아닌 page를 잡는다", () => {
    expect(r08(blueprint([{ id: "a", kind: "page" }])).map((v) => v.nodeIds[0])).toEqual(["a"]);
  });
  it("루트의 page는 잡지 않는다", () => {
    expect(r08(blueprint([{ id: "a" }]))).toEqual([]);
  });
});

describe("R-06 자식의 바깥 여백", () => {
  it("ownsOuterSpacing이 true인 자식을 잡는다", () => {
    expect(r06(blueprint([{ id: "a", style: style([], true) }])).map((v) => v.nodeIds[0])).toEqual(["a"]);
  });
  it("margin 계열 속성이 있는 자식을 잡는다", () => {
    const v = r06(blueprint([{ id: "a", style: style([{ property: "margin-top", value: "spacing.4" }]) }]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("margin-top");
  });
  it("가로 가운데 정렬용 auto는 잡지 않는다", () => {
    for (const p of [
      { property: "margin-inline", value: "auto" },
      { property: "margin", value: "0 auto" },
    ])
      expect(r06(blueprint([{ id: "a", style: style([p]) }]))).toEqual([]);
  });
  it("세로 auto나 auto가 아닌 가로 값은 잡는다", () => {
    expect(r06(blueprint([{ id: "a", style: style([{ property: "margin-top", value: "auto" }]) }]))).toHaveLength(1);
    expect(r06(blueprint([{ id: "a", style: style([{ property: "margin", value: "8px auto" }]) }]))).toHaveLength(1);
  });
  it("루트나 margin이 아닌 속성(padding)은 잡지 않는다", () => {
    expect(r06(blueprint([], NEXT_TAILWIND, { style: style([{ property: "margin", value: "16px" }], true) }))).toEqual([]);
    expect(r06(blueprint([{ id: "a", style: style([{ property: "padding", value: "8px" }]) }]))).toEqual([]);
  });
});
