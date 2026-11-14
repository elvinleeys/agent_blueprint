"use client";

import styles from "./OptionSelector.module.css";
type Props = { options: string[]; selectedOption: string | null; onChange: (option: string) => void };

export function OptionSelector({ options, selectedOption, onChange }: Props) {
  return (
    <div className={styles.root}>
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={option === selectedOption} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}
