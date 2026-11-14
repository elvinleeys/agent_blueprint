import { useState } from "react";

const pickMethod = (): string => "POST";

export function useCart() {
  const [cartCount, setCartCount] = useState(0);

  async function addToCart() {
    const method = pickMethod();
    await fetch("/api/cart", { method });
    setCartCount((count) => count + 1);
  }

  return { cartCount, addToCart };
}
