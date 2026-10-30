"use client";

import { useRef, useState, type ReactNode } from "react";
import type { EditResult } from "@/core/edit/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStructureStore } from "../StructureStoreProvider";
import { AssumedBadge, FieldError, fieldId, useClearErrorOnUnmount, useEditApi } from "./Field";
import { completeRows, locateRowError } from "./list-draft";
import { useRowIds } from "./useRowIds";

const INCOMPLETE = "비어 있어 저장되지 않습니다.";

function ListShell({ fieldKey, label, assumed, hint, children }: { fieldKey: string; label: string; assumed?: boolean; hint?: string; children: ReactNode }) {
  const id = fieldId(fieldKey);
  const error = useStructureStore((s) => s.editErrors[fieldKey]);
  useClearErrorOnUnmount(fieldKey); // 이 목록과 행·칸의 오류를 함께 지운다
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="flex items-center gap-2 text-xs font-medium text-foreground-secondary">
        {label}
        {assumed && <AssumedBadge />}
      </legend>
      {children}
      {hint && <p className="text-xs text-foreground-tertiary">{hint}</p>}
      {error && <FieldError id={`${id}-error`} message={error} />}
    </fieldset>
  );
}

/** 삭제로 포커스를 가진 버튼이 사라지므로 추가 버튼으로 옮긴다(최대 개수에서 비활성이던 버튼이 다시 켜진 뒤에 맞춘다) */
const focusLater = (el: HTMLElement | null) => requestAnimationFrame(() => el?.focus());

type ListProps = { fieldKey: string; label: string; itemLabel: string; assumed?: boolean; hint?: string };

/**
 * 글 한 줄짜리 목록(책임·이벤트). 행 추가·삭제, 최대 개수에서 추가 비활성, 새 행에 포커스.
 * 빈 행은 설계도에 넣지 않고 화면에만 둔다(오류로 보지 않는다).
 */
export function StringListField({ fieldKey, label, itemLabel, assumed, hint, rows, max, placeholder, onCommit }: ListProps & { rows: readonly string[]; max?: number; placeholder?: string; onCommit: (rows: string[]) => EditResult }) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const errors = useStructureStore((s) => s.editErrors);
  const { setError, clearErrors } = useEditApi();
  const shown = draft ?? rows;
  const rowIds = useRowIds(rows.length, shown.length); // 행마다 고유 id를 키로 쓴다(중간 행을 지워도 나머지 행의 상태가 유지된다)

  function update(next: string[]) {
    const { rows: complete } = completeRows(next, (t) => t.trim() !== "");
    clearErrors(fieldKey);
    const r = onCommit(complete);
    if (!r.ok) setError(fieldKey, r.reason);
    setDraft(r.ok && complete.length === next.length ? null : next);
  }

  return (
    <ListShell fieldKey={fieldKey} label={label} assumed={assumed} hint={max !== undefined ? `${hint ? `${hint} ` : ""}최대 ${max}개` : hint}>
      {shown.length === 0 && <p className="text-sm text-foreground-tertiary">없음</p>}
      <ul className="flex flex-col gap-1.5">
        {shown.map((text, i) => {
          const id = fieldId(`${fieldKey}.${i}`);
          const rowError = errors[`${fieldKey}.${i}`];
          return (
            <li key={rowIds.idOf(i)} className="flex flex-col gap-1">
              <div className="flex gap-1">
                <Input
                  id={id}
                  aria-label={`${itemLabel} ${i + 1}`}
                  aria-invalid={rowError ? true : undefined}
                  aria-describedby={rowError ? `${id}-error` : undefined}
                  value={text}
                  placeholder={placeholder}
                  autoFocus={rowIds.focusId === rowIds.idOf(i)}
                  onChange={(e) => update(shown.map((t, k) => (k === i ? e.target.value : t)))}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`${itemLabel} ${i + 1} 삭제`}
                  onClick={() => {
                    rowIds.removed(i);
                    update(shown.filter((_, k) => k !== i));
                    focusLater(addRef.current);
                  }}
                >
                  삭제
                </Button>
              </div>
              {rowError && <FieldError id={`${id}-error`} message={rowError} />}
            </li>
          );
        })}
      </ul>
      <Button
        ref={addRef}
        type="button"
        size="sm"
        variant="outline"
        disabled={max !== undefined && shown.length >= max}
        onClick={() => {
          rowIds.added();
          update([...shown, ""]);
        }}
      >
        {itemLabel} 추가
      </Button>
    </ListShell>
  );
}

