type InputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
};

export function Input({ value, onChange, placeholder, invalid = false }: InputProps) {
  return <input value={value} placeholder={placeholder} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
}
