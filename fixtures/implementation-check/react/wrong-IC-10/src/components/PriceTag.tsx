type Props = { price: number; discountRate: number };

export function PriceTag({ price, discountRate }: Props) {
  const finalPrice = Math.round(price * (1 - discountRate));
  return <p className="text-[#e11d48]">{finalPrice}</p>;
}
