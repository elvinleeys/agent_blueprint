import { describe, expect, it } from "vitest";
import { includedIds, restoreSelection, toggleChoice, type Selection } from "./selection";

describe("재검사 뒤 포함·무시 선택 복원(카드 id 기준)", () => {
  const prev: Selection = { "IC-01|a|pair": "include", "IC-05|b|state:x": "ignore", "IC-06|c|prop:y": "include" };

  it("같은 카드 id가 다시 나오면 이전 선택을 유지한다", () => {
    expect(restoreSelection(prev, ["IC-01|a|pair", "IC-05|b|state:x", "IC-06|c|prop:y"])).toEqual(prev);
  });

  it("새로 나온 카드는 선택하지 않은 상태로 둔다(자동으로 포함하거나 무시하지 않는다)", () => {
    const next = restoreSelection(prev, ["IC-01|a|pair", "IC-09|new|style"]);
    expect(next["IC-09|new|style"]).toBeUndefined();
    expect(Object.keys(next)).toEqual(["IC-01|a|pair"]);
  });

  it("사라진 카드의 선택은 지운다(재검사 결과에 없는 카드의 선택이 남지 않는다)", () => {
    const next = restoreSelection(prev, ["IC-05|b|state:x"]);
    expect(next).toEqual({ "IC-05|b|state:x": "ignore" });
    expect("IC-01|a|pair" in next).toBe(false);
    expect("IC-06|c|prop:y" in next).toBe(false);
  });

  it("카드가 하나도 없으면 선택도 없다", () => {
    expect(restoreSelection(prev, [])).toEqual({});
  });

  it("세 규칙을 한꺼번에: 유지 + 새 카드 미선택 + 사라진 카드 제거", () => {
    const next = restoreSelection(prev, ["IC-06|c|prop:y", "IC-10|z|token", "IC-01|a|pair"]);
    expect(next).toEqual({ "IC-06|c|prop:y": "include", "IC-01|a|pair": "include" });
  });

  it("이전 선택 객체를 바꾸지 않는다", () => {
    const copy = { ...prev };
    restoreSelection(prev, []);
    expect(prev).toEqual(copy);
  });
});

describe("선택 바꾸기", () => {
  it("포함·무시를 누르면 설정, 같은 것을 다시 누르면 해제, 다른 것을 누르면 바뀐다", () => {
    let s: Selection = {};
    s = toggleChoice(s, "x", "include");
    expect(s).toEqual({ x: "include" });
    s = toggleChoice(s, "x", "ignore");
    expect(s).toEqual({ x: "ignore" });
    s = toggleChoice(s, "x", "ignore");
    expect(s).toEqual({});
  });

  it("includedIds는 포함한 카드 id만 정렬해 돌려준다", () => {
    expect(includedIds({ b: "include", a: "include", c: "ignore" })).toEqual(["a", "b"]);
  });
});
