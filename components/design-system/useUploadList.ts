"use client";

import { useMemo, useState } from "react";
import { addPicked, removePicked, type PickedMeta } from "@/core/cleanup/picked-files";
import { summarizeUpload } from "@/core/cleanup/upload-summary";

export type PickedFile = PickedMeta & { file: File };

/**
 * 파일 선택 결과를 목록 항목으로 바꾼다.
 * 폴더 선택은 webkitRelativePath("선택한폴더/하위/A.tsx")로 경로를 알 수 있고, 파일 여러 개 선택은 이름만 알 수 있다.
 * 폴더 선택을 지원하지 않는 브라우저는 경로를 주지 않으므로 파일 선택과 같게 다룬다.
 */
export function toPicked(files: FileList | null): PickedFile[] {
  return Array.from(files ?? []).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return { path: rel || file.name, name: file.name, size: file.size, lastModified: file.lastModified, hasPath: !!rel, ordinal: 1, file };
  });
}

/** 업로드 칸 하나의 상태: 선택할 때마다 추가, 파일별 삭제, 모두 지우기, 이번 분석에서만 빼는 체크 */
export function useUploadList() {
  const [list, setList] = useState<PickedFile[]>([]);
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const summary = useMemo(() => (list.length ? summarizeUpload(list, unchecked) : null), [list, unchecked]);

  return {
    list,
    unchecked,
    summary,
    add: (files: PickedFile[]) => setList((prev) => addPicked(prev, files)),
    remove: (path: string) => {
      setList((prev) => removePicked(prev, path));
      setUnchecked((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    },
    clear: () => {
      setList([]);
      setUnchecked(new Set());
    },
    toggle: (path: string) =>
      setUnchecked((prev) => {
        const next = new Set(prev);
        if (!next.delete(path)) next.add(path);
        return next;
      }),
  };
}

export type UploadList = ReturnType<typeof useUploadList>;
