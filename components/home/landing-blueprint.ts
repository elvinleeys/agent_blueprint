import { BlueprintSchema, type ComponentNode } from "@/core/schema/blueprint";

// 홈 랜딩 전용 예시 설계도(저장된 프로젝트가 아니다). 일부러 경고 2건이 나오게 만들었다:
//  - R-03: product가 ProductPage → ProductInfo → PurchaseBox로 3단계 이어서 전달됨
//  - R-06: AddToCartButton이 스스로 바깥 여백(margin-top)을 가짐
// 기대하는 검사 결과는 landing-blueprint.test.ts가 고정한다.

const base: Omit<ComponentNode, "id" | "name" | "parentId"> = {
  order: 0,
  location: { dir: "components" },
  kind: "presentational",
  responsibilities: [],
  state: [],
  props: [],
  events: [],
  dataFetch: false,
  renderMode: "client",
  layout: null,
  placement: null,
  style: null,
  assumed: false,
};

const node = (n: Pick<ComponentNode, "id" | "name" | "parentId"> & Partial<ComponentNode>): ComponentNode => ({ ...base, ...n });

export const LANDING_BLUEPRINT = BlueprintSchema.parse({
  version: "1.2",
  title: "상품 상세 (예시 화면)",
  route: "/products/[id]",
  stack: { framework: "next", styling: "tailwind", architecture: "feature-based" },
  source: { hasSpec: true, imageCount: 0 },
  generatedBy: "ai",
  nodes: [
    node({
      id: "page",
      name: "ProductPage",
      parentId: null,
      kind: "page",
      renderMode: "server",
      dataFetch: true,
      responsibilities: ["상품 데이터 조회", "하위 영역 배치"],
      props: [{ name: "product", type: "Product" }],
      layout: { display: "grid", columns: 2, gap: "spacing.6", align: "start", responsive: [{ breakpoint: "mobile", columns: 1 }] },
    }),
    node({
      id: "gallery",
      name: "ProductGallery",
      parentId: "page",
      renderMode: "server",
      responsibilities: ["상품 이미지 목록 표시"],
      props: [{ name: "images", type: "ProductImage[]" }],
    }),
    node({
      id: "info",
      name: "ProductInfo",
      parentId: "page",
      order: 1,
      kind: "container",
      responsibilities: ["선택한 옵션 상태 관리", "가격·구매 영역 배치"],
      state: [{ name: "selectedOption", description: "사용자가 고른 상품 옵션" }],
      props: [{ name: "product", type: "Product" }],
      layout: { display: "flex", direction: "column", gap: "spacing.4", align: "stretch" },
    }),
    node({
      id: "purchase",
      name: "PurchaseBox",
      parentId: "info",
      kind: "container",
      responsibilities: ["가격과 담기 버튼 배치"],
      props: [{ name: "product", type: "Product" }],
      layout: { display: "flex", direction: "row", gap: "spacing.3", align: "center" },
    }),
    node({
      id: "price",
      name: "PriceTag",
      parentId: "purchase",
      responsibilities: ["가격 표시"],
      props: [{ name: "price", type: "number" }],
    }),
    node({
      id: "cart",
      name: "AddToCartButton",
      parentId: "purchase",
      order: 1,
      responsibilities: ["장바구니에 담기 요청"],
      events: ["onClick"],
      style: { scope: "module", properties: [{ property: "margin-top", value: "spacing.4", isToken: true }], ownsOuterSpacing: true },
    }),
  ],
});
