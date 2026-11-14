type Props = { rating: number; reviewCount: number };

export const MAX_RATING = 5;

export function ReviewSummary({ rating, reviewCount }: Props) {
  return (
    <p className="col-span-full text-text-secondary">
      {rating} / {MAX_RATING} ({reviewCount})
    </p>
  );
}
