"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AnalyzeResult, SpecSource } from "@/core/cleanup/analyze";
import type { SourceFile } from "@/core/cleanup/types";
import type { UploadSummary } from "@/core/cleanup/upload-summary";
import { buildCleanupPrompt } from "@/core/prompt/cleanup-prompt";
import { runAnalyze, type AnalyzeFailure } from "@/lib/client/run-analyze";
import CleanupExportCard from "./CleanupExportCard";
import FileListSection from "./FileListSection";
import ResultSection from "./ResultSection";
import { useUploadList, type PickedFile, type UploadList } from "./useUploadList";

type DsMode = "files" | "json";

const readContents = (summary: UploadSummary<PickedFile>): Promise<SourceFile[]> =>
  Promise.all(summary.selected.map(async (f) => ({ path: f.path, content: await f.file.text() })));

const ready = (u: UploadList) => !!u.summary && u.summary.selected.length > 0 && u.summary.problems.length === 0;

/**
 * 디자인 시스템 정리 탭. 결과는 화면에만 두고 저장하지 않는다(탭을 벗어나면 사라진다).
 * 순서: 디자인 시스템(폴더 업로드 또는 JSON) → 검사할 코드(폴더 업로드 또는 파일 선택) → 분석 → 결과 → 정리 지시서
 */
export default function DesignSystemPanel() {
  const ds = useUploadList();
  const code = useUploadList();
  const [mode, setMode] = useState<DsMode>("files");
  const [json, setJson] = useState("");
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<AnalyzeFailure | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const dsReady = mode === "files" ? ready(ds) : json.trim() !== "";
  const canRun = !running && ready(code) && dsReady;
  const prompt = useMemo(() => (result ? buildCleanupPrompt(result) : null), [result]);

  const missing = !ready(code) ? "검사할 코드 파일을 올려 주세요." : !dsReady ? (mode === "files" ? "디자인 시스템 폴더를 올려 주세요." : "스펙 JSON을 입력하세요.") : "";

  async function run() {
    if (!code.summary || (mode === "files" && !ds.summary)) return;
    setRunning(true);
    setFailure(null);
    // 입력 내용(올린 파일·체크 상태·JSON)은 실패해도 그대로 둔다. 코드는 이 요청에만 쓰고 저장하지 않는다
    const codeFiles = await readContents(code.summary);
    const designSystem: SpecSource = mode === "files" ? { kind: "files", files: await readContents(ds.summary!) } : { kind: "json", text: json };
    const outcome = await runAnalyze(codeFiles, designSystem);
    if (outcome.ok) setResult(outcome.result);
    else {
      setResult(null);
      setFailure(outcome.failure);
    }
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-foreground-secondary">
        디자인 시스템의 공식 컴포넌트와 실제 코드를 비교해, 공식 목록에 없거나 서로 비슷한 컴포넌트를 찾고 정리 지시서를 만듭니다. 코드는 분석에만 쓰고 저장하지 않습니다.
      </p>

      <section aria-labelledby="ds-system-title" className="flex flex-col gap-3">
        <h2 id="ds-system-title" className="text-lg font-semibold text-foreground">
          1. 디자인 시스템 (공식)
        </h2>
        <div role="radiogroup" aria-label="디자인 시스템을 정하는 방법" className="flex flex-wrap gap-4 text-sm text-foreground">
          <label className="flex items-center gap-2">
            <input type="radio" name="ds-mode" checked={mode === "files"} onChange={() => setMode("files")} disabled={running} />
            폴더 업로드
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="ds-mode" checked={mode === "json"} onChange={() => setMode("json")} disabled={running} />
            스펙 JSON 붙여넣기
          </label>
        </div>
        {mode === "files" ? (
          <>
            <p className="text-sm text-foreground-secondary">디자인 시스템 폴더(예: src/components/ui)를 선택하세요. 올린 파일에서 내보낸 컴포넌트가 공식 컴포넌트가 됩니다. 다른 저장소의 폴더여도 됩니다.</p>
            <FileListSection idPrefix="ds" pickers={[{ label: "디자인 시스템 폴더 선택", directory: true }]} upload={ds} disabled={running} />
          </>
        ) : (
          <label className="flex flex-col gap-1 text-sm text-foreground">
            디자인 시스템 스펙 JSON
            <Textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder='{ "version": "1.2", "components": [...], "tokens": { "color": {...}, "spacing": {...} } }'
              disabled={running}
            />
            <span className="text-xs text-foreground-tertiary">JSON으로 받은 스펙은 파일 위치를 알 수 없어, 코드의 같은 이름 컴포넌트를 공식 구현으로 보고 &ldquo;같은 이름의 별도 구현&rdquo; 경고를 걸지 않습니다.</span>
          </label>
        )}
      </section>

      <section aria-labelledby="ds-code-title" className="flex flex-col gap-3">
        <h2 id="ds-code-title" className="text-lg font-semibold text-foreground">
          2. 검사할 코드
        </h2>
        <p className="text-sm text-foreground-secondary">정리할 코드가 있는 폴더(예: src)를 선택하거나 파일을 여러 개 선택하세요. 파일이 많으면 더 좁은 폴더(예: src/components/ui)를 선택하세요.</p>
        <FileListSection
          idPrefix="code"
          pickers={[
            { label: "폴더 선택", directory: true },
            { label: "파일 여러 개 선택 (폴더 선택이 안 되는 브라우저용)", directory: false },
          ]}
          upload={code}
          disabled={running}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={run} disabled={!canRun}>
            {running ? "분석 중…" : "분석하기"}
          </Button>
          {missing && <span className="text-xs text-foreground-tertiary">{missing}</span>}
        </div>
      </section>

      {failure && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{failure.message}</p>
            {failure.details.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {failure.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {failure.retryable && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={run} disabled={!canRun}>
                다시 시도
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {result && <ResultSection result={result} />}
      {prompt && <CleanupExportCard content={prompt} />}
    </div>
  );
}
