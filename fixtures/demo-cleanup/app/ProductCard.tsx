// 일부러 넣은 문제: ProductCardWide와 이름·props가 비슷하다(공식이 없는 합치기 후보, 정보)
type ProductCardProps = {
  title: string;
  image: string;
  price: number;
  onBuy: () => void;
};

export function ProductCard({ title, image, price, onBuy }: ProductCardProps) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{image}</p>
      <p>{price}</p>
      <button type="button" onClick={onBuy}>
        구매
      </button>
    </article>
  );
}
