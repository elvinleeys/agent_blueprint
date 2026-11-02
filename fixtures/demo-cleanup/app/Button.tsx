// 일부러 넣은 문제: 공식 Button과 같은 이름의 별도 구현(디자인 시스템 파일을 올렸을 때만 경고)
type ButtonProps = {
  label: string;
  size?: "sm" | "lg";
  onClick?: () => void;
};

export function Button({ label, size = "sm", onClick }: ButtonProps) {
  return (
    <button type="button" data-size={size} onClick={onClick}>
      {label}
    </button>
  );
}
