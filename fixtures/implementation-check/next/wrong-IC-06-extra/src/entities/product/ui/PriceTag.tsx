"use client";

type Props = { price: number; discountRate: number; currency?: string };

export function PriceTag({ price, discountRate, currency }: Props) {
  const finalPrice = Math.round(price * (1 - discountRate));
  return <p className="text-primary">{finalPrice}{currency}</p>;
}
