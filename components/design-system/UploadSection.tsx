"use client";

import type { ChangeEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { describeLimitProblems, UPLOAD_LIMITS } from "@/core/cleanup/filter-files";
import { REJECT_LABEL, type UploadSummary } from "@/core/cleanup/upload-summary";
import type { RejectReason } from "@/core/cleanup/filter-files";

export type PickedFile = { path: string; size: number; file: File };

/** 폴더 선택이면 webkitRelativePath("선택한폴더/하위/A.tsx"), 파일 여러 개 선택이면 파일 이름 */
export const toPicked = (files: FileList | null): PickedFile[] =>
  Array.from(files ?? []).map((file) => ({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, size: file.size, file }));

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`;

export default function UploadSection({
  summary,
  unchecked,
  onPick,
  onToggle,
  disabled,
}: {
  summary: UploadSummary<PickedFile> | null;
  unchecked: ReadonlySet<string>;
  onPick: (files: PickedFile[]) => void;
  onToggle: (path: string) => void;
  disabled: boolean;
}) {
  const pick = (e: ChangeEvent<HTMLInputElement>) => onPick(toPicked(e.target.files));
  const limitMessage = summary ? describeLimitProblems(summary.problems) : "";

  return (
    <section aria-labelledby="ds-upload-title" className="flex flex-col gap-3">
      <h2 id="ds-upload-title" className="text-lg font-semibold text-foreground">
        1. 분석할 코드 올리기
      </h2>
      <p className="text-sm text-foreground-secondary">디자인 시스템 폴더(예: src/components/ui)를 선택하세요. 코드는 분석에만 쓰고 저장하지 않습니다.</p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1 text-sm text-foreground">
          폴더 선택
          <Input
            type="file"
            multiple
            disabled={disabled}
            onChange={pick}
            ref={(el) => {
              // React 타입에 없는 속성이라 직접 붙인다
              el?.setAttribute("webkitdirectory", "");
            }}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-foreground">
          파일 여러 개 선택 (폴더 선택이 안 되는 브라우저용)
          <Input type="file" multiple accept=".ts,.tsx" disabled={disabled} onChange={pick} />
        </label>
      </div>
      <p className="text-xs text-foreground-tertiary">
        .tsx(컴포넌트)와 .ts(타입을 찾는 데만 사용) 파일을 보냅니다. 한 번에 {UPLOAD_LIMITS.maxFiles}개, 파일당 {UPLOAD_LIMITS.maxFileBytes / 1024}KB, 합계 {UPLOAD_LIMITS.maxTotalBytes / (1024 * 1024)}MB까지입니다.
      </p>

      {summary && (
        <>
          <p role="status" aria-live="polite" className="text-sm font-medium text-foreground">
            전체 {summary.total}개 중 분석 대상 {summary.accepted.length}개
            {summary.selected.length !== summary.accepted.length && ` (선택 ${summary.selected.length}개)`}
          </p>

          {limitMessage && (
            <Alert variant="destructive">
              <AlertDescription>{limitMessage} 상한을 넘으면 보내지 않습니다. 체크를 해제하거나 폴더를 다시 선택하세요.</AlertDescription>
            </Alert>
          )}

          {summary.accepted.length > 0 && (
            <ul className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {summary.accepted.map((f) => (
                <li key={f.path} className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0">
                  <input
                    id={`pick-${f.path}`}
                    type="checkbox"
                    checked={!unchecked.has(f.path)}
                    disabled={disabled}
                    onChange={() => onToggle(f.path)}
                    className="size-4"
                  />
                  <label htmlFor={`pick-${f.path}`} className="min-w-0 flex-1 truncate text-foreground">
                    {f.path}
                  </label>
                  <span className="text-xs text-foreground-tertiary">{kb(f.size)}</span>
                </li>
              ))}
            </ul>
          )}

          {summary.rejected.length > 0 && (
            <details className="text-sm text-foreground-secondary">
              <summary className="cursor-pointer">제외된 파일 {summary.rejected.length}개</summary>
              <ul className="mt-1 list-disc pl-5">
                {(Object.entries(summary.rejectedByReason) as [RejectReason, number][]).map(([reason, count]) => (
                  <li key={reason}>
                    {REJECT_LABEL[reason]}: {count}개
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
