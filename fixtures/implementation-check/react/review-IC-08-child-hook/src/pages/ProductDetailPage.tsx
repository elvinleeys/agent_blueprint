import { useProduct } from "@/hooks/useProduct";
import { ProductGallery } from "@/components/ProductGallery";
import { ReviewSummary } from "@/components/ReviewSummary";
import { ProductInfo } from "@/components/ProductInfo";

export function ProductDetailPage() {
  const product = useProduct();

  if (!product) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start p-6">
      <ProductGallery images={product.images} />
      <ProductInfo product={product} />
      <ReviewSummary rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
