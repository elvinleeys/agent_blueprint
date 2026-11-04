import styles from "./ReviewSummary.module.css";
type Props = { rating: number; reviewCount: number };

export const MAX_RATING = 5;

export function ReviewSummary({ rating, reviewCount }: Props) {
  return (
    <p className={styles.root}>
      {rating} / {MAX_RATING} ({reviewCount})
    </p>
  );
}
