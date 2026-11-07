import { describe, expect, it } from "vitest";
import { readCodeModel } from "../code-model/facts";
import { blueprint } from "../rules/fixture";
import type { Blueprint } from "../schema/blueprint";
import { listCaseDirs, loadBlueprint, loadCode, readExpected, type ExpectedPair } from "./load-fixture";
import { designRoute, matchBlueprint } from "./match";
import { nameScore } from "./similarity";
import type { Pairing, UnitRef } from "./types";

const unitStr = (u: UnitRef) => `${u.name}@${u.path}`;
const sorted = (xs: string[]) => [...xs].sort();

/** 짝짓기 결과를 expected.json의 facts.pairs 모양으로 바꾼다 */
function describePairing(bp: Blueprint, p: Pairing): Record<string, ExpectedPair & { _score?: number }> {
  const out: Record<string, ExpectedPair & { _score?: number }> = {};
  for (const x of p.pairs) out[x.nodeName] = { state: "certain", unit: unitStr(x.unit), basis: sorted(x.evidence.map((e) => e.kind)), exported: x.unit.exported };
  for (const r of p.reviews) {
    const candidates = r.candidates.map((c) => unitStr(c.unit));
    if (r.reason === "candidate") out[r.nodeName] = { state: "candidate", unit: candidates[0], basis: sorted(r.evidence.map((e) => e.kind)), candidates, _score: r.candidates[0].score };
    else if (r.reason === "same-name-ambiguous") out[r.nodeName] = { state: "ambiguous", unit: null, basis: ["same-name"], candidates };
    else if (r.reason === "unreadable-named-path") out[r.nodeName] = { state: "unreadable", unit: null, basis: ["path-name-unread"], candidates, via: r.via };
    else out[r.nodeName] = { state: "unreadable", unit: null, basis: ["unknown-target"] };
  }
  for (const m of p.missing) out[m.nodeName] = { state: "missing", unit: null };
  expect(Object.keys(out).sort(), "모든 노드가 정확히 한 군데에만 나온다").toEqual(bp.nodes.map((n) => n.name).sort());
  return out;
}

describe.each(["next", "react"])("시험 데이터의 기대 짝 표(facts.pairs): %s 묶음", (bundle) => {
  for (const [name, c] of Object.entries(readExpected(bundle).cases)) {
    const want = c.facts?.pairs;
    if (!want) continue;
    it(name, () => {
      const bp = loadBlueprint(bundle, name);
      const p = matchBlueprint(bp, readCodeModel(loadCode(bundle, name)));
      const got = describePairing(bp, p);
      for (const [node, w] of Object.entries(want)) {
        const g = got[node];
        expect(g, `${node} 결과`).toBeDefined();
        expect(g.state, `${node} 상태`).toBe(w.state);
        if (w.unit !== undefined) expect(g.unit, `${node} 코드`).toBe(w.unit);
        if (w.basis) expect(g.basis, `${node} 근거`).toEqual(sorted(w.basis));
        if (w.exported !== undefined) expect(g.exported, `${node} 내보냄`).toBe(w.exported);
        if (w.candidates) expect(g.candidates, `${node} 후보 순서`).toEqual(w.candidates);
        if (w.via) expect(g.via, `${node} 읽지 못한 경로`).toBe(w.via);
        if (w.score !== undefined) expect(g._score).toBeCloseTo(w.score);
      }
      expect(p.extraUnits.map(unitStr).sort(), "코드에만 있는 것").toEqual([...(c.facts!.extraUnits ?? [])].sort());
      // 후보·확인 필요·없음은 이후 검사를 하지 않는다
      for (const n of bp.nodes) expect(p.checkable(n.id), `${n.name} checkable`).toBe(got[n.name].state === "certain");
    });
  }
});

