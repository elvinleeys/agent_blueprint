import { describe, expect, it } from "vitest";
import { alignRowIds, appendRowId, completeRows, locateRowError, parseIntInRange, removeRowId, rowIdsFor } from "./list-draft";

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

describe("행 id", () => {
  it("처음에는 행 수만큼 0부터 매기고, 추가하면 새 id를 붙인다", () => {
    expect(rowIdsFor(3)).toEqual({ ids: [0, 1, 2], next: 3 });
    expect(appendRowId(rowIdsFor(3))).toEqual({ ids: [0, 1, 2, 3], next: 4 });
    expect(appendRowId(rowIdsFor(0))).toEqual({ ids: [0], next: 1 });
  });
  it("중간 행을 지우면 나머지 행의 id는 그대로다(한 칸씩 당겨지지 않는다)", () => {
    const after = removeRowId(rowIdsFor(4), 1);
    expect(after.ids).toEqual([0, 2, 3]);
    expect(after.next).toBe(4);
  });
  it("지운 id는 다시 쓰지 않는다: 지운 뒤 추가해도 새 id다", () => {
    const s = appendRowId(removeRowId(rowIdsFor(3), 2));
    expect(s.ids).toEqual([0, 1, 3]);
    expect(new Set(s.ids).size).toBe(3);
  });
  it("행 수가 맞으면 그대로, 어긋나면 한 번도 쓰지 않은 id로 다시 매긴다", () => {
    const s = removeRowId(rowIdsFor(3), 0); // ids [1,2], next 3
    expect(alignRowIds(s, 2)).toBe(s);
    const re = alignRowIds(s, 4);
    expect(re.ids).toEqual([3, 4, 5, 6]);
    expect(re.ids.some((id) => s.ids.includes(id) || id < 3)).toBe(false);
    expect(re.next).toBe(7);
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
