"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseRepoUrl, parseSubdir } from "@/core/code-source/github-url";
import { CONFIG_FILE } from "@/core/code-model/filter-files";
import type { SourceFile } from "@/core/cleanup/types";
import type { UploadSummary } from "@/core/cleanup/upload-summary";
import type { ConfirmedPair } from "@/core/impl-check/types";
import { checkWithAutoRemoval, runImplementationCheck, type CheckFailure, type CheckResponse, type RepoInput } from "@/lib/client/run-implementation-check";
import FileListSection from "../design-system/FileListSection";
import { useUploadList, type PickedFile } from "../design-system/useUploadList";
import ResultView from "./ResultView";
import { designSummaryText, removedTexts } from "./result-view";
import { restoreSelection, toggleIncluded, type Selection } from "./selection";

const readContents = (summary: UploadSummary<PickedFile>): Promise<SourceFile[]> => Promise.all(summary.selected.map(async (f) => ({ path: f.path, content: await f.file.text() })));

/** 허용되지 않은 사용자에게 입력칸 대신 보이는 안내(서버의 403 문구와 같은 뜻) */
export const REPO_RESTRICTED_TEXT = "GitHub 저장소 검사는 현재 제한된 기능으로, 허용된 계정에서만 쓸 수 있습니다. 코드 폴더를 올려 검사해 주세요.";

type CodeMode = "upload" | "repo";

/** GitHub 저장소 입력칸(허용된 사용자만 고를 수 있다. 허용되지 않으면 패널이 고르기 전부터 안내를 보인다) */
export function RepoSource(p: { url: string; subdir: string; onUrl: (v: string) => void; onSubdir: (v: string) => void; urlError: string | null; subdirError: string | null; disabled: boolean }) {
  const described = (errorId: string, error: string | null) => (error ? `${errorId} ic-repo-hint` : "ic-repo-hint");
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <p className="text-sm text-foreground-secondary">공개 저장소만 검사할 수 있습니다. 서버가 저장소를 받아 설계도의 파일 위치에 있는 코드와 그 코드가 가져오는 파일만 골라 검사하고, 받은 코드는 저장하지 않습니다.</p>
      <label htmlFor="ic-repo-url" className="text-sm font-medium text-foreground">
        저장소 주소 <span className="font-normal text-foreground-tertiary">(필수)</span>
      </label>
      <Input id="ic-repo-url" value={p.url} onChange={(e) => p.onUrl(e.target.value)} placeholder="https://github.com/owner/repo" inputMode="url" autoComplete="off" disabled={p.disabled} aria-invalid={p.urlError !== null} aria-describedby={described("ic-repo-url-error", p.urlError)} />
      {p.urlError && (
        <p id="ic-repo-url-error" role="alert" className="text-xs text-destructive">
          {p.urlError}
        </p>
      )}
      <label htmlFor="ic-repo-subdir" className="text-sm font-medium text-foreground">
        하위 폴더 <span className="font-normal text-foreground-tertiary">(선택)</span>
      </label>
      <Input id="ic-repo-subdir" value={p.subdir} onChange={(e) => p.onSubdir(e.target.value)} placeholder="apps/web" autoComplete="off" disabled={p.disabled} aria-invalid={p.subdirError !== null} aria-describedby={described("ic-repo-subdir-error", p.subdirError)} />
      {p.subdirError && (
        <p id="ic-repo-subdir-error" role="alert" className="text-xs text-destructive">
          {p.subdirError}
        </p>
      )}
      <p id="ic-repo-hint" className="text-xs text-foreground-tertiary">
        브랜치는 주소 끝에 /tree/브랜치 이름을 붙이세요. 저장소가 크면 하위 폴더로 범위를 좁히세요.
      </p>
    </div>
  );
}

const CONFIG_NOTE = "폴더 선택을 권장합니다. 파일 선택으로 올린 tsconfig.json·jsconfig.json은 어느 폴더의 설정인지 알 수 없어 프로젝트 맨 위 설정으로 간주하고, 이때 별칭(@/…) import는 확인 필요로 남기 쉽습니다. json 파일은 이 두 설정 파일만 씁니다.";

