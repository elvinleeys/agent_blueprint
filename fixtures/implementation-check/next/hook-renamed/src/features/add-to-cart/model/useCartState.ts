import { useState } from "react";

export function useCartState() {
  const [cartCount, setCartCount] = useState(0);

  async function addToCart() {
    await fetch("/api/cart", { method: "POST" });
    setCartCount((count) => count + 1);
  }

  return { cartCount, addToCart };
}
