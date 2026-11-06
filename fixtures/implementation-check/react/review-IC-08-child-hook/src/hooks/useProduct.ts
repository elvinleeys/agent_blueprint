import { useEffect, useState } from "react";
import type { Product } from "@/types";

export function useProduct() {
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetch("/api/products/1")
      .then((res) => res.json())
      .then((data: Product) => setProduct(data));
  }, []);

  return product;
}
