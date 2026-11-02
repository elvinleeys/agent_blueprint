"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestDeleteProject } from "@/lib/client/delete-project";
import type { Project } from "../../lib/db/projects";
import DeleteProjectDialog from "./DeleteProjectDialog";
import { ARCHITECTURES, FRAMEWORKS, labelOf, STYLINGS } from "../projects/stack-labels";

/** 완료 버튼을 누를 수 있는 조건: 저장 중이 아니고, 비어 있지 않고, 현재 이름과 다를 때 */
export const canCommitName = (current: string, draft: string, pending: boolean) => !pending && draft.trim() !== "" && draft.trim() !== current;

export default function ProjectSettingsTab({ project, onRenamed }: { project: Project; onRenamed: (p: Project) => void }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 수정을 시작하면 입력칸이 활성화된 뒤 포커스하고 이름을 선택한다
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEdit() {
    setMessage(null);
    setEditing(true);
  }
  function cancelEdit() {
    if (pending) return;
    setName(project.name);
    setEditing(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !canCommitName(project.name, name, pending)) return;
    const trimmed = name.trim();
    if (trimmed.length > 100) return setMessage({ kind: "error", text: "프로젝트 이름은 1~100자여야 합니다." });
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
      setEditing(false);
      setMessage({ kind: "ok", text: "이름을 바꿨습니다." });
      router.refresh(); // 목록 등 서버에서 만든 화면에 새 이름 반영
    } catch {
      setMessage({ kind: "error", text: "네트워크 오류로 이름을 바꾸지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const outcome = await requestDeleteProject(project.id);
    if (outcome.kind === "done") {
      // 지운 프로젝트의 화면에 남지 않도록 목록으로 이동한다(이동하면 이 화면은 사라진다)
      router.push("/projects");
      router.refresh();
      return;
    }
    if (outcome.needsLogin) return router.push(`/?next=${encodeURIComponent(`/projects/${project.id}`)}`);
    setDeleteError(outcome.message);
    setDeleting(false);
  }

  const stack = project.stack;
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="rename" className="text-sm font-medium text-foreground">
          프로젝트 이름
        </label>
        <Input
          id="rename"
          ref={inputRef}
          value={name}
          disabled={!editing}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelEdit();
          }}
          maxLength={100}
          className="disabled:bg-section disabled:opacity-100"
        />
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-destructive" : "text-success"}`}>
            {message.text}
          </p>
        )}
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button type="submit" disabled={!canCommitName(project.name, name, pending)}>
                {pending ? "저장 중…" : "완료"}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEdit} disabled={pending}>
                취소
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={startEdit}>
              이름 수정
            </Button>
          )}
        </div>
      </form>

      <section aria-labelledby="stack-title">
        <h2 id="stack-title" className="text-sm font-medium text-foreground">
          스택
        </h2>
        <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-foreground-tertiary">프레임워크</dt>
          <dd className="text-foreground">{labelOf(FRAMEWORKS, stack.framework)}</dd>
          <dt className="text-foreground-tertiary">스타일 방식</dt>
          <dd className="text-foreground">{labelOf(STYLINGS, stack.styling)}</dd>
          <dt className="text-foreground-tertiary">디렉토리 구조</dt>
          <dd className="text-foreground">{labelOf(ARCHITECTURES, stack.architecture)}</dd>
        </dl>
        <p className="mt-2 text-xs text-foreground-tertiary">스택을 바꾸려면 새 프로젝트를 만드세요.</p>
      </section>

      <section aria-labelledby="danger-title" className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 id="danger-title" className="text-sm font-medium text-foreground">
          프로젝트 삭제
        </h2>
        <p className="text-xs text-foreground-tertiary">설계도의 모든 판, 스펙 입력, 지시서 기록이 함께 삭제되고 되돌릴 수 없습니다.</p>
        <div>
          <Button type="button" variant="destructive" onClick={() => { setDeleteError(null); setDeleteOpen(true); }}>
            프로젝트 삭제
          </Button>
        </div>
      </section>
      {deleteOpen && <DeleteProjectDialog open projectName={project.name} pending={deleting} error={deleteError} onConfirm={remove} onCancel={() => setDeleteOpen(false)} />}
    </div>
  );
}
