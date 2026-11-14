import { useState } from "react";

export function useCart() {
  const [cartCount, setCartCount] = useState(0);

  function addToCart() {
    setCartCount((count) => count + 1);
  }

  return { cartCount, addToCart };
}
