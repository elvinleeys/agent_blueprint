import type { Product } from "@/entities/product/model/types";
import { ProductGallery } from "@/entities/product/ui/ProductGallery";
import { ReviewSummary } from "@/entities/review/ui/ReviewSummary";
import { ProductInfo } from "@/widgets/product-info/ui/ProductInfo";

// 설계도의 ProductDetailPage를 별도 컴포넌트로 두지 않고 라우팅 파일 안에서 바로 그린다
export default async function Page() {
  const res = await fetch("https://example.com/api/products/1");
  const product = (await res.json()) as Product;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start p-6">
      <ProductGallery images={product.images} />
      <ProductInfo product={product} />
      <ReviewSummary rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
