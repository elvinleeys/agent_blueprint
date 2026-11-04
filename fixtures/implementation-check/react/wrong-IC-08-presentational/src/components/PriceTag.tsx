import { useEffect } from "react";

type Props = { price: number; discountRate: number };

export function PriceTag({ price, discountRate }: Props) {
  useEffect(() => {
    void fetch("/api/rate");
  }, []);
  const finalPrice = Math.round(price * (1 - discountRate));
  return <p className="text-primary">{finalPrice}</p>;
}
