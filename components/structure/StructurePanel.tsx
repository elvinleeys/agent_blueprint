"use client";

import { useState } from "react";
import { runDraft } from "@/lib/client/run-draft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { StructureInit, StructureView } from "../../store/structure-store";
import DraftError from "./DraftError";
import DraftProgress from "./DraftProgress";
import NodeInfoPanel from "./NodeInfoPanel";
import NormalizedList from "./NormalizedList";
import PreviewCanvas from "./PreviewCanvas";
import SpecForm from "./SpecForm";
import { StructureStoreProvider, useStructureApi, useStructureStore } from "./StructureStoreProvider";
import TreeView from "./TreeViewLoader";

function Layout({ projectId, loadError }: { projectId: string; loadError: string | null }) {
  const api = useStructureApi();
  const blueprint = useStructureStore((s) => s.blueprint);
  const view = useStructureStore((s) => s.view);
  const setView = useStructureStore((s) => s.setView);
  const [inputOpen, setInputOpen] = useState(true);

  // 초안 생성 한 번. 어떤 오류든 입력(항목·화면 주소·이미지)은 스토어에 그대로 남는다
  async function generate() {
    const s = api.getState();
    if (s.status === "resizing" || s.status === "running") return;
    s.startDraft(Date.now(), s.images.length > 0);
    const result = await runDraft(
      { projectId, spec: s.spec, route: s.route, images: s.images },
      { onRunning: () => api.getState().setRunning(), onStage: (stage) => api.getState().addStage(stage) },
    );
    if (result.kind === "done") api.getState().finishDraft(result.blueprint, result.normalized);
    else api.getState().failDraft(result.error, result.keptBlueprint);
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {inputOpen && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                스펙 입력
                <Button size="sm" variant="ghost" onClick={() => setInputOpen(false)} aria-expanded>
                  접기
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SpecForm onGenerate={generate} />
            </CardContent>
          </Card>
        )}

        <Card className={cn(inputOpen ? "lg:col-span-6" : "lg:col-span-9")}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              화면 구조
              {!inputOpen && (
                <Button size="sm" variant="outline" onClick={() => setInputOpen(true)} aria-expanded={false}>
                  스펙 입력 펼치기
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DraftProgress />
            <DraftError onRetry={generate} />
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

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>노드 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <NodeInfoPanel />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>검사 결과</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground-tertiary">구조 검사 결과는 다음 단계에서 추가됩니다.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StructurePanel({ projectId, init, loadError }: { projectId: string; init: StructureInit; loadError: string | null }) {
  return (
    <StructureStoreProvider init={init}>
      <Layout projectId={projectId} loadError={loadError} />
    </StructureStoreProvider>
  );
}
