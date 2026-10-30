import { describe, expect, it } from "vitest";
import { blueprint } from "../../rules/fixture";
import { ar01, ar02, ar03 } from "./fsd";

const FSD = { framework: "next", styling: "tailwind", architecture: "fsd" } as const;
const fsd = (rootDir: string, kids: { id: string; dir: string; kind?: "hook" | "presentational" | "container" | "page"; name?: string; parentId?: string }[]) =>
  blueprint(
    kids.map(({ dir, ...k }) => ({ ...k, location: { dir } })),
    FSD,
    { location: { dir: rootDir } },
  );

describe("AR-01 계층 방향", () => {
  it("자식이 부모보다 위 계층이면 잡는다", () => {
    const v = ar01(fsd("features/cart/ui", [{ id: "a", dir: "pages/cart/ui" }]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ ruleId: "AR-01", severity: "error", nodeIds: ["a", "root"] });
  });
  it("아래 계층이거나 같은 계층이면 잡지 않는다", () => {
    expect(ar01(fsd("pages/cart/ui", [{ id: "a", dir: "features/cart/ui" }, { id: "b", dir: "pages/cart/ui" }]))).toEqual([]);
  });
});

describe("AR-02 같은 계층 다른 슬라이스", () => {
  it("같은 계층의 다른 슬라이스 자식을 잡는다", () => {
    const v = ar02(fsd("features/cart/ui", [{ id: "a", dir: "features/wishlist/ui" }]));
    expect(v).toHaveLength(1);
    expect(v[0].ruleId).toBe("AR-02");
  });
  it("같은 슬라이스·다른 계층·슬라이스 없는 계층(shared)은 잡지 않는다", () => {
    expect(ar02(fsd("features/cart/ui", [{ id: "a", dir: "features/cart/model", kind: "hook", name: "useCart" }, { id: "b", dir: "shared/ui" }]))).toEqual([]);
    expect(ar02(fsd("shared/ui", [{ id: "a", dir: "shared/lib" }]))).toEqual([]);
  });
});

describe("AR-03 종류와 계층·세그먼트", () => {
  it("page가 pages 계층이 아니면 잡는다", () => {
    expect(ar03(fsd("features/cart/ui", [])).map((v) => v.nodeIds[0])).toEqual(["root"]);
  });
  it("훅이 ui에 있거나 화면 컴포넌트가 model에 있으면 잡는다", () => {
    const v = ar03(fsd("pages/cart/ui", [{ id: "h", name: "useCart", kind: "hook", dir: "features/cart/ui" }, { id: "c", dir: "features/cart/model" }]));
    expect(v.map((x) => x.nodeIds[0]).sort()).toEqual(["c", "h"]);
  });
  it("알맞은 위치는 잡지 않는다", () => {
    expect(ar03(fsd("pages/cart/ui", [{ id: "h", name: "useCart", kind: "hook", dir: "features/cart/model" }, { id: "c", dir: "features/cart/ui" }]))).toEqual([]);
  });
});
