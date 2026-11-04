import { MAX_RATING } from "@/entities/review/ui/ReviewSummary";
import type { ProductImage } from "@/entities/product/model/types";

type Props = { images: ProductImage[] };

export function ProductGallery({ images }: Props) {
  return (
    <ul className="rounded-md">
      {images.slice(0, MAX_RATING).map((image) => (
        <li key={image.src}>
          <img src={image.src} alt={image.alt} />
        </li>
      ))}
    </ul>
  );
}
