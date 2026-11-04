type Props = { price: number };

export function PriceTag({ price }: Props) {
  const finalPrice = Math.round(price);
  return <p className="text-primary">{finalPrice}</p>;
}
