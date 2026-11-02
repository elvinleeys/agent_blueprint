type ButtonProps = {
  variant?: "primary" | "secondary" | "outline-large";
  label: string;
  disabled?: boolean;
  onClick?: () => void;
};

export function Button({ variant = "primary", label, disabled = false, onClick }: ButtonProps) {
  return (
    <button type="button" data-variant={variant} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
