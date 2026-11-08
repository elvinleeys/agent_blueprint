import type { Product } from "@/entities/product/model/types";
import { ItemImages } from "@/entities/product/ui/ItemImages";
import { ReviewSummary } from "@/entities/review/ui/ReviewSummary";
import { ProductInfo } from "@/widgets/product-info/ui/ProductInfo";

export async function ProductDetailPage() {
  const res = await fetch("https://example.com/api/products/1");
  const product = (await res.json()) as Product;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start p-6">
      <ItemImages images={product.images} />
      <ProductInfo product={product} />
      <ReviewSummary rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
