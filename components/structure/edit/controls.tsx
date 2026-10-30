"use client";

import { useState } from "react";
import type { EditResult } from "@/core/edit/result";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStructureStore } from "../StructureStoreProvider";
import { AssumedBadge, Field, FieldError, fieldId, useClearErrorOnUnmount, useEditApi } from "./Field";

type Common = { fieldKey: string; label: string; assumed?: boolean; hint?: string };

/**
 * 한 줄 입력. 글자마다 onChange로 연산을 적용해 보고, 거부되면 그 글자를 칸에만 남기고(draft) 이유를 칸 옆에 보인다.
 * 설계도에 반영된 값(value)과 같아지면 draft를 버리고 value를 그대로 보인다.
 */
export function TextField({ fieldKey, label, assumed, hint, value, placeholder, mono, onChange }: Common & { value: string; placeholder?: string; mono?: boolean; onChange: (text: string) => EditResult }) {
  const [draft, setDraft] = useState<string | null>(null);
  const { setError } = useEditApi();
  return (
    <Field fieldKey={fieldKey} label={label} assumed={assumed} hint={hint}>
      {(p) => (
        <Input
          {...p}
          value={draft ?? value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={mono ? "font-mono" : undefined}
          onChange={(e) => {
            const text = e.target.value;
            const r = onChange(text);
            setError(fieldKey, r.ok ? null : r.reason);
            setDraft(r.ok ? null : text);
          }}
        />
      )}
    </Field>
  );
}

export type Option = { value: string; label: string; disabled?: boolean };

/** 선택 상자. 거부되면 이유를 보이고 상자는 설계도에 반영된 값으로 남는다 */
export function SelectField({ fieldKey, label, assumed, hint, value, options, onChange }: Common & { value: string; options: readonly Option[]; onChange: (value: string) => EditResult }) {
  const { setError } = useEditApi();
  return (
    <Field fieldKey={fieldKey} label={label} assumed={assumed} hint={hint}>
      {(p) => (
        <Select
          value={value}
          onValueChange={(v) => {
            const r = onChange(v);
            setError(fieldKey, r.ok ? null : r.reason);
          }}
        >
          <SelectTrigger {...p} size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

/** 체크 상자. 글자가 이름표의 일부이므로 상자 전체가 이름표다 */
export function CheckField({ fieldKey, label, assumed, hint, checked, onChange }: Common & { checked: boolean; onChange: (checked: boolean) => EditResult }) {
  const id = fieldId(fieldKey);
  const error = useStructureStore((s) => s.editErrors[fieldKey]);
  const { setError } = useEditApi();
  useClearErrorOnUnmount(fieldKey);
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="size-4 accent-primary"
          onChange={(e) => {
            const r = onChange(e.target.checked);
            setError(fieldKey, r.ok ? null : r.reason);
          }}
        />
        {label}
        {assumed && <AssumedBadge />}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-foreground-tertiary">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}
