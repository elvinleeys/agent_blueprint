"use client";

import { useState } from "react";
import type { Product } from "@/types";
import { PriceTag } from "@/components/PriceTag";
import { AddToCartButton } from "@/components/AddToCartButton";
import { useCart } from "@/hooks/useCart";
import { OptionSelector } from "@/components/OptionSelector";

export const OPTION_LIMIT = 5;

type Props = { product: Product };

export function ProductInfo({ product }: Props) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const { cartCount, addToCart } = useCart();

  return (
    <div className="flex flex-col gap-4 items-stretch">
      <PriceTag price={product.price} discountRate={product.discountRate} />
      <OptionSelector options={product.options.slice(0, OPTION_LIMIT)} selectedOption={selectedOption} onChange={setSelectedOption} />
      <AddToCartButton disabled={selectedOption === null} onClick={addToCart} />
      <span>{cartCount}</span>
    </div>
  );
}
