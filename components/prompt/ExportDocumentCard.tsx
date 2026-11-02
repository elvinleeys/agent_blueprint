"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { COPY_MESSAGE, copyText, downloadMarkdown, type CopyResult } from "@/lib/client/copy-text";
import type { ExportDocument } from "@/lib/client/run-export";
import { DOCUMENT_HINT } from "./export-notes";

const TITLE = { claude_md: "화면 규칙 파일", prompt: "지시서" } as const;

/** 문서 하나: 미리보기(직접 선택할 수 있는 읽기 전용 칸), 복사, .md 내려받기. 복사·내려받기는 몇 번이든 된다 */
export default function ExportDocumentCard({ doc }: { doc: ExportDocument }) {
  const [copy, setCopy] = useState<CopyResult | null>(null);
  const inputId = `export-${doc.format}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          {TITLE[doc.format]}
          <span className="text-xs font-normal text-foreground-tertiary">
            {doc.fileName} · {doc.recorded ? "기록 저장됨" : "같은 내용이라 기록은 건너뜀"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground-secondary">{DOCUMENT_HINT[doc.format]}</p>
        <label htmlFor={inputId} className="sr-only">
          {TITLE[doc.format]} 미리보기
        </label>
        <Textarea id={inputId} readOnly rows={14} value={doc.content} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={async () => setCopy(await copyText(doc.content))}>
            복사
          </Button>
          <Button type="button" variant="outline" onClick={() => downloadMarkdown(doc.fileName, doc.content)}>
            .md 내려받기
          </Button>
          <span role="status" aria-live="polite" className={copy === "failed" ? "text-sm text-destructive" : "text-sm text-foreground-tertiary"}>
            {copy && COPY_MESSAGE[copy]}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
