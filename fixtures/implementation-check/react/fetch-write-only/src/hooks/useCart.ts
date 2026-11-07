import { useState } from "react";

export function useCart() {
  const [cartCount, setCartCount] = useState(0);

  async function addToCart() {
    await fetch("/api/cart", { method: "PUT", body: JSON.stringify({ delta: 1 }) });
    setCartCount((count) => count + 1);
  }

  return { cartCount, addToCart };
}
