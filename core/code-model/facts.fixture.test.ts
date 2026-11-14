import { describe, expect, it } from "vitest";
import { listCaseDirs, loadCode, readExpected } from "../impl-check/load-fixture";
import { fetchSummary, pageRoutes, readCodeModel, rootClassState, unreadableScope } from "./facts";

// 기대 결과 표(expected.json)의 `facts`: 판정과 별개로 분석기가 읽어야 하는 값(서버 통신 유형·클래스 상태·화면 주소·import 해석)
describe.each(["next", "react"])("%s: expected.json의 facts", (bundle) => {
  for (const [name, c] of Object.entries(readExpected(bundle).cases)) {
    if (!c.facts) continue;
    it(name, () => {
      const m = readCodeModel(loadCode(bundle, name));
      const units = m.files.flatMap((f) => f.units);
      const find = (node: string) => units.find((u) => u.name === node)!;
      for (const [node, want] of Object.entries(c.facts!.fetch ?? {})) expect(fetchSummary(find(node)), `${node} 서버 통신`).toBe(want);
      for (const [node, classes] of Object.entries(c.facts!.classes ?? {})) for (const [cls, want] of Object.entries(classes)) expect(rootClassState(find(node), cls), `${node} ${cls}`).toBe(want);
      if (c.facts!.routes) expect(pageRoutes(m).map((r) => r.path).sort()).toEqual([...c.facts!.routes].sort());
      for (const [spec, want] of Object.entries(c.facts!.imports ?? {})) {
        const hit = m.files.flatMap((f) => f.imports).find((i) => i.spec === spec);
        expect(hit, `${spec} import를 찾음`).toBeDefined();
        expect(hit!.resolved, spec).toBe(want);
      }
    });
  }
});

describe("2c 시험 사례의 읽지 못한 코드·설정", () => {
  it("lazy에 경로가 적혀 있으면 그 파일만, import(변수)면 경로를 알 수 없음으로만 센다", () => {
    const lazy = unreadableScope(readCodeModel(loadCode("react", "lazy-with-path")));
    expect([...lazy.files]).toEqual(["src/components/ProductGallery.tsx"]);
    expect(lazy.unknownTarget).toBe(false);
    const dyn = unreadableScope(readCodeModel(loadCode("react", "dynamic-import-variable")));
    expect(dyn.unknownTarget).toBe(true);
    expect(dyn.files.size).toBe(0);
  });

  it("알 수 없는 별칭은 resolved null인 alias로 남고, 같은 파일의 다른 import는 그대로 풀린다", () => {
    const f = readCodeModel(loadCode("next", "alias-unknown")).files.find((x) => x.path.endsWith("ProductDetailPage.tsx"))!;
    const by = (s: string) => f.imports.find((i) => i.spec === s)!;
    expect(by("~/entities/product/ui/ProductGallery")).toMatchObject({ kind: "alias", resolved: null, resolvedBy: null });
    expect(by("@/widgets/product-info/ui/ProductInfo")).toMatchObject({ resolvedBy: "default", resolved: "src/widgets/product-info/ui/ProductInfo.tsx" });
  });

  it("tsconfig 사례: 설정으로 푼 import는 근거(설정 파일)를 가진다", () => {
    const f = readCodeModel(loadCode("next", "alias-tsconfig")).files.find((x) => x.path.endsWith("ProductDetailPage.tsx"))!;
    expect(f.imports.filter((i) => i.kind === "alias").map((i) => [i.resolvedBy, i.config])).toEqual([["tsconfig", "tsconfig.json"], ["tsconfig", "tsconfig.json"], ["tsconfig", "tsconfig.json"], ["tsconfig", "tsconfig.json"]]);
  });
});

// 시험 데이터(fixtures/implementation-check)에서 읽은 사실이 설계도와 맞는지 본다(규칙 판정은 3단계)
const unit = (bundle: string, caseName: string, name: string) => readCodeModel(loadCode(bundle, caseName)).files.flatMap((f) => f.units).find((u) => u.name === name)!;

