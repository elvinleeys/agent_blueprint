"use client";

import styles from "./PriceTag.module.css";
type Props = { price: number; discountRate: number };

export function PriceTag({ price, discountRate }: Props) {
  const finalPrice = Math.round(price * (1 - discountRate));
  return <p className={styles.root}>{finalPrice}</p>;
}
