import styles from "./ProductGallery.module.css";
import type { ProductImage } from "@/entities/product/model/types";

type Props = { images: ProductImage[] };

export function ProductGallery({ images }: Props) {
  return (
    <ul className={styles.root}>
      {images.map((image) => (
        <li key={image.src}>
          <img src={image.src} alt={image.alt} />
        </li>
      ))}
    </ul>
  );
}
