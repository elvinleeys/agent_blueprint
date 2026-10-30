import { describe, expect, it } from "vitest";
import { blueprint, NEXT_TAILWIND } from "../../rules/fixture";
import { nx01, nx02, nx03, nx04 } from "./next";

const st = [{ name: "count" }];

describe("NX-01 상태·이벤트가 있는 server", () => {
  it("상태가 있는 server 노드를 잡는다", () => {
    const v = nx01(blueprint([{ id: "a", state: st }]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ ruleId: "NX-01", severity: "error", nodeIds: ["a"] });
  });
  it("이벤트가 있는 server 노드도 잡는다", () => {
    expect(nx01(blueprint([{ id: "a", events: ["onClick"] }]))).toHaveLength(1);
  });
  it("client이거나 상태·이벤트가 없으면 잡지 않는다", () => {
    expect(nx01(blueprint([{ id: "a", state: st, renderMode: "client" }, { id: "b" }], NEXT_TAILWIND, { renderMode: "client" }))).toEqual([]);
  });
});

describe("NX-03 훅의 부모가 server", () => {
  it("server 부모 아래 훅을 잡는다", () => {
    const v = nx03(blueprint([{ id: "useX", name: "useX", kind: "hook", parentId: "root" }]));
    expect(v).toHaveLength(1);
    expect(v[0].nodeIds).toEqual(["useX", "root"]);
  });
  it("client 부모 아래 훅은 잡지 않는다", () => {
    expect(nx03(blueprint([{ id: "useX", name: "useX", kind: "hook" }], NEXT_TAILWIND, { renderMode: "client" }))).toEqual([]);
  });
});

describe("NX-04 client 조상 아래 server", () => {
  const tree = (rootMode: "server" | "client") =>
    blueprint(
      [
        { id: "mid", renderMode: rootMode },
        { id: "leaf", parentId: "mid", renderMode: rootMode },
      ],
      NEXT_TAILWIND,
      { renderMode: rootMode },
    );
  it("가장 가까운 client 조상이 아니라 더 위 조상이 client여도 잡는다(손자 이하)", () => {
    const bp = blueprint(
      [
        { id: "mid", renderMode: "server" },
        { id: "leaf", parentId: "mid", renderMode: "server" },
      ],
      NEXT_TAILWIND,
      { renderMode: "client" },
    );
    expect(nx04(bp).map((v) => v.nodeIds[0])).toEqual(["mid", "leaf"]);
  });
  it("client 노드가 없으면 잡지 않는다", () => {
    expect(nx04(tree("server"))).toEqual([]);
  });
  it("client 아래 client는 잡지 않는다", () => {
    expect(nx04(tree("client"))).toEqual([]);
  });
  it("훅(renderMode null)은 대상이 아니다", () => {
    expect(nx04(blueprint([{ id: "useX", name: "useX", kind: "hook" }], NEXT_TAILWIND, { renderMode: "client" }))).toEqual([]);
  });
});

describe("NX-02 client 범위가 필요 이상으로 넓음", () => {
  it("자기 필요가 없는 가장 위 client를 잡는다", () => {
    const v = nx02(blueprint([{ id: "a", state: st, renderMode: "client", parentId: "root" }], NEXT_TAILWIND, { renderMode: "client" }));
    expect(v.map((x) => x.nodeIds[0])).toEqual(["root"]);
  });
  it("상태·이벤트·훅 자식 중 하나라도 있으면 잡지 않는다", () => {
    expect(nx02(blueprint([], NEXT_TAILWIND, { renderMode: "client", state: st }))).toEqual([]);
    expect(nx02(blueprint([], NEXT_TAILWIND, { renderMode: "client", events: ["onClick"] }))).toEqual([]);
    expect(nx02(blueprint([{ id: "useX", name: "useX", kind: "hook" }], NEXT_TAILWIND, { renderMode: "client" }))).toEqual([]);
  });
  it("client 조상 아래의 client는 잡지 않고, server는 잡지 않는다", () => {
    const bp = blueprint([{ id: "a", renderMode: "client" }], NEXT_TAILWIND, { renderMode: "client", state: st });
    expect(nx02(bp)).toEqual([]);
    expect(nx02(blueprint([{ id: "a" }]))).toEqual([]);
  });
});
