import { describe, expect, it } from "vitest";
import { completeRows, locateRowError, parseIntInRange } from "./list-draft";

describe("completeRows", () => {
  it("채워진 행만 골라 원래 번호를 함께 돌려준다", () => {
    const rows = [{ n: "a" }, { n: "" }, { n: "c" }, { n: "" }];
    expect(completeRows(rows, (r) => r.n !== "")).toEqual({ rows: [{ n: "a" }, { n: "c" }], indexes: [0, 2] });
  });
  it("모두 비었으면 빈 결과", () => {
    expect(completeRows([{ n: "" }], (r) => r.n !== "")).toEqual({ rows: [], indexes: [] });
  });
});

describe("locateRowError", () => {
  it("거부 경로를 비어 있는 행을 뺀 번호에서 화면 행 번호로 되돌린다", () => {
    // 화면의 0·2번 행만 반영했고, 반영한 목록의 1번(= 화면 2번)이 거부됨
    expect(locateRowError(["state", 1, "name"], ["state"], [0, 2])).toEqual({ row: 2, cell: "name" });
  });
  it("중첩 위치(style.properties)도 찾는다", () => {
    expect(locateRowError(["style", "properties", 0, "property"], ["style", "properties"], [3])).toEqual({ row: 3, cell: "property" });
  });
  it("행 번호까지만 있는 경로는 행 단위 오류(cell이 null)로 돌려준다", () => {
    expect(locateRowError(["state", 0], ["state"], [0])).toEqual({ row: 0, cell: null });
    expect(locateRowError(["responsibilities", 0], ["responsibilities"], [4])).toEqual({ row: 4, cell: null });
  });
  it("다른 목록의 경로나 목록 전체의 오류는 행에 연결하지 않는다", () => {
    expect(locateRowError(["props", 0, "name"], ["state"], [0])).toBeNull();
    expect(locateRowError(["state"], ["state"], [0])).toBeNull();
    expect(locateRowError(undefined, ["state"], [0])).toBeNull();
    expect(locateRowError(["state", 5, "name"], ["state"], [0])).toBeNull(); // 범위 밖
  });
});

describe("parseIntInRange", () => {
  it("범위 안의 정수를 읽는다", () => {
    expect(parseIntInRange("3", 1, 12)).toEqual({ ok: true, value: 3 });
    expect(parseIntInRange(" 12 ", 1, 12)).toEqual({ ok: true, value: 12 });
    expect(parseIntInRange("1", 1, 12)).toEqual({ ok: true, value: 1 });
  });
  it("범위 밖·소수·글자·빈칸·부호는 이유와 함께 거부한다", () => {
    for (const bad of ["0", "13", "2.5", "abc", "", " ", "-1", "1e1", "+2"]) {
      expect(parseIntInRange(bad, 1, 12)).toEqual({ ok: false, reason: "1~12 사이의 정수를 입력하세요." });
    }
  });
});
