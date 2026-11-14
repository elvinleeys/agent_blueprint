"use client";

import { useState } from "react";
import type { Product } from "@/entities/product/model/types";
import { PriceTag } from "@/entities/product/ui/PriceTag";
import { AddToCartButton } from "@/features/add-to-cart/ui/AddToCartButton";
import { useCart } from "@/features/add-to-cart/model/useCart";
import { OptionSelector } from "@/features/select-option/ui/OptionSelector";

export const OPTION_LIMIT = 5;

type Props = { product: Product };

export function ProductInfo({ product }: Props) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const { cartCount, addToCart } = useCart();

  return (
    <div className={selectedOption === null ? "flex flex-col gap-4 items-stretch" : "flex flex-col gap-4 items-stretch opacity-90"}>
      <PriceTag price={product.price} discountRate={product.discountRate} />
      <OptionSelector options={product.options.slice(0, OPTION_LIMIT)} selectedOption={selectedOption} onChange={setSelectedOption} />
      <AddToCartButton disabled={selectedOption === null} onClick={addToCart} />
      <span>{cartCount}</span>
    </div>
  );
}
