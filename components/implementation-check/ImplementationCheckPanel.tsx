"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CONFIG_FILE } from "@/core/code-model/filter-files";
import type { SourceFile } from "@/core/cleanup/types";
import type { UploadSummary } from "@/core/cleanup/upload-summary";
import type { ConfirmedPair } from "@/core/impl-check/types";
import { checkWithAutoRemoval, runImplementationCheck, type CheckFailure, type CheckResponse } from "@/lib/client/run-implementation-check";
import FileListSection from "../design-system/FileListSection";
import { useUploadList, type PickedFile } from "../design-system/useUploadList";
import ResultView from "./ResultView";
import { designSummaryText, removedTexts } from "./result-view";
import { restoreSelection, toggleChoice, type Selection } from "./selection";

const readContents = (summary: UploadSummary<PickedFile>): Promise<SourceFile[]> => Promise.all(summary.selected.map(async (f) => ({ path: f.path, content: await f.file.text() })));

const CONFIG_NOTE = "tsconfig.json·jsconfig.json도 받으며 경로 별칭을 읽는 데만 씁니다.";

/**
 * 구현 검사 탭. 올린 파일과 검사 결과는 저장하지 않는다. 작업공간이 이 탭을 한 번 연 뒤에는 숨기기만 하므로 탭을 바꿔도 유지되고,
 * 작업공간을 떠나거나 새로고침하면 사라진다.
 * 순서: 코드 폴더 업로드(+ tsconfig) → 검사하기 → 기준 판·집계·설정 → 확실 → 확인 필요(짝짓기·포함·무시) → 수정 지시서
 */