describe("시험 데이터에서 읽은 사실", () => {
  it.each(["next", "react"])("%s: 모든 사례를 읽고 실패·문법 오류가 없다", (bundle) => {
    for (const c of ["correct", ...listCaseDirs(bundle)].filter((n, i, a) => a.indexOf(n) === i)) {
      const m = readCodeModel(loadCode(bundle, c));
      expect(m.failedPaths, `${bundle}/${c}`).toEqual([]);
      expect(m.partialFiles, `${bundle}/${c}`).toEqual([]);
    }
  });

  it("next correct: 조회는 페이지와 useCart에만, use client는 설계 client 컴포넌트에만, 별칭 import가 파일로 풀린다", () => {
    const m = readCodeModel(loadCode("next", "correct"));
    const units = m.files.flatMap((f) => f.units);
    expect(units.filter((u) => u.fetchCalls.length).map((u) => u.name).sort()).toEqual(["ProductDetailPage", "useCart"]);
    const page = m.files.find((f) => f.path.endsWith("ProductDetailPage.tsx"))!;
    expect(page.useClient).toBe(false);
    expect(page.imports.every((i) => i.resolved)).toBe(true);
    expect(page.units[0].rendered.map((r) => r.name)).toEqual(["ProductGallery", "ProductInfo", "ReviewSummary"]);
    expect(m.files.find((f) => f.path.endsWith("ProductInfo.tsx"))!.useClient).toBe(true);
    expect(m.files.find((f) => f.path === "app/products/[id]/page.tsx")!.defaultExport).toBe("ProductDetailPage");
    expect(unit("next", "correct", "ProductInfo")).toMatchObject({ state: ["selectedOption"] });
    expect(unit("next", "correct", "ProductInfo").hooks.map((h) => h.name)).toEqual(["useState", "useCart"]);
    expect(unit("next", "correct", "OptionSelector").eventProps).toEqual(["onChange"]);
    expect(unit("next", "correct", "ProductInfo").elements[0]).toMatchObject({ tag: "div", root: true, className: { always: ["flex", "flex-col", "gap-4", "items-stretch"] } });
  });

  it("react correct: 라우터 설정에서 route와 페이지 연결을 읽고, router.tsx를 지우면 라우터 설정이 없다", () => {
    const withRouter = readCodeModel(loadCode("react", "correct"));
    expect(withRouter.files.find((f) => f.routerConfig)!.routes).toEqual([{ router: "react-router", path: "/products/:id", raw: "/products/:id", component: "ProductDetailPage", layout: false, line: 4 }]);
    expect(readCodeModel(loadCode("react", "wrong-ICR-01")).files.find((f) => f.routerConfig)!.routes[0].path).toBe("/items/:id");
    expect(readCodeModel(loadCode("react", "review-ICR-01-no-router")).files.some((f) => f.routerConfig)).toBe(false);
  });

  it("react review-IC-08-child-hook: 조회는 페이지가 아니라 useProduct 훅 안에 있고 페이지가 그 훅을 호출한다", () => {
    expect(unit("react", "review-IC-08-child-hook", "ProductDetailPage").fetchCalls).toEqual([]);
    expect(unit("react", "review-IC-08-child-hook", "ProductDetailPage").hooks).toContainEqual({ name: "useProduct", path: "src/hooks/useProduct.ts" });
    expect(unit("react", "review-IC-08-child-hook", "useProduct").fetchCalls).toHaveLength(1);
  });

  it("IC-10 시험 사례와 css-modules: 기본 색 클래스·임의값은 always에, styles.root는 dynamic", () => {
    expect(unit("next", "review-IC-10-default-class", "PriceTag").elements[0].className?.always).toEqual(["text-gray-700"]);
    expect(unit("next", "wrong-IC-10", "PriceTag").elements[0].className?.always).toEqual(["text-[#e11d48]"]);
    expect(unit("next", "css-modules", "ProductInfo").elements[0].className).toMatchObject({ always: [], dynamic: true });
  });

  it("IC-12·ICN-03: 인라인 style과 server 파일 import가 사실로 남는다", () => {
    expect(unit("next", "wrong-IC-12", "ProductGallery").elements.some((e) => e.inlineStyle)).toBe(true);
    const m = readCodeModel(loadCode("next", "wrong-ICN-03"));
    const info = m.files.find((f) => f.path.endsWith("ProductInfo.tsx"))!;
    expect(info.useClient).toBe(true);
    expect(info.imports.some((i) => i.resolved?.endsWith("ProductGallery.tsx") || i.resolved?.endsWith("ReviewSummary.tsx"))).toBe(true);
  });
});
