// 프로젝트 삭제 요청(브라우저 전용)

export type DeleteOutcome = { kind: "done" } | { kind: "failed"; message: string; needsLogin: boolean };

const FAILED = "프로젝트를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 삭제 확인: 프로젝트 이름을 그대로(앞뒤 공백만 무시) 다시 입력해야 한다 */
export const canConfirmDelete = (typed: string, projectName: string) => typed.trim() === projectName.trim() && projectName.trim() !== "";

/** DELETE /api/projects/[id]. 서버가 준 사용자용 문구가 있으면 그대로 쓴다 */
export async function requestDeleteProject(projectId: string, fetchFn: typeof fetch = fetch): Promise<DeleteOutcome> {
  let res: Response;
  try {
    res = await fetchFn(`/api/projects/${projectId}`, { method: "DELETE" });
  } catch {
    return { kind: "failed", message: "네트워크 오류로 삭제하지 못했습니다. 다시 시도해 주세요.", needsLogin: false };
  }
  if (res.ok) return { kind: "done" };
  if (res.status === 401) return { kind: "failed", message: "로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.", needsLogin: true };
  const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
  const message = body?.error?.message;
  return { kind: "failed", message: typeof message === "string" && message ? message : FAILED, needsLogin: false };
}
