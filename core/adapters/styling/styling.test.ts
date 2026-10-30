import { describe, expect, it } from "vitest";
import { blueprint, NEXT_TAILWIND } from "../../rules/fixture";
import type { ComponentNode } from "../../schema/blueprint";
import { hc01 } from "./css";
import { cm01 } from "./css-modules";
import { tw01, tw02 } from "./tailwind";

type Style = NonNullable<ComponentNode["style"]>;
const style = (props: [string, string, boolean?][], extra: Partial<Style> = {}): Style => ({
  scope: "utility",
  properties: props.map(([property, value, isToken = true]) => ({ property, value, isToken })),
  ownsOuterSpacing: false,
  ...extra,
});

describe("CM-01 전역 스타일", () => {
  it("global 범위를 잡고 module은 잡지 않는다", () => {
    const v = cm01(blueprint([{ id: "a", style: style([], { scope: "global" }) }, { id: "b", style: style([], { scope: "module" }) }]));
    expect(v.map((x) => x.nodeIds[0])).toEqual(["a"]);
  });
});

describe("TW-01 토큰이 아닌 값", () => {
  it("isToken false가 있는 노드를 노드당 1건으로 잡는다", () => {
    const v = tw01(blueprint([{ id: "a", style: style([["color", "#333", false], ["width", "922px", false]]) }, { id: "b", style: style([["color", "color.primary"]]) }]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("#333");
    expect(v[0].message).toContain("922px");
  });
  it("스타일이 없으면 잡지 않는다", () => {
    expect(tw01(blueprint([{ id: "a" }]))).toEqual([]);
  });
});

describe("TW-02 스타일 묶음 반복", () => {
  const same = () => style([["padding", "spacing.4"], ["color", "color.text"]]);
  it("완전히 같은 묶음(2쌍 이상)이 3개 노드에 있으면 1건으로 잡는다", () => {
    const v = tw02(blueprint([{ id: "a", style: same() }, { id: "b", style: same() }, { id: "c", style: same() }]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ ruleId: "TW-02", severity: "info" });
    expect(v[0].nodeIds).toEqual(["a", "b", "c"]);
  });
  it("속성 순서가 달라도 같은 묶음이다", () => {
    const rev = style([["color", "color.text"], ["padding", "spacing.4"]]);
    expect(tw02(blueprint([{ id: "a", style: same() }, { id: "b", style: same() }, { id: "c", style: rev }]))).toHaveLength(1);
  });
  it("2개 노드뿐이거나 한 쌍짜리거나 값이 다르면 잡지 않는다", () => {
    expect(tw02(blueprint([{ id: "a", style: same() }, { id: "b", style: same() }]))).toEqual([]);
    const one = () => style([["padding", "spacing.4"]]);
    expect(tw02(blueprint([{ id: "a", style: one() }, { id: "b", style: one() }, { id: "c", style: one() }]))).toEqual([]);
    const other = style([["padding", "spacing.6"], ["color", "color.text"]]);
    expect(tw02(blueprint([{ id: "a", style: same() }, { id: "b", style: same() }, { id: "c", style: other }]))).toEqual([]);
  });
});

describe("HC-01 클래스 명명 규칙 불일치", () => {
  const css = { ...NEXT_TAILWIND, framework: "html", styling: "css" } as const;
  const bp = (patterns: (string | undefined)[]) =>
    blueprint(patterns.map((p, i) => ({ id: `n${i}`, style: style([], { scope: "global", classPattern: p }) })), css);

  it("다른 값이 섞이면 소수 쪽 노드를 잡는다", () => {
    expect(hc01(bp(["BEM", "BEM", "camelCase"])).map((v) => v.nodeIds[0])).toEqual(["n2"]);
  });
  it("값이 있는 노드가 있는데 스타일 노드에 값이 없으면 잡는다", () => {
    expect(hc01(bp(["BEM", undefined])).map((v) => v.nodeIds[0])).toEqual(["n1"]);
  });
  it("대소문자·공백 차이는 같은 값이다", () => {
    expect(hc01(bp(["BEM", " bem "]))).toEqual([]);
  });
  it("아무도 값이 없으면 기준이 없어 잡지 않는다", () => {
    expect(hc01(bp([undefined, undefined]))).toEqual([]);
  });
});
