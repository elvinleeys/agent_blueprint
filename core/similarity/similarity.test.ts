import { describe, expect, it } from "vitest";
import { COMPARE_CONFIG } from "../cleanup/compare";
import { R05_NAME_JACCARD } from "../rules/common/relations";
import { common, jaccard, words } from "./name-similarity";
import { NAME_JACCARD_MIN, PROPS_JACCARD_MIN } from "./thresholds";

describe("이름 유사도 기준값은 한 곳의 값을 세 기능이 가져다 쓴다", () => {
  it("구조 검사 R-05와 정리 C-02는 공용 기준값과 같다(0.5)", () => {
    expect(NAME_JACCARD_MIN).toBe(0.5);
    expect(PROPS_JACCARD_MIN).toBe(0.5);
    expect(R05_NAME_JACCARD).toBe(NAME_JACCARD_MIN);
    expect(COMPARE_CONFIG.NAME_JACCARD_MIN).toBe(NAME_JACCARD_MIN);
    expect(COMPARE_CONFIG.PROPS_JACCARD_MIN).toBe(PROPS_JACCARD_MIN);
  });
});

describe("정리에서 그대로 옮긴 단어 쪼개기·Jaccard", () => {
  it("PascalCase·camelCase·약어·숫자·밑줄·하이픈", () => {
    expect([...words("discountRate")]).toEqual(["discount", "rate"]);
    expect([...words("ProductCardWide")]).toEqual(["product", "card", "wide"]);
    expect([...words("URLParser")]).toEqual(["url", "parser"]);
    expect([...words("Product_Gallery")]).toEqual(["product", "gallery"]);
    expect([...words("Grid2Col")]).toEqual(["grid2", "col"]);
  });
  it("Jaccard: 겹침 ÷ 합집합, 둘 다 비면 0", () => {
    expect(jaccard(words("ProductCard"), words("ProductCardWide"))).toBeCloseTo(2 / 3);
    expect(jaccard(words("Button"), words("ButtonPrimary"))).toBe(0.5);
    expect(jaccard(new Set<string>(), new Set<string>())).toBe(0);
    expect(common(words("ProductCard"), words("ProductInfo"))).toEqual(["product"]);
  });
});
