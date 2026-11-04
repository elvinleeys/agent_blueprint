"use client";

import styles from "./AddToCartButton.module.css";
type Props = { disabled: boolean; onClick: () => void };

export function AddToCartButton({ disabled, onClick }: Props) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={styles.root}>
      장바구니 담기
    </button>
  );
}