export default function ImplementationCheckPanel({ projectId, onGoStructure }: { projectId: string; onGoStructure: () => void }) {
  const upload = useUploadList({ allowConfigFiles: true });
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<CheckFailure | null>(null);
  const [data, setData] = useState<CheckResponse | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedPair[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>({});
  const [stale, setStale] = useState(false);
  const hasResult = useRef(false);

  const summary = upload.summary;
  const codeCount = summary ? summary.selected.filter((f) => !CONFIG_FILE.test(f.path)).length : 0;
  const canRun = !running && !!summary && codeCount > 0 && summary.problems.length === 0;

  // 결과를 받은 뒤 올린 파일 목록이 바뀌면 이전 결과가 지금 파일과 다를 수 있다
  useEffect(() => {
    if (hasResult.current) setStale(true);
  }, [summary]);

  const nameOf = (nodeId: string) => data?.result.items.find((i) => i.nodeId === nodeId)?.nodeName ?? nodeId;

  async function run(conf: ConfirmedPair[]) {
    if (!summary) return;
    setRunning(true);
    setFailure(null);
    try {
      // 코드는 이 요청에만 쓰고 저장하지 않는다. 실패해도 올린 파일·선택은 그대로 둔다
      let codeFiles: SourceFile[];
      try {
        codeFiles = await readContents(summary);
      } catch {
        setFailure({ message: "파일을 읽지 못했습니다. 목록에서 지우고 다시 선택해 주세요.", details: [], retryable: false });
        return;
      }
      const r = await checkWithAutoRemoval((c) => runImplementationCheck(projectId, codeFiles, c), conf);
      setConfirmed(r.confirmed);
      setRemoved(removedTexts(r.removed, nameOf));
      if (r.outcome.ok) {
        const next = r.outcome.data;
        hasResult.current = true;
        setData(next);
        setStale(false);
        // 같은 카드 id의 선택은 유지, 새 카드는 선택 안 함, 사라진 카드의 선택은 지움
        setSelection((prev) => restoreSelection(prev, next.result.findings.filter((f) => f.certainty === "review").map((f) => f.id)));
      } else {
        setFailure(r.outcome.failure);
      }
    } finally {
      setRunning(false);
    }
  }

  const confirmPair = (nodeId: string, path: string, name: string) => run([...confirmed.filter((c) => c.nodeId !== nodeId), { nodeId, path, name }]);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-foreground-secondary">
        에이전트가 지시서대로 만든 코드가 설계도를 지켰는지 확인합니다. 저장된 설계도의 최신 판(지시서를 내보낸 판이 있으면 그 판)을 기준으로 비교하므로, 설계도를 먼저 만들어 두어야 합니다. 코드는 검사에만 쓰고 저장하지 않으며, 이 탭의 파일과 결과는 작업공간을 떠나거나 새로고침하면 사라집니다.
      </p>

      <section aria-labelledby="ic-code-title" className="flex flex-col gap-3">
        <h2 id="ic-code-title" className="text-lg font-semibold text-foreground">
          1. 검사할 코드
        </h2>
        <p className="text-sm text-foreground-secondary">구현한 코드가 있는 폴더(예: src)를 선택하세요. 파일이 많으면 더 좁은 폴더를 선택하세요. 폴더 선택이 안 되는 브라우저에서는 파일을 여러 개 선택하세요. tsconfig.json·jsconfig.json도 함께 선택하면 <code>@/</code> 같은 경로 별칭을 따라가고, 없으면 별칭으로 가져온 import는 &ldquo;확인 필요&rdquo;로 남습니다.</p>
        <FileListSection
          idPrefix="ic-code"
          title="검사할 코드"
          pickers={[
            { label: "폴더 선택", directory: true },
            { label: "파일 선택", directory: false },
          ]}
          upload={upload}
          disabled={running}
          configFilesNote={CONFIG_NOTE}
          sourceNote=".tsx(컴포넌트)와 .ts(훅 등) 파일을 보냅니다."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => run(confirmed)} disabled={!canRun}>
            {running ? "검사 중…" : data ? "다시 검사하기" : "검사하기"}
          </Button>
          {!canRun && !running && <span className="text-xs text-foreground-tertiary">{!summary || codeCount === 0 ? "검사할 .ts·.tsx 파일을 올려 주세요." : "상한을 넘었습니다. 체크를 해제하거나 파일을 지워 주세요."}</span>}
          {/* 진행·완료를 낭독기에도 알린다(확정 짝을 바꿔 자동으로 다시 검사할 때도 같은 영역을 쓴다) */}
          <span role="status" aria-live="polite" className="text-xs text-foreground-tertiary">
            {running ? "검사 중입니다." : failure && data ? "검사하지 못했습니다. 아래 결과는 이전 검사의 것입니다." : data && !stale ? `검사를 마쳤습니다. ${designSummaryText(data.result.summary)}` : ""}
          </span>
        </div>
      </section>

      {failure && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{failure.message}</p>
            {failure.code === "no_blueprint" && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onGoStructure}>
                구조 설계로 이동
              </Button>
            )}
            {failure.details.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {failure.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {failure.retryable && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => run(confirmed)} disabled={!canRun}>
                다시 시도
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {removed.length > 0 && (
        <Alert>
          <AlertDescription>
            <p>코드나 설계도가 바뀌어 더 유효하지 않은 확정 짝 {removed.length}개를 빼고 다시 검사했습니다. 아래 결과는 다시 검사한 것이고, 빠진 노드는 &ldquo;확인 필요&rdquo;에 다시 나타났을 수 있으니 필요하면 다시 짝지어 주세요.</p>
            <ul className="mt-1 list-disc break-words pl-5">
              {removed.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <ResultView
          data={data}
          confirmed={confirmed}
          selection={selection}
          running={running}
          stale={stale}
          nameOf={nameOf}
          onChoice={(id, c) => setSelection((prev) => toggleChoice(prev, id, c))}
          onConfirm={confirmPair}
          onCancelConfirm={(nodeId) => run(confirmed.filter((x) => x.nodeId !== nodeId))}
        />
      )}
    </div>
  );
}
