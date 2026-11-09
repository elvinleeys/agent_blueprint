type Props = { options: string[]; selectedOption: string | null; onChange: (option: string) => void };

export function OptionSelector({ options, selectedOption, onChange }: Props) {
  return (
    <div className="flex flex-row gap-2 items-center border-border rounded-sm">
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={option === selectedOption} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
