import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BlueprintSchema } from "../schema/blueprint";
import { moveNode } from "./move-node";
import { describeEditNotices } from "./notice";
import { reject, type EditResult } from "./result";
import { updateNode } from "./update-node";

const sample = () => BlueprintSchema.parse(JSON.parse(readFileSync("core/schema/sample-blueprint.json", "utf-8")));

describe("describeEditNotices", () => {
  it("바꾼 것이 없거나 실패한 결과는 알릴 것이 없다", () => {
    expect(describeEditNotices(updateNode(sample(), "n-price", { dataFetch: true }))).toEqual([]);
    expect(describeEditNotices(reject("실패"))).toEqual([]);
  });

  it("layout을 채웠으면 노드 이름과 함께 세로 정렬 지정을 알린다", () => {
    // client인 PriceTag를 layout 없는 server 노드 ProductGallery 아래로: 배치만 채워지고 변환은 없다
    expect(describeEditNotices(moveNode(sample(), "n-price", "n-gallery"))).toEqual(["ProductGallery의 배치를 세로 정렬(flex, 간격 없음)로 지정했습니다."]);
  });

  it("client로 바꿨으면 개수와 이름을 알린다", () => {
    expect(describeEditNotices(moveNode(sample(), "n-gallery", "n-info"))).toEqual(["client 영역 안으로 옮겨져 노드 1개를 client로 바꿨습니다(ProductGallery)."]);
  });

  it("둘 다 해당하면 두 문장을 순서대로 돌려준다", () => {
    // server인 ProductGallery를 layout 없는 client 노드 PriceTag 아래로: 배치도 채워지고 client로도 바뀐다
    expect(describeEditNotices(moveNode(sample(), "n-gallery", "n-price"))).toEqual([
      "PriceTag의 배치를 세로 정렬(flex, 간격 없음)로 지정했습니다.",
      "client 영역 안으로 옮겨져 노드 1개를 client로 바꿨습니다(ProductGallery).",
    ]);
  });

  it("이름이 많으면 3개까지만 쓰고 나머지는 개수로 줄인다", () => {
    const bp = sample();
    const r: EditResult = { ok: true, blueprint: bp, toClient: ["n-page", "n-gallery", "n-info", "n-price", "n-option"] };
    expect(describeEditNotices(r)).toEqual(["client 영역 안으로 옮겨져 노드 5개를 client로 바꿨습니다(ProductDetailPage, ProductGallery, ProductInfo 외 2개)."]);
  });
});
