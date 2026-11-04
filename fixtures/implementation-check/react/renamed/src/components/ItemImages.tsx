import type { ProductImage } from "@/types";

type Props = { images: ProductImage[] };

export function ItemImages({ images }: Props) {
  return (
    <ul className="rounded-md">
      {images.map((image) => (
        <li key={image.src}>
          <img src={image.src} alt={image.alt} />
        </li>
      ))}
    </ul>
  );
}
