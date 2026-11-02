"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AnalyzeResult, SpecSource } from "@/core/cleanup/analyze";
import { summarizeUpload } from "@/core/cleanup/upload-summary";
import { buildCleanupPrompt } from "@/core/prompt/cleanup-prompt";
import { runAnalyze, type AnalyzeFailure } from "@/lib/client/run-analyze";
import CleanupExportCard from "./CleanupExportCard";
import ResultSection from "./ResultSection";
import UploadSection, { type PickedFile } from "./UploadSection";

type SpecMode = "folder" | "json";

/**
 * 디자인 시스템 정리 탭. 결과는 화면에만 두고 저장하지 않는다(탭을 벗어나면 사라진다).
 * 순서: 코드 올리기(거르기·체크) → 스펙 얻는 방법 → 분석 → 결과 → 정리 지시서
 */
export default function DesignSystemPanel() {
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState<SpecMode>("folder");
  const [folder, setFolder] = useState("");
  const [json, setJson] = useState("");
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<AnalyzeFailure | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const summary = useMemo(() => (picked.length ? summarizeUpload(picked, unchecked) : null), [picked, unchecked]);
  const specReady = mode === "folder" ? folder.trim() !== "" : json.trim() !== "";
  const canRun = !running && !!summary && summary.selected.length > 0 && summary.problems.length === 0 && specReady;
  const prompt = useMemo(() => (result ? buildCleanupPrompt(result) : null), [result]);

  function onPick(files: PickedFile[]) {
    setPicked(files);
    setUnchecked(new Set());
    setResult(null);
    setFailure(null);
  }

  function onToggle(path: string) {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  async function run() {
    if (!summary) return;
    setRunning(true);
    setFailure(null);
    // 입력 내용(스펙·체크 상태)은 실패해도 그대로 둔다. 코드는 이 요청에만 쓰고 저장하지 않는다
    const files = await Promise.all(summary.selected.map(async (f) => ({ path: f.path, content: await f.file.text() })));
    const spec: SpecSource = mode === "folder" ? { kind: "folder", folder: folder.trim() } : { kind: "json", text: json };
    const outcome = await runAnalyze(files, spec);
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
        디자인 시스템의 공식 컴포넌트와 실제 코드를 비교해, 공식 목록에 없거나 서로 비슷한 컴포넌트를 찾고 정리 지시서를 만듭니다.
      </p>

      <UploadSection summary={summary} unchecked={unchecked} onPick={onPick} onToggle={onToggle} disabled={running} />

      <section aria-labelledby="ds-spec-title" className="flex flex-col gap-3">
        <h2 id="ds-spec-title" className="text-lg font-semibold text-foreground">
          2. 공식 디자인 시스템 정하기
        </h2>
        <div role="radiogroup" aria-label="스펙을 얻는 방법" className="flex flex-wrap gap-4 text-sm text-foreground">
          <label className="flex items-center gap-2">
            <input type="radio" name="spec-mode" checked={mode === "folder"} onChange={() => setMode("folder")} disabled={running} />
            디자인 시스템 폴더로 만들기
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="spec-mode" checked={mode === "json"} onChange={() => setMode("json")} disabled={running} />
            스펙 JSON 직접 입력
          </label>
        </div>

        {mode === "folder" ? (
          <label className="flex flex-col gap-1 text-sm text-foreground">
            디자인 시스템 폴더 경로
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="src/components/ui" disabled={running} />
            <span className="text-xs text-foreground-tertiary">올린 파일 경로 안에서 이 폴더의 내보낸 컴포넌트가 공식 컴포넌트가 됩니다. 이 폴더 안의 컴포넌트는 비교 대상에서 빠집니다.</span>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm text-foreground">
            디자인 시스템 스펙 JSON
            <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={8} className="font-mono text-xs" placeholder='{ "version": "1.2", "components": [...], "tokens": { "color": {...}, "spacing": {...} } }' disabled={running} />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={run} disabled={!canRun}>
            {running ? "분석 중…" : "분석하기"}
          </Button>
          {!specReady && <span className="text-xs text-foreground-tertiary">{mode === "folder" ? "디자인 시스템 폴더 경로를 입력하세요." : "스펙 JSON을 입력하세요."}</span>}
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
