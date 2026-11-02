// 일부러 넣은 문제: 공식 Button과 이름·props가 비슷한데 따로 만들었다(합치기 후보, 공식이 들어간 경고)
type ButtonPrimaryProps = {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
};

export function ButtonPrimary({ label, disabled = false, onClick }: ButtonPrimaryProps) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
