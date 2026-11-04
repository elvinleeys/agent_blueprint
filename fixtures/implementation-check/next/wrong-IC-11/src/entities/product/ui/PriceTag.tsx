"use client";

type Props = { price: number; discountRate: number };

export function PriceTag({ price, discountRate }: Props) {
  const finalPrice = Math.round(price * (1 - discountRate));
  return <p className="text-primary mt-4">{finalPrice}</p>;
}
