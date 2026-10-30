"use client";

import Link from "next/link";
import { useState } from "react";
import type { Project } from "../../lib/db/projects";
import { stackSummary } from "../projects/stack-labels";
import ProjectSettingsTab from "./ProjectSettingsTab";

type TabId = "settings" | "structure" | "design-system" | "prompt";

const TABS: { id: TabId; label: string; enabled: boolean }[] = [
  { id: "settings", label: "프로젝트 설정", enabled: true },
  { id: "structure", label: "구조 설계", enabled: true },
  { id: "design-system", label: "디자인 시스템 정리", enabled: false },
  { id: "prompt", label: "지시서", enabled: false },
];

export default function Workspace({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [tab, setTab] = useState<TabId>("structure");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="경로" className="mb-2 flex items-center gap-1 text-sm text-slate-500">
          <Link href="/projects" className="hover:text-indigo-600">
            프로젝트
          </Link>
          <span aria-hidden>›</span>
          <span aria-current="page" className="truncate">{project.name}</span>
        </nav>
        <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{stackSummary(project.stack)}</p>
      </div>

      <div role="tablist" aria-label="작업공간" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            disabled={!t.enabled}
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-600 hover:text-slate-900"
            } disabled:cursor-not-allowed disabled:text-slate-300`}
          >
            {t.label}
            {!t.enabled && <span className="ml-1 text-xs">(준비 중)</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "settings" && <ProjectSettingsTab project={project} onRenamed={setProject} />}
        {tab === "structure" && <p className="text-sm text-slate-500">구조 설계 탭은 다음 단계에서 채웁니다.</p>}
      </div>
    </div>
  );
}
