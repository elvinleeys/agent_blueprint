"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Project } from "../../lib/db/projects";
import { ARCHITECTURES, FRAMEWORKS, labelOf, STYLINGS } from "../projects/stack-labels";

export default function ProjectSettingsTab({ project, onRenamed }: { project: Project; onRenamed: (p: Project) => void }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 100) return setMessage({ kind: "error", text: "프로젝트 이름은 1~100자여야 합니다." });
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 401) return router.push(`/?next=${encodeURIComponent(`/projects/${project.id}`)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) return setMessage({ kind: "error", text: body?.error?.message ?? "이름을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요." });
      onRenamed(body.project);
      setName(body.project.name);
      setMessage({ kind: "ok", text: "이름을 바꿨습니다." });
      router.refresh(); // 목록 등 서버에서 만든 화면에 새 이름 반영
    } catch {
      setMessage({ kind: "error", text: "네트워크 오류로 이름을 바꾸지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(false);
    }
  }

  const stack = project.stack;
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="rename" className="text-sm font-medium text-slate-700">
          프로젝트 이름
        </label>
        <input
          id="rename"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}>
            {message.text}
          </p>
        )}
        <div>
          <button type="submit" disabled={pending} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {pending ? "저장 중…" : "이름 저장"}
          </button>
        </div>
      </form>

      <section aria-labelledby="stack-title">
        <h2 id="stack-title" className="text-sm font-medium text-slate-700">
          스택
        </h2>
        <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">프레임워크</dt>
          <dd className="text-slate-900">{labelOf(FRAMEWORKS, stack.framework)}</dd>
          <dt className="text-slate-500">스타일 방식</dt>
          <dd className="text-slate-900">{labelOf(STYLINGS, stack.styling)}</dd>
          <dt className="text-slate-500">디렉토리 구조</dt>
          <dd className="text-slate-900">{labelOf(ARCHITECTURES, stack.architecture)}</dd>
        </dl>
        <p className="mt-2 text-xs text-slate-500">스택을 바꾸려면 새 프로젝트를 만드세요.</p>
      </section>
    </div>
  );
}
