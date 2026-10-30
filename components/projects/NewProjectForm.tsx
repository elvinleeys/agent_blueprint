"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ARCHITECTURES, FRAMEWORKS, STYLINGS } from "./stack-labels";

const FIELD = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

type Option = { value: string; label: string };

function Select({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: readonly Option[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.value})
          </option>
        ))}
      </select>
    </div>
  );
}

export default function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [framework, setFramework] = useState("next");
  const [styling, setStyling] = useState("tailwind");
  const [architecture, setArchitecture] = useState("feature-based");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 100) return setError("프로젝트 이름은 1~100자여야 합니다.");
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, stack: { framework, styling, architecture } }),
      });
      if (res.status === 401) return router.push("/?next=%2Fprojects");
      const body = await res.json().catch(() => null);
      if (!res.ok) return setError(body?.error?.message ?? "프로젝트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      router.push(`/projects/${body.project.id}`);
    } catch {
      setError("네트워크 오류로 프로젝트를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label htmlFor="project-name" className="mb-1 block text-sm font-medium text-slate-700">
          이름
        </label>
        <input id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={FIELD} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Select id="framework" label="프레임워크" value={framework} options={FRAMEWORKS} onChange={setFramework} />
        <Select id="styling" label="스타일 방식" value={styling} options={STYLINGS} onChange={setStyling} />
        <Select id="architecture" label="디렉토리 구조" value={architecture} options={ARCHITECTURES} onChange={setArchitecture} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {pending ? "만드는 중…" : "프로젝트 만들기"}
        </button>
      </div>
    </form>
  );
}
