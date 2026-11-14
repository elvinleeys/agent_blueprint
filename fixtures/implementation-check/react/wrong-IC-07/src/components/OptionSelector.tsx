type Props = { options: string[]; selectedOption: string | null };

export function OptionSelector({ options, selectedOption }: Props) {
  return (
    <div className="flex flex-row gap-2 items-center border-border rounded-sm">
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={option === selectedOption}>
          {option}
        </button>
      ))}
    </div>
  );
}
