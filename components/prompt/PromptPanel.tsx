"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { postExport, runExport, type ExportData, type ExportFailure } from "@/lib/client/run-export";
import { ConfirmDialog } from "../structure/edit/ConfirmDialog";
import { useSaveQueue } from "../structure/SaveQueueProvider";
import { useStructureApi, useStructureStore } from "../structure/StructureStoreProvider";
import { useViolations, ViolationsProvider } from "../structure/ViolationsProvider";
import { COMMON_RULES_NOTE, errorConfirmDescription, isValidRoute, NO_BLUEPRINT_NOTE, ROUTE_ERROR, ROUTE_HELP, RULES_FOLDER_NOTE, SKIP_NOTE, SPEC_EMPTY_WARNING, unresolvedErrors } from "./export-notes";
import ExportDocumentCard, { TITLE } from "./ExportDocumentCard";

type Result = { data: ExportData; editRevision: number };

function Body({ projectId, onGoStructure }: { projectId: string; onGoStructure: () => void }) {
  const queue = useSaveQueue();
  const api = useStructureApi();
  const blueprint = useStructureStore((s) => s.blueprint);
  const route = useStructureStore((s) => s.route);
  const setRoute = useStructureStore((s) => s.setRoute);
  const editRevision = useStructureStore((s) => s.editRevision);
  const drafting = useStructureStore((s) => s.status === "resizing" || s.status === "running");
  const { violations } = useViolations();

  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const trimmed = route.trim();
  const routeInvalid = !isValidRoute(trimmed);
  const errors = unresolvedErrors(violations);

  async function doExport() {
    setRunning(true);
    setFailure(null);
    // 보내지 않은 수정을 모두 저장한 뒤에만 서버에 요청한다(runExport가 순서를 지킨다)
    const outcome = await runExport({ drain: () => queue.drain(), post: () => postExport(projectId, trimmed || null) });
    // 끝난 시점의 편집 번호를 적어 둔다(그 뒤에 편집하면 결과가 오래된 것이라고 알린다)
    if (outcome.kind === "done") setResult({ data: outcome.data, editRevision: api.getState().editRevision });
    else setFailure(outcome);
    setRunning(false);
  }

  function requestExport() {
    if (running || drafting || routeInvalid) return;
    if (errors.length > 0) setConfirmOpen(true);
    else void doExport();
  }

  if (!blueprint) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg bg-section p-6">
        <p className="text-sm text-foreground-secondary">{NO_BLUEPRINT_NOTE}</p>
        <Button type="button" variant="outline" onClick={onGoStructure}>
          구조 설계 탭으로 이동
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>내보내기</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">원본</legend>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="radio" name="export-source" checked readOnly />
              설계도 (최신 판)
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground-quaternary">
              <input type="radio" name="export-source" disabled />
              디자인 시스템 정리 계획 (준비 중)
            </label>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor="export-route" className="text-sm font-medium text-foreground">
              화면 주소
            </label>
            <Input id="export-route" value={route} disabled={running} onChange={(e) => setRoute(e.target.value)} aria-invalid={routeInvalid} aria-describedby="export-route-help" />
            <p id="export-route-help" className={routeInvalid ? "text-xs text-destructive" : "text-xs text-foreground-tertiary"}>
              {routeInvalid ? ROUTE_ERROR : ROUTE_HELP[blueprint.stack.framework]}
            </p>
          </div>

          <div className="flex flex-col gap-1 text-sm text-foreground-secondary">
            <p>{RULES_FOLDER_NOTE}</p>
            <p>{COMMON_RULES_NOTE}</p>
            <p>{SKIP_NOTE}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={requestExport} disabled={running || drafting || routeInvalid}>
              {running ? "만드는 중…" : "내보내기"}
            </Button>
            {drafting && <span className="text-sm text-foreground-tertiary">초안을 만드는 동안에는 내보낼 수 없습니다.</span>}
          </div>

          {failure && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && (
        <div className="flex flex-col gap-4">
          {result.data.specEmpty && (
            <Alert role="status">
              <AlertDescription>{SPEC_EMPTY_WARNING}</AlertDescription>
            </Alert>
          )}
          {result.editRevision !== editRevision && (
            <Alert role="status">
              <AlertDescription>내보낸 뒤 설계도가 바뀌었습니다. 아래 내용은 이전 설계도 기준입니다. 다시 내보내 주세요.</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-foreground-secondary">설계도 {result.data.revision}판 기준으로 만들었습니다.</p>
          {/* 두 문서를 위아래로 쌓지 않고 탭으로 전환한다 */}
          <Tabs defaultValue={result.data.documents[0]?.format}>
            <TabsList>
              {result.data.documents.map((doc) => (
                <TabsTrigger key={doc.format} value={doc.format}>
                  {TITLE[doc.format]}
                </TabsTrigger>
              ))}
            </TabsList>
            {result.data.documents.map((doc) => (
              <TabsContent key={doc.format} value={doc.format} className="mt-4">
                <ExportDocumentCard doc={doc} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="미해결 오류가 있습니다"
        description={errorConfirmDescription(errors)}
        confirmLabel="그대로 내보내기"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void doExport();
        }}
      />
    </div>
  );
}

/** 작업공간의 스토어·저장 큐를 쓰기만 한다(탭을 바꿔도 유지). 설계도 위반은 이 탭에서도 같은 규칙으로 계산한다 */
export default function PromptPanel({ projectId, onGoStructure }: { projectId: string; onGoStructure: () => void }) {
  return (
    <ViolationsProvider>
      <Body projectId={projectId} onGoStructure={onGoStructure} />
    </ViolationsProvider>
  );
}