// ── 같은 입력이면 같은 짝: 파일·노드 순서를 섞어도 결과가 같다 ──────────────────
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffled = <T>(xs: T[], r: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

describe.each(["next", "react"])("순서를 섞어도 같은 결과: %s 묶음의 모든 사례", (bundle) => {
  const cases = [...new Set(["correct", ...listCaseDirs(bundle)])];
  it.each(cases)("%s", (name) => {
    const bp = loadBlueprint(bundle, name);
    const files = loadCode(bundle, name);
    const result = (fs: typeof files, b: Blueprint) => JSON.stringify(matchBlueprint(b, readCodeModel(fs)), (_k, v) => (typeof v === "function" ? undefined : v));
    const base = result(files, bp);
    expect(result([...files].reverse(), bp)).toBe(base);
    for (const seed of [1, 2, 3]) {
      const r = rng(seed);
      expect(result(shuffled(files, r), { ...bp, nodes: shuffled(bp.nodes, r) })).toBe(base);
    }
  });
});

// ── 규칙별 시험(손으로 만든 코드) ───────────────────────────────────────────
const code = (files: Record<string, string>) => readCodeModel(Object.entries(files).map(([path, content]) => ({ path, content })));
const comp = (name: string, extra = "") => `export function ${name}() { ${extra} return <i />; }`;
const nodeSeed = (name: string, dir = "components", extra: object = {}) => ({ id: name.toLowerCase(), name, location: { dir }, ...extra });
const run = (seeds: ReturnType<typeof nodeSeed>[], files: Record<string, string>) => {
  const bp = blueprint(seeds);
  return { bp, p: matchBlueprint(bp, code(files)) };
};
const stateOf = (r: ReturnType<typeof run>, name: string) => describePairing(r.bp, r.p)[name];

describe("확실: 이름이 정확히 같거나 대소문자만 다르고 종류가 같다", () => {
  it("대소문자만 다르면 확실(근거 case)", () => {
    const r = run([nodeSeed("ProductGallery")], { "src/components/PRODUCTGALLERY.tsx": comp("PRODUCTGALLERY") });
    expect(stateOf(r, "ProductGallery")).toMatchObject({ state: "certain", basis: ["case"], unit: "PRODUCTGALLERY@src/components/PRODUCTGALLERY.tsx" });
  });

  it("정확히 같은 이름이 대소문자만 다른 이름보다 먼저 짝지어진다", () => {
    const r = run([nodeSeed("Card")], { "a/CARD.tsx": comp("CARD"), "b/Card.tsx": comp("Card") });
    expect(stateOf(r, "Card")).toMatchObject({ state: "certain", basis: ["exact"], unit: "Card@b/Card.tsx" });
  });

  it("종류가 다르면 짝지어지지 않는다(훅 노드 ↔ 컴포넌트, 컴포넌트 노드 ↔ 훅)", () => {
    const r = run([nodeSeed("useCart", "hooks", { kind: "hook" }), nodeSeed("Panel")], { "src/UseCart.tsx": comp("UseCart"), "src/hooks/usePanel.ts": "export function usePanel() { return 1; }" });
    expect(stateOf(r, "useCart").state).toBe("missing");
    expect(stateOf(r, "Panel").state).toBe("missing");
    expect(r.p.extraUnits.map(unitStr).sort()).toEqual(["UseCart@src/UseCart.tsx", "usePanel@src/hooks/usePanel.ts"]);
  });

  it("훅 노드는 코드의 훅과 이름이 같으면 확실", () => {
    const r = run([nodeSeed("useCart", "hooks", { kind: "hook" })], { "src/hooks/useCart.ts": "export function useCart() { return 1; }" });
    expect(stateOf(r, "useCart")).toMatchObject({ state: "certain", basis: ["exact"] });
  });

  it("내보내지 않은 컴포넌트도 확실, exported는 별도 정보로 기록한다", () => {
    const r = run([nodeSeed("Inner")], { "src/A.tsx": `function Inner() { return <i />; }\nexport function A() { return <Inner />; }` });
    expect(stateOf(r, "Inner")).toMatchObject({ state: "certain", exported: false });
    expect(r.p.pairOf("inner")!.unit.exported).toBe(false);
    expect(r.p.extraUnits.map((u) => u.name)).toEqual(["A"]); // 내보내지 않은 컴포넌트는 코드에만 있음에 들지 않는다
  });

  it("이름 없는 기본 내보내기는 파일 이름이 같아도 후보다(코드가 이름을 붙이지 않음)", () => {
    const r = run([nodeSeed("Card")], { "src/components/Card.tsx": "export default () => <i />;" });
    const g = stateOf(r, "Card");
    expect(g).toMatchObject({ state: "candidate", basis: ["file-name"] });
    expect(r.p.reviews[0].evidence[0].detail).toContain("파일 이름");
    expect(r.p.checkable("card")).toBe(false);
  });
});

describe("같은 이름이 여러 곳: 위치로 특정하고, 못 하면 확인 필요", () => {
  it("위치가 맞는 것이 하나면 확실, 나머지는 코드에만 있음", () => {
    const r = run([nodeSeed("Card", "entities/card/ui")], { "src/entities/card/ui/Card.tsx": comp("Card"), "src/shared/ui/Card.tsx": comp("Card") });
    expect(stateOf(r, "Card")).toMatchObject({ state: "certain", basis: ["same-name-location"], unit: "Card@src/entities/card/ui/Card.tsx" });
    expect(r.p.extraUnits.map(unitStr)).toEqual(["Card@src/shared/ui/Card.tsx"]);
  });

  it("위치가 맞는 것이 둘 이상이어도 특정하지 못한다(자동으로 첫 번째를 고르지 않는다)", () => {
    const r = run([nodeSeed("Card", "entities/card/ui")], { "a/entities/card/ui/Card.tsx": comp("Card"), "b/entities/card/ui/Card.tsx": comp("Card") });
    expect(stateOf(r, "Card")).toMatchObject({ state: "ambiguous", unit: null, candidates: ["Card@a/entities/card/ui/Card.tsx", "Card@b/entities/card/ui/Card.tsx"] });
    expect(r.p.extraUnits).toEqual([]); // 확인 필요 후보는 코드에만 있음이 아니다
  });

  it("위치가 하나도 안 맞으면 확인 필요이고, 후보 순서는 부모가 렌더링하는 것이 먼저다", () => {
    const bp = blueprint([nodeSeed("Panel", "ui", { id: "panel" }), nodeSeed("Card", "entities/card/ui", { parentId: "panel" })]);
    const p = matchBlueprint(
      bp,
      code({
        "src/ui/Panel.tsx": `import { Card } from "../z/Card";\nexport function Panel() { return <Card />; }`,
        "src/a/Card.tsx": comp("Card"),
        "src/z/Card.tsx": comp("Card"),
      }),
    );
    const g = describePairing(bp, p).Card;
    expect(g).toMatchObject({ state: "ambiguous", candidates: ["Card@src/z/Card.tsx", "Card@src/a/Card.tsx"] });
  });
});

describe("후보: 근거와 선택 순서", () => {
  it("`_`·`-`만 다른 이름은 확실이 아니라 후보 탐색에서만 같게 본다(이름 유사도 1.00)", () => {
    // 설계도 노드 이름과 코드 컴포넌트 이름은 PascalCase만 허용해 `_`·`-`가 들어갈 수 없다. 두 경우가 생길 수 있다: 파일 이름(`-`)에서 가져온 이름과 계산 자체
    expect(nameScore("ProductGallery", "Product_Gallery", false)).toBe(1);
    expect(nameScore("ProductGallery", "product-gallery", false)).toBe(1);
    const r = run([nodeSeed("ProductGallery")], { "src/components/product-gallery.tsx": "export default () => <i />;" });
    expect(stateOf(r, "ProductGallery")).toMatchObject({ state: "candidate", basis: ["file-name"], unit: "ProductGallery@src/components/product-gallery.tsx" });
  });

  it("이름 유사도가 기준값(0.5) 미만이고 다른 근거도 없으면 후보가 없다", () => {
    const r = run([nodeSeed("ProductGallery")], { "src/components/ItemImages.tsx": comp("ItemImages") });
    expect(stateOf(r, "ProductGallery").state).toBe("missing");
    expect(r.p.extraUnits.map((u) => u.name)).toEqual(["ItemImages"]);
  });

  it("짝 없는 노드와 코드가 후보로 묶이면 없음·코드에만 있음 두 건이 아니라 확인 필요 한 건", () => {
    const r = run([nodeSeed("ProductCard")], { "src/components/ProductCardList.tsx": comp("ProductCardList") });
    expect(r.p.missing.map((m) => m.nodeName)).toEqual(["Root"]); // 코드가 없는 루트(Root)만 없음
    expect(r.p.extraUnits).toEqual([]);
    expect(r.p.reviews.filter((x) => x.nodeName === "ProductCard")).toHaveLength(1);
  });

  it("한 코드가 두 노드의 1순위면 점수가 높은 노드가 가지고, 다른 노드의 후보 목록에도 남는다", () => {
    const r = run([nodeSeed("ProductCard"), nodeSeed("ProductCardWide")], { "src/ProductCardList.tsx": comp("ProductCardList") });
    const rA = r.p.reviews.find((x) => x.nodeName === "ProductCard")!;
    const rB = r.p.reviews.find((x) => x.nodeName === "ProductCardWide")!;
    expect(rA.candidates[0].score).toBeCloseTo(2 / 3);
    expect(rB.candidates[0].score).toBe(0.5);
    expect(unitStr(rA.candidates[0].unit)).toBe(unitStr(rB.candidates[0].unit));
    // 진 노드의 후보에는 그 코드가 다른 노드의 1순위이기도 하다는 사실을 표시한다(이긴 노드에는 표시가 없다)
    expect(rA.candidates[0].contestedBy).toBeUndefined();
    expect(rB.candidates[0].contestedBy).toEqual(["ProductCard"]);
  });

  it("점수가 같으면 노드 이름 순, 코드 경로 순으로 1순위를 정한다", () => {
    const r = run([nodeSeed("ItemCardOne"), nodeSeed("ItemCardTwo")], { "a/ItemCardGrid.tsx": comp("ItemCardGrid"), "b/ItemCardList.tsx": comp("ItemCardList") });
    const g = describePairing(r.bp, r.p);
    expect(g.ItemCardOne.candidates).toEqual(["ItemCardGrid@a/ItemCardGrid.tsx", "ItemCardList@b/ItemCardList.tsx"]);
    expect(g.ItemCardTwo.candidates).toEqual(["ItemCardList@b/ItemCardList.tsx", "ItemCardGrid@a/ItemCardGrid.tsx"]);
    const mark = (node: string) => r.p.reviews.find((x) => x.nodeName === node)!.candidates.map((c) => c.contestedBy ?? null);
    expect(mark("ItemCardOne")).toEqual([null, ["ItemCardTwo"]]); // Grid는 자기 1순위, List는 Two의 1순위
    expect(mark("ItemCardTwo")).toEqual([null, ["ItemCardOne"]]); // List는 자기 1순위, Grid는 One의 1순위
  });

  it("후보는 근거(종류·점수·설명)를 가진다", () => {
    const r = run([nodeSeed("ProductCard")], { "src/ProductCardList.tsx": comp("ProductCardList") });
    const ev = r.p.reviews[0].candidates[0].evidence;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "name-similarity" });
    expect(ev[0].score).toBeCloseTo(2 / 3);
    expect(ev[0].detail).toContain("0.67");
  });

  it("화면 주소 근거: 페이지 노드의 주소와 같은 주소의 화면 파일 안 컴포넌트가 후보(이름이 달라도)", () => {
    const withRoute = { ...blueprint([], undefined, { name: "ProductDetailPage", location: { dir: "pages" } }), route: "/products/[id]" };
    const p = matchBlueprint(withRoute, code({ "app/products/[id]/page.tsx": "export default function Page() { return <i />; }" }));
    const g = describePairing(withRoute, p).ProductDetailPage;
    expect(g).toMatchObject({ state: "candidate", basis: ["route"], unit: "Page@app/products/[id]/page.tsx" });
    expect(designRoute("/products/[id]")).toBe("/products/:id");
    expect(designRoute("/docs/[...slug]")).toBe("/docs/*");
    expect(designRoute("/docs/[[...slug]]")).toBe("/docs/*?");
    expect(designRoute("/a/:id/")).toBe("/a/:id");
    expect(designRoute(null)).toBeNull();
  });

  it("후보·같은 이름 여러 개·읽지 못한 코드·없음은 이후 검사를 하지 않는다(checkable false), 확실만 true", () => {
    const r = run([nodeSeed("Exact"), nodeSeed("ProductCard"), nodeSeed("Gone")], { "a/Exact.tsx": comp("Exact"), "b/ProductCardList.tsx": comp("ProductCardList") });
    expect(r.p.checkable("exact")).toBe(true);
    expect(r.p.checkable("productcard")).toBe(false);
    expect(r.p.checkable("gone")).toBe(false);
    expect(r.p.pairOf("productcard")).toBeUndefined();
  });
});

