import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductInfo } from "@/components/ProductInfo";

// 경로를 코드에서 알 수 없는 동적 import: 설계에 있는 ReviewSummary가 여기로 들어오는지 알 수 없다
const loadSection = (name: string) => import(/* @vite-ignore */ `@/components/${name}`);

export function ProductDetailPage() {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetch("/api/products/1")
      .then((res) => res.json())
      .then((data: Product) => setProduct(data));
    void loadSection("ReviewSummary");
  }, []);

  if (!product) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start p-6">
      <ProductGallery images={product.images} />
      <ProductInfo product={product} />
    </div>
  );
}
