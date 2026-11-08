"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FIX_FILE_NAME } from "@/core/prompt/fix-prompt";
import { COPY_MESSAGE, copyText, downloadMarkdown, type CopyResult } from "@/lib/client/copy-text";

/** 수정 지시서 미리보기·복사·.md 내려받기. 템플릿으로 만든 문서이고 어디에도 저장하지 않는다 */
export default function FixPromptCard({ content }: { content: string }) {
  const [copy, setCopy] = useState<CopyResult | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col gap-0.5">
            수정 지시서
            <span className="text-xs font-normal text-foreground-tertiary">{FIX_FILE_NAME} · 저장하지 않음</span>
          </span>
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span role="status" aria-live="polite" className={copy === "failed" ? "text-sm font-normal text-destructive" : "text-sm font-normal text-foreground-tertiary"}>
              {copy && COPY_MESSAGE[copy]}
            </span>
            <Button type="button" size="sm" onClick={async () => setCopy(await copyText(content))}>
              복사
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => downloadMarkdown(FIX_FILE_NAME, content)}>
              .md 내려받기
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground-secondary">AI 에이전트(Claude Code 등)에 그대로 전달하세요. 확실한 항목과 &ldquo;수정 요청에 포함&rdquo;한 확인 필요 항목만 담았습니다. 무시한 항목은 지시서에서만 빠지고 위의 설계 준수 집계는 그대로입니다.</p>
        <label htmlFor="fix-export" className="sr-only">
          수정 지시서 미리보기
        </label>
        <Textarea id="fix-export" readOnly rows={14} value={content} className="max-h-96 overflow-y-auto font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      </CardContent>
    </Card>
  );
}
