import type { Product, ProductImage } from "@/entities/product/model/types";
import { ReviewSummary } from "@/entities/review/ui/ReviewSummary";
import { ProductInfo } from "@/widgets/product-info/ui/ProductInfo";

// 설계도는 ProductGallery를 entities/product/ui의 별도 파일로 정했지만, 여기서는 이 파일 안에서만 쓴다(내보내지 않음)
function ProductGallery({ images }: { images: ProductImage[] }) {
  return (
    <ul className="rounded-md">
      {images.map((image) => (
        <li key={image.src}>
          <img src={image.src} alt={image.alt} />
        </li>
      ))}
    </ul>
  );
}

export async function ProductDetailPage() {
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
