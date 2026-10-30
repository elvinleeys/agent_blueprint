"use client";

import { useEffect, type ReactNode } from "react";
import type { EditResult } from "@/core/edit/result";
import type { Blueprint } from "@/core/schema/blueprint";
import { Badge } from "@/components/ui/badge";
import { useStructureApi, useStructureStore } from "../StructureStoreProvider";
import { ASSUMED_BORDER, ASSUMED_TEXT } from "../violation-mark";

/** 입력칸 키("layout.gap")에서 만든 요소 id. 이름표·오류 문구·포커스 이동이 이 id로 연결된다 */
export const fieldId = (key: string) => `edit-${key.replaceAll(".", "-")}`;

/** 편집 연산을 적용하고 칸의 오류를 쓰는 도구. 연산 자체는 core/edit에 있고 여기서는 부르기만 한다 */
export function useEditApi() {
  const api = useStructureApi();
  return {
    apply: (op: (blueprint: Blueprint) => EditResult) => api.getState().applyEdit(op),
    setError: (key: string, message: string | null) => api.getState().setEditError(key, message),
    clearErrors: (key?: string) => api.getState().clearEditErrors(key),
  };
}

/** 칸이 사라지면(노드를 바꾸거나 조건이 달라져 숨겨지면) 그 칸의 오류도 함께 지운다 */
export function useClearErrorOnUnmount(key: string) {
  const api = useStructureApi();
  useEffect(() => () => api.getState().clearEditErrors(key), [api, key]);
}

export const AssumedBadge = () => (
  <Badge variant="outline" className={`${ASSUMED_BORDER} ${ASSUMED_TEXT}`}>
    AI 가정
  </Badge>
);

export const FieldError = ({ id, message }: { id: string; message: string }) => (
  <p id={id} aria-live="polite" className="text-xs text-destructive">
    {message}
  </p>
);

type ControlProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

/** 이름표 + 입력 + 도움말 + 오류. 입력에는 id·aria-invalid·aria-describedby를 넘겨 이름표와 오류 문구를 연결한다 */
export function Field({ fieldKey, label, assumed, hint, children }: { fieldKey: string; label: string; assumed?: boolean; hint?: string; children: (props: ControlProps) => ReactNode }) {
  const id = fieldId(fieldKey);
  const error = useStructureStore((s) => s.editErrors[fieldKey]);
  useClearErrorOnUnmount(fieldKey);
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 text-xs font-medium text-foreground-secondary">
        {label}
        {assumed && <AssumedBadge />}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-foreground-tertiary">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}