/**
 * 구현 검사 탭. 올린 파일과 검사 결과는 저장하지 않는다. 작업공간이 이 탭을 한 번 연 뒤에는 숨기기만 하므로 탭을 바꿔도 유지되고,
 * 작업공간을 떠나거나 새로고침하면 사라진다.
 * 순서: 코드 폴더 업로드(+ tsconfig) → 검사하기 → 기준 판·집계·설정 → 확실 → 확인 필요(짝짓기·수정 요청에 포함 체크) → 수정 지시서
 */
export default function ImplementationCheckPanel({ projectId, onGoStructure, repoCheckAllowed = false }: { projectId: string; onGoStructure: () => void; /** 서버 컴포넌트가 core/auth/feature-access로 판단해 내려 준다(서버도 같은 판단으로 403) */ repoCheckAllowed?: boolean }) {
  const upload = useUploadList({ allowConfigFiles: true });
  const [mode, setMode] = useState<CodeMode>("upload");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoSubdir, setRepoSubdir] = useState("");
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<CheckFailure | null>(null);
  const [data, setData] = useState<CheckResponse | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedPair[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>(() => new Set());
  const [stale, setStale] = useState(false);
  const hasResult = useRef(false);

  const summary = upload.summary;
  const codeCount = summary ? summary.selected.filter((f) => !CONFIG_FILE.test(f.path)).length : 0;
  // 저장소 주소·하위 폴더는 서버와 같은 함수로 칸마다 미리 검사한다(서버도 다시 검사)
  const urlCheck = repoUrl.trim() ? parseRepoUrl(repoUrl) : null;
  const subdirCheck = parseSubdir(repoSubdir);
  const canRun = !running && (mode === "upload" ? !!summary && codeCount > 0 && summary.problems.length === 0 : repoCheckAllowed && !!urlCheck?.ok && subdirCheck.ok);

  // 결과를 받은 뒤 올린 파일 목록·입력 방식·저장소 주소가 바뀌면 이전 결과가 지금 코드와 다를 수 있다
  useEffect(() => {
    if (hasResult.current) setStale(true);
  }, [summary, mode, repoUrl, repoSubdir]);

  const nameOf = (nodeId: string) => data?.result.items.find((i) => i.nodeId === nodeId)?.nodeName ?? nodeId;

  /** sameCommit: 짝 확정·취소로 다시 검사할 때는 첫 결과와 같은 커밋을 받는다("다시 검사하기"는 브랜치의 최신 커밋) */
  async function run(conf: ConfirmedPair[], sameCommit = false) {
    if (mode === "upload" && !summary) return;
    setRunning(true);
    setFailure(null);
    try {
      // 코드는 이 요청에만 쓰고 저장하지 않는다. 실패해도 올린 파일·선택·입력한 주소는 그대로 둔다
      let code: SourceFile[] | RepoInput;
      if (mode === "repo") {
        const commit = sameCommit && !stale ? data?.repo?.commit : null;
        code = { url: repoUrl.trim(), subdir: repoSubdir.trim() || null, ...(commit ? { commit } : {}) };
      } else {
        try {
          code = await readContents(summary!);
        } catch {
          setFailure({ message: "파일을 읽지 못했습니다. 목록에서 지우고 다시 선택해 주세요.", details: [], retryable: false });
          return;
        }
      }
      const r = await checkWithAutoRemoval((c) => runImplementationCheck(projectId, code, c), conf);
      setConfirmed(r.confirmed);
      setRemoved(removedTexts(r.removed, nameOf));
      if (r.outcome.ok) {
        const next = r.outcome.data;
        hasResult.current = true;
        setData(next);
        setStale(false);
        // 같은 카드 id의 체크는 유지, 새 카드는 체크 안 함, 사라진 카드의 체크는 지움
        setSelection((prev) => restoreSelection(prev, next.result.findings.filter((f) => f.certainty === "review").map((f) => f.id)));
      } else {
        setFailure(r.outcome.failure);
      }
    } finally {
      setRunning(false);
    }
  }

  const confirmPair = (nodeId: string, path: string, name: string) => run([...confirmed.filter((c) => c.nodeId !== nodeId), { nodeId, path, name }], true);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-foreground-secondary">
        에이전트가 지시서대로 만든 코드가 설계도를 지켰는지 확인합니다. 저장된 설계도의 최신 판(지시서를 내보낸 판이 있으면 그 판)을 기준으로 비교하므로, 설계도를 먼저 만들어 두어야 합니다. 코드는 검사에만 쓰고 저장하지 않으며, 이 탭의 파일과 결과는 작업공간을 떠나거나 새로고침하면 사라집니다.
      </p>

      <section aria-labelledby="ic-code-title" className="flex flex-col gap-3">
        <h2 id="ic-code-title" className="text-lg font-semibold text-foreground">
          1. 검사할 코드
        </h2>
        <div role="radiogroup" aria-label="검사할 코드를 가져오는 방법" className="flex flex-wrap gap-4 text-sm text-foreground">
          <label className="flex items-center gap-2">
            <input type="radio" name="ic-mode" checked={mode === "upload"} onChange={() => setMode("upload")} disabled={running} />
            폴더 올리기
          </label>
          <label className={`flex items-center gap-2 ${repoCheckAllowed ? "" : "text-foreground-tertiary"}`}>
            <input type="radio" name="ic-mode" checked={mode === "repo"} onChange={() => setMode("repo")} disabled={running || !repoCheckAllowed} aria-describedby={repoCheckAllowed ? undefined : "ic-repo-restricted"} />
            GitHub 저장소{repoCheckAllowed ? "" : " (제한됨)"}
          </label>
        </div>
        {/* 허용되지 않은 사용자(기능 꺼짐·허용 목록 밖)에게는 고르기 전부터 안내를 보인다 */}
        {!repoCheckAllowed && (
          <p id="ic-repo-restricted" className="text-sm text-foreground-secondary">
            {REPO_RESTRICTED_TEXT}
          </p>
        )}
        {mode === "upload" ? (
          <>
            <p className="text-sm text-foreground-secondary">구현한 코드가 있는 폴더(예: src)를 선택하세요. 파일이 많으면 더 좁은 폴더를 선택하세요. 폴더 선택이 안 되는 브라우저에서는 파일을 여러 개 선택하세요. tsconfig.json·jsconfig.json도 함께 선택하면 <code>@/</code> 같은 경로 별칭을 따라갑니다.</p>
            <FileListSection
              idPrefix="ic-code"
              title="검사할 코드"
              pickers={[
                { label: "폴더 선택", directory: true },
                { label: "파일 선택", directory: false, accept: ".ts,.tsx,.json" },
              ]}
              upload={upload}
              disabled={running}
              configFilesNote={CONFIG_NOTE}
              sourceNote=".tsx(컴포넌트)와 .ts(훅 등) 파일을 보냅니다."
              scrollList={false}
            />
          </>
        ) : (
          <RepoSource
            url={repoUrl}
            subdir={repoSubdir}
            onUrl={setRepoUrl}
            onSubdir={setRepoSubdir}
            urlError={urlCheck !== null && !urlCheck.ok ? urlCheck.message : null}
            subdirError={subdirCheck.ok ? null : subdirCheck.message}
            disabled={running}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => run(confirmed)} disabled={!canRun}>
            {running ? "검사 중…" : data ? "다시 검사하기" : "검사하기"}
          </Button>
          {!canRun && !running && (
            <span className="text-xs text-foreground-tertiary">
              {mode === "repo" ? "공개 저장소 주소를 넣어 주세요." :!summary || codeCount === 0 ? "검사할 .ts·.tsx 파일을 올려 주세요." : "상한을 넘었습니다. 체크를 해제하거나 파일을 지워 주세요."}
            </span>
          )}
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
          onToggle={(id) => setSelection((prev) => toggleIncluded(prev, id))}
          onConfirm={confirmPair}
          onCancelConfirm={(nodeId) => run(confirmed.filter((x) => x.nodeId !== nodeId), true)}
        />
      )}
    </div>
  );
}
