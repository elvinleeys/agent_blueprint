import type { ReactNode } from "react";

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
};

export function Dialog({ open, title, onClose, children }: DialogProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {children}
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}
