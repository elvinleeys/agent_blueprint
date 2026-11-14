type Props = { price: number; discount: number };

export function PriceTag({ price, discount }: Props) {
  const finalPrice = Math.round(price * (1 - discount));
  return <p className="text-primary">{finalPrice}</p>;
}
