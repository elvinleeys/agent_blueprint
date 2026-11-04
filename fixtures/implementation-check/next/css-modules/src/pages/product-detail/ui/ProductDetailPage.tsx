import styles from "./ProductDetailPage.module.css";
import type { Product } from "@/entities/product/model/types";
import { ProductGallery } from "@/entities/product/ui/ProductGallery";
import { ReviewSummary } from "@/entities/review/ui/ReviewSummary";
import { ProductInfo } from "@/widgets/product-info/ui/ProductInfo";

export async function ProductDetailPage() {
  const res = await fetch("https://example.com/api/products/1");
  const product = (await res.json()) as Product;

  return (
    <div className={styles.root}>
      <ProductGallery images={product.images} />
      <ProductInfo product={product} />
      <ReviewSummary rating={product.rating} reviewCount={product.reviewCount} />
    </div>
  );
}
