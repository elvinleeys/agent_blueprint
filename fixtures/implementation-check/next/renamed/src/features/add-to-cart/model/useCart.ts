import { useState } from "react";

export function useCart() {
  const [count, setCount] = useState(0);

  async function addToCart() {
    await fetch("/api/cart", { method: "POST" });
    setCount((value) => value + 1);
  }

  return { count, addToCart };
}
