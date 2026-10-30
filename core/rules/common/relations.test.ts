import { describe, expect, it } from "vitest";
import { blueprint } from "../fixture";
import { r02, r03, r05 } from "./relations";

const prop = (name: string) => ({ name, type: "string" });

describe("R-02 상태 중복", () => {
  it("이름이 같은 상태를 가진 노드 전체를 한 건으로 묶는다", () => {
    const v = r02(blueprint([{ id: "a", state: [{ name: "quantity" }] }, { id: "b", state: [{ name: " Quantity " }] }]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ ruleId: "R-02", severity: "error" });
    expect(v[0].nodeIds.sort()).toEqual(["a", "b"]);
  });
  it("이름이 다르면 잡지 않는다", () => {
    expect(r02(blueprint([{ id: "a", state: [{ name: "quantity" }] }, { id: "b", state: [{ name: "color" }] }]))).toEqual([]);
  });
  it("한 노드 안의 같은 이름은 중복이 아니다", () => {
    expect(r02(blueprint([{ id: "a", state: [{ name: "x" }, { name: "x" }] }]))).toEqual([]);
  });
  it("범용 UI 상태(isOpen)는 형제끼리는 정상이다", () => {
    expect(r02(blueprint([{ id: "a", state: [{ name: "isOpen" }] }, { id: "b", state: [{ name: "isOpen" }] }]))).toEqual([]);
  });
  it("범용 UI 상태도 조상-자손이면 잡는다", () => {
    const v = r02(blueprint([{ id: "a", state: [{ name: "isOpen" }] }, { id: "b", parentId: "a", state: [{ name: "isOpen" }] }]));
    expect(v).toHaveLength(1);
    expect(v[0].nodeIds.sort()).toEqual(["a", "b"]);
  });
  it("훅과 컴포넌트가 같은 이름의 상태를 가져도 잡는다", () => {
    const v = r02(blueprint([{ id: "c", state: [{ name: "cartCount" }] }, { id: "useCart", name: "useCart", kind: "hook", state: [{ name: "cartCount" }] }]));
    expect(v).toHaveLength(1);
  });
});

describe("R-03 props 연속 전달", () => {
  const chain = (names: string[][]) =>
    blueprint(names.map((n, i) => ({ id: `n${i}`, parentId: i === 0 ? "root" : `n${i - 1}`, props: n.map(prop) })));

  it("부모-자식 사슬로 3개 노드가 같은 prop을 가지면 잡는다", () => {
    const v = r03(chain([["user"], ["user"], ["user"]]));
    expect(v).toHaveLength(1);
    expect(v[0].nodeIds.sort()).toEqual(["n0", "n1", "n2"]);
  });
  it("2개 노드까지는 잡지 않는다", () => {
    expect(r03(chain([["user"], ["user"]]))).toEqual([]);
  });
  it("사슬이 끊기면(중간 노드에 없으면) 잡지 않는다", () => {
    expect(r03(chain([["user"], [], ["user"], ["user"]]))).toEqual([]);
  });
  it("같은 부모의 형제 셋은 사슬이 아니다", () => {
    expect(r03(blueprint([{ id: "a", props: [prop("user")] }, { id: "b", props: [prop("user")] }, { id: "c", props: [prop("user")] }]))).toEqual([]);
  });
  it("children·className은 세지 않는다", () => {
    expect(r03(chain([["children", "className"], ["children", "className"], ["children", "className"]]))).toEqual([]);
  });
});

describe("R-05 재사용 후보", () => {
  const card = (id: string, name: string, resp: string[]) => ({ id, name, responsibilities: resp });
  it("이름·책임이 모두 비슷하면 묶어서 알린다", () => {
    const v = r05(blueprint([card("a", "ProductCard", ["상품 이름과 가격을 표시한다"]), card("b", "ProductCardItem", ["상품 이름과 가격을 보여준다"])]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ ruleId: "R-05", severity: "info" });
    expect(v[0].nodeIds.sort()).toEqual(["a", "b"]);
  });
  it("이름만 비슷하고 책임이 다르면 잡지 않는다", () => {
    expect(r05(blueprint([card("a", "ProductCard", ["상품 이름과 가격을 표시한다"]), card("b", "ProductCardItem", ["배송 일정을 계산한다"])]))).toEqual([]);
  });
  it("책임만 비슷하고 이름이 다르면 잡지 않는다", () => {
    expect(r05(blueprint([card("a", "DeliveryNotice", ["배송 안내를 표시한다"]), card("b", "ReturnNotice", ["배송 안내를 표시한다"])]))).toEqual([]);
  });
  it("조상-자손이거나 훅이면 잡지 않는다", () => {
    expect(r05(blueprint([card("a", "ProductCard", ["가격 표시"]), { ...card("b", "ProductCardItem", ["가격 표시"]), parentId: "a" }]))).toEqual([]);
    expect(r05(blueprint([{ ...card("a", "useCartItem", ["장바구니 수량"]), kind: "hook" }, { ...card("b", "useCartItems", ["장바구니 수량"]), kind: "hook" }]))).toEqual([]);
  });
});
