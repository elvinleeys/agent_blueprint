import { Suspense, lazy } from "react";
import type { Product } from "@/entities/product/model/types";
import { ReviewSummary } from "@/entities/review/ui/ReviewSummary";
import { ProductInfo } from "@/widgets/product-info/ui/ProductInfo";

// 시험용: 이 경로의 파일은 올리지 않았다(경로에 ProductGallery가 보이지만 파일을 읽을 수 없음)
// @ts-expect-error 존재하지 않는 경로
const ProductGallery = lazy(() => import("./ProductGallery"));

export async function ProductDetailPage() {
  const res = await fetch("https://example.com/api/products/1");
  const product = (await res.json()) as Product;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start p-6">
      <Suspense fallback={null}>
        <ProductGallery images={product.images} />
      </Suspense>
      <ProductInfo product={product} />
      <ReviewSummary rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
