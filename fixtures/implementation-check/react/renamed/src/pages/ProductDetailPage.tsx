import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { ItemImages } from "@/components/ItemImages";
import { ReviewSummary } from "@/components/ReviewSummary";
import { ProductInfo } from "@/components/ProductInfo";

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
      <ItemImages images={product.images} />
      <ProductInfo product={product} />
      <ReviewSummary rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
