"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { StructureView } from "../../store/structure-store";
import CheckDock from "./CheckDock";
import DraftError from "./DraftError";
import DraftProgress from "./DraftProgress";
import { ConfirmDialog } from "./edit/ConfirmDialog";
import { generateDraft } from "./generate";
import NodeEditPanel from "./NodeEditPanel";
import NormalizedList from "./NormalizedList";
import PreviewCanvas from "./PreviewCanvas";
import { regenerateDescription, regenerateReasons, type RegenerateReason } from "./regenerate-confirm";
import SaveStatus from "./SaveStatus";
import { useSaveQueue } from "./SaveQueueProvider";
import SpecForm from "./SpecForm";
import { useStructureApi, useStructureStore } from "./StructureStoreProvider";
import TreeView from "./TreeViewLoader";
import { ViolationsProvider } from "./ViolationsProvider";

// 큰 화면에서 카드 본문이 남은 높이 안에서 스크롤되게 한다
const SCROLL = "lg:min-h-0 lg:flex-1 lg:overflow-y-auto";

function Layout({ projectId, loadError }: { projectId: string; loadError: string | null }) {
  const api = useStructureApi();
  const blueprint = useStructureStore((s) => s.blueprint);
  const view = useStructureStore((s) => s.view);
  const setView = useStructureStore((s) => s.setView);
  // 설계도가 이미 있으면 스펙 입력은 처음부터 접어 둔다(없으면 입력이 첫 일이라 펼침)
  const [inputOpen, setInputOpen] = useState(() => api.getState().blueprint === null);

  const queue = useSaveQueue();
  const [confirmReasons, setConfirmReasons] = useState<RegenerateReason[] | null>(null);

  // 저장되지 않은 수정이 있거나 현재 설계도가 사용자가 고친 것이면 새 초안으로 바꾸기 전에 확인한다(조건은 regenerateReasons).
  // 생성 순서(편집 막기 → 저장 정리 → 생성)와 어떤 오류든 입력이 남는 규칙은 generateDraft가 맡는다
  const generate = () => void generateDraft({ store: api, projectId, queue });
  function requestGenerate() {
    const s = api.getState();
    if (s.status === "resizing" || s.status === "running") return;
    const reasons = regenerateReasons(s);
    if (reasons.length > 0) setConfirmReasons(reasons);
    else generate();
  }

  return (
    <div className="flex flex-1 flex-col gap-3 lg:min-h-0">
      {loadError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* 큰 화면: 세 열이 남은 높이를 나누고 각각 안에서 스크롤한다 */}
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)]">
        {inputOpen && (
          <Card className="lg:col-span-3 lg:min-h-0">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                스펙 입력
                <Button size="sm" variant="ghost" onClick={() => setInputOpen(false)} aria-expanded>
                  접기
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className={SCROLL}>
              <SpecForm onGenerate={requestGenerate} />
            </CardContent>
          </Card>
        )}

        <Card className={cn("lg:min-h-0", inputOpen ? "lg:col-span-5" : "lg:col-span-8")}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              화면 구조
              <SaveStatus />
              {!inputOpen && (
                <Button size="sm" variant="outline" onClick={() => setInputOpen(true)} aria-expanded={false}>
                  스펙 입력 펼치기
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn(SCROLL, "flex flex-col gap-4")}>
            <DraftProgress />
            <DraftError onRetry={requestGenerate} />
            {!blueprint ? (
              <p className="rounded-lg bg-section p-6 text-sm text-foreground-secondary">
                아직 설계도가 없습니다. 스펙 7개 항목을 입력하거나 이미지를 첨부해 초안을 생성하면 화면 구조 미리보기가 여기에 표시됩니다.
              </p>
            ) : (
              <Tabs value={view} onValueChange={(v) => setView(v as StructureView)}>
                <TabsList>
                  <TabsTrigger value="preview">화면 미리보기</TabsTrigger>
                  <TabsTrigger value="tree">트리 보기</TabsTrigger>
                </TabsList>
                <TabsContent value="preview" className="mt-4">
                  <PreviewCanvas />
                </TabsContent>
                <TabsContent value="tree" className="mt-4">
                  <TreeView />
                </TabsContent>
              </Tabs>
            )}
            <NormalizedList />
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 lg:min-h-0">
          <CardHeader>
            <CardTitle>노드 편집</CardTitle>
          </CardHeader>
          <CardContent className={SCROLL}>
            <NodeEditPanel />
          </CardContent>
        </Card>
      </div>

      <CheckDock />

      <ConfirmDialog
        open={confirmReasons !== null}
        title="초안을 다시 생성할까요?"
        description={regenerateDescription(confirmReasons ?? [])}
        confirmLabel="다시 생성"
        onCancel={() => setConfirmReasons(null)}
        onConfirm={() => {
          setConfirmReasons(null);
          generate();
        }}
      />
    </div>
  );
}

/** 스토어와 자동 저장은 작업공간(Workspace)이 들고 있어 탭을 바꿔도 유지된다. 이 패널은 그것을 쓰기만 한다 */
export default function StructurePanel({ projectId, loadError }: { projectId: string; loadError: string | null }) {
  return (
    <ViolationsProvider>
      <Layout projectId={projectId} loadError={loadError} />
    </ViolationsProvider>
  );
}
