"use client";

type Props = { disabled: boolean; onClick: () => void };

export function AddToCartButton({ disabled, onClick }: Props) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="bg-primary text-on-primary rounded-md">
      장바구니 담기
    </button>
  );
}
