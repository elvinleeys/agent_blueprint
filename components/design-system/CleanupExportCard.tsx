"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { CLEANUP_FILE_NAME } from "@/core/prompt/cleanup-prompt";
import { COPY_MESSAGE, copyText, downloadMarkdown, type CopyResult } from "@/lib/client/copy-text";

/** 정리 지시서 미리보기·복사·.md 내려받기. 템플릿으로 만든 문서이고 어디에도 저장하지 않는다 */
export default function CleanupExportCard({ content }: { content: string }) {
  const [copy, setCopy] = useState<CopyResult | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col gap-0.5">
            정리 지시서
            <span className="text-xs font-normal text-foreground-tertiary">{CLEANUP_FILE_NAME} · 저장하지 않음</span>
          </span>
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span role="status" aria-live="polite" className={copy === "failed" ? "text-sm font-normal text-destructive" : "text-sm font-normal text-foreground-tertiary"}>
              {copy && COPY_MESSAGE[copy]}
            </span>
            <Button type="button" size="sm" onClick={async () => setCopy(await copyText(content))}>
              복사
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => downloadMarkdown(CLEANUP_FILE_NAME, content)}>
              .md 내려받기
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground-secondary">AI 에이전트(Claude Code 등)에 그대로 전달하세요. 경고 항목을 정리 대상으로, 정보 항목은 참고로 담았습니다.</p>
        <label htmlFor="cleanup-export" className="sr-only">
          정리 지시서 미리보기
        </label>
        <Textarea id="cleanup-export" readOnly rows={14} value={content} className="max-h-96 overflow-y-auto font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      </CardContent>
    </Card>
  );
}
