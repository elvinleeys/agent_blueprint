import { describe, expect, it } from "vitest";
import { kindOptions } from "./kind-options";

const values = (o: ReturnType<typeof kindOptions>) => o.map((x) => x.value);

describe("kindOptions", () => {
  it("루트는 페이지·컨테이너·표시를 모두 고를 수 있다", () => {
    const o = kindOptions({ kind: "page", parentId: null });
    expect(values(o)).toEqual(["page", "container", "presentational"]);
    expect(o.every((x) => !x.disabled)).toBe(true);
  });
  it("루트가 아닌 노드에는 페이지 항목이 없다", () => {
    expect(values(kindOptions({ kind: "container", parentId: "n-page" }))).toEqual(["container", "presentational"]);
    expect(values(kindOptions({ kind: "presentational", parentId: "n-page" }))).toEqual(["container", "presentational"]);
  });
  it("루트가 아닌데 이미 페이지인 노드(AI 초안)는 현재 값을 보이도록 페이지 항목을 남기되 고를 수 없게 한다", () => {
    const o = kindOptions({ kind: "page", parentId: "n-page" });
    expect(o[0]).toMatchObject({ value: "page", disabled: true });
    expect(o.slice(1).every((x) => !x.disabled)).toBe(true);
  });
});
