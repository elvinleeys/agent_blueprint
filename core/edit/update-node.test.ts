import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema, type Blueprint } from "../schema/blueprint";
import { isAssumedField, updateNode } from "./update-node";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));
const node = (bp: Blueprint, id: string) => bp.nodes.find((n) => n.id === id)!;
const must = (r: ReturnType<typeof updateNode>) => {
  if (!r.ok) throw new Error(r.reason);
  return r.blueprint;
};

describe("updateNode", () => {
  it("이름을 바꿔도 id는 그대로이고 generatedBy가 user가 된다", () => {
    const bp = sample();
    expect(bp.generatedBy).toBe("ai");
    const out = must(updateNode(bp, "n-price", { name: "PriceLabel" }));
    expect(node(out, "n-price").name).toBe("PriceLabel");
    expect(out.generatedBy).toBe("user");
    expect(out.nodes.map((n) => n.id)).toEqual(bp.nodes.map((n) => n.id));
  });

  it("입력 설계도를 바꾸지 않는다", () => {
    const bp = sample();
    const before = JSON.stringify(bp);
    updateNode(bp, "n-price", { name: "PriceLabel", responsibilities: ["가격 표시"] });
    expect(JSON.stringify(bp)).toBe(before);
  });

  it("값이 그대로면 같은 설계도를 돌려주고 generatedBy도 바꾸지 않는다", () => {
    const bp = sample();
    const r = updateNode(bp, "n-price", { name: node(bp, "n-price").name });
    expect(r).toEqual({ ok: true, blueprint: bp });
    if (r.ok) expect(r.blueprint.generatedBy).toBe("ai");
  });

  it("없는 노드는 거부한다", () => {
    expect(updateNode(sample(), "nope", { name: "X" }).ok).toBe(false);
  });

  describe("이름", () => {
    it("다른 노드와 같은 이름은 거부하고 name 칸에 연결한다", () => {
      const r = updateNode(sample(), "n-price", { name: "ProductGallery" });
      expect(r).toMatchObject({ ok: false, nodeId: "n-price", path: ["name"] });
    });
    it("컴포넌트는 PascalCase, 훅은 use로 시작해야 한다", () => {
      expect(updateNode(sample(), "n-price", { name: "priceTag" })).toMatchObject({ ok: false, nodeId: "n-price", path: ["name"] });
      expect(updateNode(sample(), "n-use-cart", { name: "cartHook" })).toMatchObject({ ok: false, nodeId: "n-use-cart", path: ["name"] });
      expect(updateNode(sample(), "n-use-cart", { name: "useBasket" }).ok).toBe(true);
    });
    it("빈 이름은 거부한다", () => {
      expect(updateNode(sample(), "n-price", { name: "" })).toMatchObject({ ok: false, path: ["name"] });
    });
  });

  describe("종류", () => {
    it("컴포넌트끼리는 바꿀 수 있다", () => {
      expect(node(must(updateNode(sample(), "n-price", { kind: "container" })), "n-price").kind).toBe("container");
    });
    it("루트가 아닌 노드를 페이지로 바꾸는 것은 거부한다(page는 화면 단위 최상위)", () => {
      const r = updateNode(sample(), "n-price", { kind: "page" });
      expect(r).toMatchObject({ ok: false, nodeId: "n-price", path: ["kind"] });
      if (!r.ok) expect(r.reason).toContain("루트");
    });
    it("루트는 페이지를 유지하거나 다른 종류로 바꿀 수 있다", () => {
      expect(updateNode(sample(), "n-page", { kind: "page" })).toEqual({ ok: true, blueprint: sample() });
      expect(node(must(updateNode(sample(), "n-page", { kind: "container" })), "n-page").kind).toBe("container");
    });
    it("이미 페이지인 루트가 아닌 노드(AI 초안)도 다른 필드는 고칠 수 있고, 페이지로의 변경만 막는다", () => {
      const bp = sample();
      const legacy = { ...bp, nodes: bp.nodes.map((n) => (n.id === "n-price" ? { ...n, kind: "page" as const } : n)) };
      expect(updateNode(legacy, "n-price", { dataFetch: true }).ok).toBe(true); // 스키마가 허용하는 기존 값은 그대로 편집된다
      expect(updateNode(legacy, "n-price", { kind: "page" }).ok).toBe(true); // 값이 그대로인 no-op은 거부하지 않는다
      expect(updateNode(legacy, "n-price", { kind: "container" }).ok).toBe(true); // 벗어나는 변경은 허용
      expect(updateNode(legacy, "n-gallery", { kind: "page" }).ok).toBe(false);
    });
    it("훅↔컴포넌트 전환은 거부하고 새 노드로 추가하라고 안내한다", () => {
      const toHook = updateNode(sample(), "n-price", { kind: "hook" });
      expect(toHook).toMatchObject({ ok: false, path: ["kind"] });
      if (!toHook.ok) expect(toHook.reason).toContain("새 노드로 추가");
      expect(updateNode(sample(), "n-use-cart", { kind: "presentational" })).toMatchObject({ ok: false, path: ["kind"] });
    });
  });

  describe("목록 필드", () => {
    it("책임은 5개까지만 허용한다", () => {
      const five = ["a", "b", "c", "d", "e"];
      expect(node(must(updateNode(sample(), "n-price", { responsibilities: five })), "n-price").responsibilities).toEqual(five);
      expect(updateNode(sample(), "n-price", { responsibilities: [...five, "f"] })).toMatchObject({ ok: false, nodeId: "n-price", path: ["responsibilities"] });
    });
    it("상태·props·이벤트·데이터 조회를 바꾼다", () => {
      const out = node(
        must(updateNode(sample(), "n-price", { state: [{ name: "open", description: "열림" }], props: [{ name: "price", type: "number" }], events: ["onClick"], dataFetch: true })),
        "n-price",
      );
      expect(out).toMatchObject({ state: [{ name: "open", description: "열림" }], props: [{ name: "price", type: "number" }], events: ["onClick"], dataFetch: true });
    });
    it("이름이 빈 상태·타입이 빈 prop은 거부한다", () => {
      expect(updateNode(sample(), "n-price", { state: [{ name: "" }] }).ok).toBe(false);
      expect(updateNode(sample(), "n-price", { props: [{ name: "price", type: "" }] }).ok).toBe(false);
    });
    it("훅은 이벤트를 가질 수 없다", () => {
      expect(updateNode(sample(), "n-use-cart", { events: ["onClick"] })).toMatchObject({ ok: false, nodeId: "n-use-cart", path: ["events"] });
    });
  });

  describe("렌더링 방식", () => {
    it("Next.js 컴포넌트는 server·client로 바꿀 수 있고 null은 거부한다", () => {
      expect(node(must(updateNode(sample(), "n-price", { renderMode: "server" })), "n-price").renderMode).toBe("server");
      expect(updateNode(sample(), "n-price", { renderMode: null })).toMatchObject({ ok: false, path: ["renderMode"] });
    });
    it("훅은 renderMode를 가질 수 없다", () => {
      expect(updateNode(sample(), "n-use-cart", { renderMode: "client" })).toMatchObject({ ok: false, path: ["renderMode"] });
    });
    it("Next.js가 아니면 값을 가질 수 없다", () => {
      const bp = sample();
      const react = { ...bp, stack: { ...bp.stack, framework: "react" as const }, nodes: bp.nodes.map((n) => ({ ...n, renderMode: null })) };
      expect(updateNode(react, "n-price", { renderMode: "client" })).toMatchObject({ ok: false, path: ["renderMode"] });
    });
  });

  describe("파일 위치", () => {
    it("FSD면 계층/슬라이스/세그먼트 형식이어야 한다", () => {
      expect(node(must(updateNode(sample(), "n-price", { location: { dir: "shared/ui" } })), "n-price").location.dir).toBe("shared/ui");
      expect(updateNode(sample(), "n-price", { location: { dir: "components" } })).toMatchObject({ ok: false, nodeId: "n-price", path: ["location", "dir"] });
      expect(updateNode(sample(), "n-price", { location: { dir: "features/Cart/ui" } }).ok).toBe(false);
    });
    it("슬래시로 시작하는 위치는 거부한다", () => {
      expect(updateNode(sample(), "n-price", { location: { dir: "/shared/ui" } }).ok).toBe(false);
    });
    it("type-based는 kebab-case 폴더면 자유롭게 쓸 수 있다", () => {
      const bp = sample();
      const tb = { ...bp, stack: { ...bp.stack, architecture: "type-based" as const } };
      expect(node(must(updateNode(tb, "n-price", { location: { dir: "components/common" } })), "n-price").location.dir).toBe("components/common");
    });
  });

  describe("AI 가정 표시", () => {
    it("고친 필드는 assumedFields에서 빼고, 남은 필드는 유지한다", () => {
      const out = node(must(updateNode(sample(), "n-review", { props: [{ name: "rating", type: "number" }] })), "n-review");
      expect(out.assumed).toBe(true);
      expect(out.assumedFields).toEqual(["responsibilities"]);
    });
    it("목록이 비면 assumed를 false로 하고 assumedFields를 지운다", () => {
      const bp = must(updateNode(sample(), "n-review", { props: [] }));
      const out = node(must(updateNode(bp, "n-review", { responsibilities: ["후기 요약"] })), "n-review");
      expect(out.assumed).toBe(false);
      expect("assumedFields" in out).toBe(false);
    });
    it("가정과 상관없는 필드를 고치면 표시를 그대로 둔다", () => {
      const out = node(must(updateNode(sample(), "n-review", { dataFetch: true })), "n-review");
      expect(out.assumed).toBe(true);
      expect(out.assumedFields).toEqual(["responsibilities", "props"]);
    });
    it("isAssumedField: 최상위 필드명·하위 경로·인덱스로 가정을 판정하고, assumed가 false면 항상 false", () => {
      const review = node(sample(), "n-review");
      expect(isAssumedField(review, "props")).toBe(true);
      expect(isAssumedField(review, "state")).toBe(false);
      const sub = { ...review, assumedFields: ["layout.gap", "responsibilities[0]"] };
      expect(isAssumedField(sub, "layout")).toBe(true);
      expect(isAssumedField(sub, "responsibilities")).toBe(true);
      expect(isAssumedField(sub, "lay")).toBe(false); // 이름이 앞부분만 같은 다른 필드
      expect(isAssumedField({ ...review, assumed: false }, "props")).toBe(false);
    });
    it("가정한 필드 목록이 없으면 표시를 그대로 둔다", () => {
      const bp = sample();
      const noList = { ...bp, nodes: bp.nodes.map((n) => (n.id === "n-review" ? { ...n, assumedFields: undefined } : n)) };
      expect(node(must(updateNode(noList, "n-review", { props: [] })), "n-review").assumed).toBe(true);
    });
  });
});