describe("읽지 못한 코드", () => {
  it("import(변수)는 확실한 짝을 낮추지 않고, 짝을 못 찾은 노드만 확인 필요로 보낸다", () => {
    const r = run([nodeSeed("Exact"), nodeSeed("Gone")], { "a/Exact.tsx": comp("Exact"), "a/Loader.tsx": `export const load = (n: string) => import(n);` });
    expect(stateOf(r, "Exact").state).toBe("certain");
    expect(stateOf(r, "Gone")).toMatchObject({ state: "unreadable", basis: ["unknown-target"] });
  });

  it("경로에 노드 이름이 보이는데 파일을 읽지 못하면, 같은 이름의 코드가 있어도 확실로 확정하지 않는다", () => {
    const r = run([nodeSeed("Card")], {
      "src/shared/Card.tsx": comp("Card"),
      "src/Page.tsx": `import { lazy } from "react";\nconst L = lazy(() => import("./Card"));\nexport function Page() { return <L />; }`,
    });
    expect(stateOf(r, "Card")).toMatchObject({ state: "unreadable", basis: ["path-name-unread"], via: "./Card", candidates: ["Card@src/shared/Card.tsx"] });
    expect(r.p.checkable("card")).toBe(false);
  });

  it("경로가 풀린 lazy나, 이름이 안 보이는 경로, 같은 끝 경로의 파일이 올라온 별칭은 낮추지 않는다", () => {
    const files = {
      "src/Card.tsx": comp("Card"),
      "src/ui/Button.tsx": comp("Button"),
      "src/Page.tsx": `import { lazy } from "react";\nimport { X } from "~/ui/Button";\nimport { Y } from "./other-missing";\nconst L = lazy(() => import("./Card"));\nexport function Page() { return <L />; }`,
    };
    const r = run([nodeSeed("Card"), nodeSeed("Button", "ui")], files);
    expect(stateOf(r, "Card").state).toBe("certain"); // lazy 대상이 올라와 있음
    expect(stateOf(r, "Button").state).toBe("certain"); // ~/ui/Button은 못 풀었지만 올라온 ui/Button.tsx와 끝 경로가 같음
  });
});
