"use client";

import { useState } from "react";
import type { Project } from "../../lib/db/projects";
import type { StructureInit } from "../../store/structure-store";
import DesignSystemPanel from "../design-system/DesignSystemPanel";
import ImplementationCheckPanel from "../implementation-check/ImplementationCheckPanel";
import GuardedLink from "../layout/GuardedLink";
import PromptPanel from "../prompt/PromptPanel";
import { SaveQueueProvider } from "../structure/SaveQueueProvider";
import { StructureStoreProvider } from "../structure/StructureStoreProvider";
import StructurePanel from "../structure/StructurePanel";
import { stackSummary } from "../projects/stack-labels";
import ProjectSettingsTab from "./ProjectSettingsTab";

type TabId = "settings" | "structure" | "design-system" | "implementation-check" | "prompt";

const TABS: { id: TabId; label: string; enabled: boolean }[] = [
  { id: "settings", label: "프로젝트 설정", enabled: true },
  { id: "structure", label: "구조 설계", enabled: true },
  { id: "design-system", label: "디자인 시스템 정리", enabled: true },
  { id: "prompt", label: "지시서", enabled: true },
  { id: "implementation-check", label: "구현 검사", enabled: true },
];

export default function Workspace({
  initialProject,
  structureInit,
  structureLoadError,
  repoCheckAllowed = false,
  aiAllowed = false,
}: {
  initialProject: Project;
  structureInit: StructureInit;
  structureLoadError: string | null;
  repoCheckAllowed?: boolean;
  aiAllowed?: boolean;
}) {
  const [project, setProject] = useState(initialProject);

  // 스토어와 자동 저장은 탭을 바꿔도 사라지지 않게 탭 바깥(여기)에 둔다. 구조 설계 탭은 이것을 쓰기만 한다
  return (
    <StructureStoreProvider init={structureInit}>
      <SaveQueueProvider projectId={initialProject.id}>
        <WorkspaceBody project={project} onRenamed={setProject} structureLoadError={structureLoadError} repoCheckAllowed={repoCheckAllowed} aiAllowed={aiAllowed} />
      </SaveQueueProvider>
    </StructureStoreProvider>
  );
}

function WorkspaceBody({
  project,
  onRenamed,
  structureLoadError,
  repoCheckAllowed,
  aiAllowed,
}: {
  project: Project;
  onRenamed: (project: Project) => void;
  structureLoadError: string | null;
  repoCheckAllowed: boolean;
  aiAllowed: boolean;
}) {
  const [tab, setTab] = useState<TabId>("structure");
  // 구현 검사 탭은 한 번 열면 숨기기만 한다(올린 파일·결과·선택이 탭을 바꿔도 유지됨. 저장하지 않으므로 작업공간을 떠나면 사라진다)
  const [checkOpened, setCheckOpened] = useState(false);

  return (
    <div className="flex flex-1 flex-col gap-4 lg:min-h-0">
      {/* 제목·탭은 줄어들지 않는다. 구현 검사 탭은 내용만큼 늘어나(페이지 스크롤) 큰 화면의 고정 높이를 넘는데, 이때 overflow가 있는 탭 줄이 높이 0으로 눌려 사라졌다 */}
      <div className="shrink-0">
        <nav aria-label="경로" className="mb-1 flex items-center gap-1 text-sm text-foreground-tertiary">
          <GuardedLink href="/projects" className="hover:text-primary">
            프로젝트
          </GuardedLink>
          <span aria-hidden>›</span>
          <span aria-current="page" className="truncate">{project.name}</span>
        </nav>
        <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
        <p className="mt-1 text-sm text-foreground-secondary">{stackSummary(project.stack)}</p>
      </div>

      <div role="tablist" aria-label="작업공간" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            disabled={!t.enabled}
            onClick={() => {
              if (t.id === "implementation-check") setCheckOpened(true);
              setTab(t.id);
            }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-foreground-secondary hover:text-foreground"
            } disabled:cursor-not-allowed disabled:text-foreground-quaternary`}
          >
            {t.label}
            {!t.enabled && <span className="ml-1 text-xs">(준비 중)</span>}
          </button>
        ))}
      </div>

      {/* 구현 검사 탭은 안쪽 스크롤 없이 페이지 스크롤 하나만 쓴다(결과가 길어 잘리지 않도록). 다른 탭은 화면 높이에 맞춰 영역 안에서 스크롤.
          구현 검사 탭은 min-h-0 없이 고정 높이 밖으로 넘치는 것에 기대므로, 조상(main·이 컴포넌트·page.tsx)에 overflow를 더하면 다시 잘린다 */}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={tab === "implementation-check" ? "flex flex-1 flex-col pb-8" : "flex flex-1 flex-col lg:min-h-0 lg:overflow-y-auto"}>
        {tab === "settings" && <ProjectSettingsTab project={project} onRenamed={onRenamed} />}
        {tab === "structure" && <StructurePanel projectId={project.id} loadError={structureLoadError} />}
        {tab === "design-system" && <DesignSystemPanel />}
        {tab === "prompt" && <PromptPanel projectId={project.id} onGoStructure={() => setTab("structure")} />}
        {checkOpened && (
          <div hidden={tab !== "implementation-check"}>
            <ImplementationCheckPanel projectId={project.id} onGoStructure={() => setTab("structure")} repoCheckAllowed={repoCheckAllowed} aiAllowed={aiAllowed} />
          </div>
        )}
      </div>
    </div>
  );
}
