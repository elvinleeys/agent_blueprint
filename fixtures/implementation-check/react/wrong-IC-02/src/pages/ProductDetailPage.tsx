import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { ProductGallery } from "@/components/ProductGallery";
import { ReviewSummary } from "@/components/ReviewSummary";
import { ProductInfo } from "@/components/ProductInfo";
import { PromoBanner } from "@/widgets/promo-banner/ui/PromoBanner";

export function ProductDetailPage() {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetch("/api/products/1")
      .then((res) => res.json())
      .then((data: Product) => setProduct(data));
  }, []);

  if (!product) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start p-6">
      <ProductGallery images={product.images} />
      <ProductInfo product={product} />
      <PromoBanner />
      <ReviewSummary rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
