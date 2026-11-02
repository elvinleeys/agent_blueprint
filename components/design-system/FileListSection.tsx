"use client";

import { useRef, type ChangeEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeLimitProblems, UPLOAD_LIMITS, type RejectReason } from "@/core/cleanup/filter-files";
import { pickedLabel } from "@/core/cleanup/picked-files";
import { REJECT_LABEL } from "@/core/cleanup/upload-summary";
import { toPicked, type UploadList } from "./useUploadList";

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`;

export type Picker = { label: string; directory: boolean };

/** 선택 버튼 하나. 브라우저 기본 파일 입력("선택한 파일 없음" 문구 포함)은 숨기고 버튼 부품으로 대신 연다(구조 설계 탭의 이미지 선택과 같은 방식) */
function PickerButton({ picker, ariaLabel, disabled, onFiles }: { picker: Picker; ariaLabel: string; disabled: boolean; onFiles: (e: ChangeEvent<HTMLInputElement>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={(el) => {
          inputRef.current = el;
          // React 타입에 없는 속성이라 직접 붙인다
          if (picker.directory) el?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        accept={picker.directory ? undefined : ".ts,.tsx"}
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={onFiles}
      />
      <Button type="button" size="sm" variant="outline" disabled={disabled} aria-label={ariaLabel} onClick={() => inputRef.current?.click()}>
        {picker.label}
      </Button>
    </>
  );
}

/**
 * 파일을 모으는 칸 하나(디자인 시스템 칸, 검사할 코드 칸 공용).
 * 선택할 때마다 목록에 추가되고, 파일별 삭제·모두 지우기·이번 분석에서만 빼는 체크를 제공한다.
 */
export default function FileListSection({
  idPrefix,
  title,
  pickers,
  upload,
  disabled,
}: {
  idPrefix: string;
  /** 접근성 이름에 쓰는 칸 이름(예: "디자인 시스템") */
  title: string;
  pickers: Picker[];
  upload: UploadList;
  disabled: boolean;
}) {
  const { summary, unchecked, list, notice } = upload;
  const limitMessage = summary ? describeLimitProblems(summary.problems) : "";

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    upload.add(toPicked(e.target.files));
    e.target.value = ""; // 같은 폴더를 다시 골라도 변경으로 인식되게 한다
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {pickers.map((p) => (
          <PickerButton key={p.label} picker={p} ariaLabel={`${p.label} (${title})`} disabled={disabled} onFiles={pick} />
        ))}
        {/* 브라우저 기본 문구 대신 실제 목록 상태를 보인다 */}
        <span role="status" aria-live="polite" className="text-sm text-foreground-secondary">
          {list.length > 0 ? `${list.length}개 선택됨` : "아직 선택한 파일이 없습니다"}
        </span>
      </div>
      {notice && (
        <p role="status" aria-live="polite" className="text-sm text-foreground-secondary">
          {notice}
        </p>
      )}
      <p className="text-xs text-foreground-tertiary">
        .tsx(컴포넌트)와 .ts(타입을 찾는 데만 사용) 파일을 보냅니다. 선택할 때마다 목록에 추가되며, 한 칸에 {UPLOAD_LIMITS.maxFiles}개, 파일당 {UPLOAD_LIMITS.maxFileBytes / 1024}KB, 합계 {UPLOAD_LIMITS.maxTotalBytes / (1024 * 1024)}MB까지입니다.
      </p>

      {summary && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              전체 {summary.total}개 중 분석 대상 {summary.accepted.length}개
              {summary.selected.length !== summary.accepted.length && ` (선택 ${summary.selected.length}개)`}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={upload.clear} disabled={disabled}>
              모두 지우기
            </Button>
          </div>

          {limitMessage && (
            <Alert variant="destructive">
              <AlertDescription>{limitMessage} 상한을 넘으면 보내지 않습니다. 체크를 해제하거나 파일을 지우세요.</AlertDescription>
            </Alert>
          )}

          {summary.accepted.length > 0 && (
            <ul className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {summary.accepted.map((f) => (
                <li key={f.path} className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0">
                  <input
                    id={`${idPrefix}-pick-${f.path}`}
                    type="checkbox"
                    checked={!unchecked.has(f.path)}
                    disabled={disabled}
                    onChange={() => upload.toggle(f.path)}
                    className="size-4"
                  />
                  <label htmlFor={`${idPrefix}-pick-${f.path}`} className="min-w-0 flex-1 truncate text-foreground">
                    {pickedLabel(f)}
                  </label>
                  <span className="text-xs text-foreground-tertiary">{kb(f.size)}</span>
                  <Button type="button" variant="ghost" size="xs" onClick={() => upload.remove(f.path)} disabled={disabled} aria-label={`${pickedLabel(f)} 삭제`}>
                    삭제
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-foreground-tertiary">체크를 해제하면 이번 분석에서만 빠지고 목록에는 남습니다. 삭제하면 목록에서 지웁니다.</p>

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
    </div>
  );
}
