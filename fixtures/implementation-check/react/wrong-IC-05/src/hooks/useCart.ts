export function useCart() {
  async function addToCart() {
    await fetch("/api/cart", { method: "POST" });
  }

  return { addToCart };
}
