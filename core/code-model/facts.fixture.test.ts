import { describe, expect, it } from "vitest";
import { listCaseDirs, loadCode } from "../impl-check/load-fixture";
import { readCodeModel } from "./facts";

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
    expect(withRouter.files.find((f) => f.routerConfig)!.routes).toEqual([{ path: "/products/:id", component: "ProductDetailPage", line: 4 }]);
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
