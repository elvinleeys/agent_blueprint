type Props = { count: number };

// 설계도의 ProductGallery와 이름만 같은 다른 컴포넌트(자리 표시용)
export function ProductGallery({ count }: Props) {
  return <div className="rounded-md">{count}</div>;
}
