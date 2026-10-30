import type { Blueprint } from "../../core/schema/blueprint";

/** 저장 실패: 화면에 그대로 보여 줄 수 있는 사용자용 문구와 로그인이 필요한지 */
export class SaveError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly needsLogin: boolean,
  ) {
    super(message);
  }
}

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * 편집 중인 설계도를 저장한다(PUT /api/projects/[id]/blueprint). 서버가 최신 판을 갱신하고, AI 원본은 새 판으로 보존한다.
 * 실패하면 SaveError를 던진다. 서버·DB의 원문 오류는 문구에 넣지 않는다.
 */
export async function putBlueprint(projectId: string, blueprint: Blueprint, fetchFn: typeof fetch = fetch): Promise<void> {
  let res: Response;
  try {
    res = await fetchFn(`/api/projects/${projectId}/blueprint`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(blueprint),
    });
  } catch {
    throw new SaveError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.", null, false);
  }
  if (res.ok) return;

  if (res.status === 401) throw new SaveError("로그인이 만료되어 저장하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.", 401, true);
  if (res.status === 404) throw new SaveError("이 프로젝트를 찾을 수 없어 저장하지 못했습니다.", 404, false);
  if (res.status === 413) throw new SaveError("설계도가 너무 커서 저장하지 못했습니다.", 413, false);
  if (res.status === 422) throw new SaveError("설계도가 올바르지 않아 저장하지 못했습니다.", 422, false);
  throw new SaveError(FALLBACK, res.status, false);
}
