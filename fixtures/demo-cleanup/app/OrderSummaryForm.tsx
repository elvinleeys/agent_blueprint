// 일부러 넣은 문제: props가 9개(나누기 후보)
type OrderSummaryFormProps = {
  orderId: string;
  items: string[];
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  total: number;
  onSubmit: () => void;
  onCancel: () => void;
};

export function OrderSummaryForm({ orderId, items, subtotal, shipping, discount, tax, total, onSubmit, onCancel }: OrderSummaryFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <h2>주문 {orderId}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        {subtotal} + {shipping} - {discount} + {tax} = {total}
      </p>
      <button type="button" onClick={onCancel}>
        취소
      </button>
    </form>
  );
}
