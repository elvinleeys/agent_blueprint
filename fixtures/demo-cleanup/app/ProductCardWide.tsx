type ProductCardWideProps = {
  title: string;
  image: string;
  price: number;
  onBuy: () => void;
  description?: string;
};

export function ProductCardWide({ title, image, price, onBuy, description }: ProductCardWideProps) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{image}</p>
      <p>{description}</p>
      <p>{price}</p>
      <button type="button" onClick={onBuy}>
        구매
      </button>
    </article>
  );
}