export type Column<R> = { key: keyof R & string; label: string; kind?: "text" | "check"; required?: boolean; placeholder?: string };
type Row = Record<string, string | boolean>;

/**
 * 여러 칸으로 된 목록(상태·props·스타일 속성). 필수 칸이 모두 채워진 행만 설계도에 넣고,
 * 일부만 채운 행에는 비어 있는 필수 칸 옆에 이유를 보인다. 연산이 거부한 행·칸은 rowPath로 찾아 그 칸 옆에 보인다.
 */
export function RecordListField<R extends Row>({ fieldKey, label, itemLabel, assumed, hint, rows, columns, emptyRow, rowPath, onCommit }: ListProps & { rows: readonly R[]; columns: readonly Column<R>[]; emptyRow: R; rowPath: readonly string[]; onCommit: (rows: R[]) => EditResult }) {
  const [draft, setDraft] = useState<R[] | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const errors = useStructureStore((s) => s.editErrors);
  const { setError, clearErrors } = useEditApi();
  const shown = draft ?? rows;
  const rowIds = useRowIds(rows.length, shown.length); // 행마다 고유 id를 키로 쓴다(중간 행을 지워도 나머지 행의 상태가 유지된다)

  const text = (r: R, c: Column<R>) => String(r[c.key]);
  const blank = (r: R) => columns.every((c) => c.kind === "check" || text(r, c).trim() === "");
  const complete = (r: R) => columns.every((c) => !c.required || text(r, c).trim() !== "");

  function update(next: R[]) {
    const { rows: ok, indexes } = completeRows(next, complete);
    clearErrors(fieldKey);
    const r = onCommit(ok);
    next.forEach((row, i) => {
      if (blank(row) || complete(row)) return;
      for (const c of columns) if (c.required && text(row, c).trim() === "") setError(`${fieldKey}.${i}.${c.key}`, INCOMPLETE);
    });
    if (!r.ok) {
      const at = locateRowError(r.path, rowPath, indexes);
      setError(at ? `${fieldKey}.${at.row}${at.cell ? `.${at.cell}` : ""}` : fieldKey, r.reason);
    }
    setDraft(r.ok && ok.length === next.length ? null : next);
  }

  return (
    <ListShell fieldKey={fieldKey} label={label} assumed={assumed} hint={hint}>
      {shown.length === 0 && <p className="text-sm text-foreground-tertiary">없음</p>}
      <ul className="flex flex-col gap-2">
        {shown.map((row, i) => {
          const rowError = errors[`${fieldKey}.${i}`];
          const firstText = columns.find((c) => c.kind !== "check");
          return (
            <li key={rowIds.idOf(i)} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
              {columns.map((c) => {
                const key = `${fieldKey}.${i}.${c.key}`;
                const id = fieldId(key);
                const error = errors[key];
                const name = `${itemLabel} ${i + 1} ${c.label}`;
                const set = (value: string | boolean) => update(shown.map((r, k) => (k === i ? { ...r, [c.key]: value } : r)));
                return (
                  <div key={c.key} className="flex flex-col gap-1">
                    {c.kind === "check" ? (
                      <label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
                        <input id={id} type="checkbox" checked={Boolean(row[c.key])} className="size-4 accent-primary" onChange={(e) => set(e.target.checked)} />
                        {c.label}
                      </label>
                    ) : (
                      <Input
                        id={id}
                        aria-label={name}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${id}-error` : undefined}
                        value={text(row, c)}
                        placeholder={c.placeholder ?? c.label}
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus={rowIds.focusId === rowIds.idOf(i) && c === firstText}
                        onChange={(e) => set(e.target.value)}
                      />
                    )}
                    {error && <FieldError id={`${id}-error`} message={error} />}
                  </div>
                );
              })}
              {rowError && <FieldError id={`${fieldId(`${fieldKey}.${i}`)}-error`} message={rowError} />}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="self-end"
                aria-label={`${itemLabel} ${i + 1} 삭제`}
                onClick={() => {
                  rowIds.removed(i);
                  update(shown.filter((_, k) => k !== i));
                  focusLater(addRef.current);
                }}
              >
                삭제
              </Button>
            </li>
          );
        })}
      </ul>
      <Button
        ref={addRef}
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          rowIds.added();
          update([...shown, { ...emptyRow }]);
        }}
      >
        {itemLabel} 추가
      </Button>
    </ListShell>
  );
}
