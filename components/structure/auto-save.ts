import type { Blueprint } from "../../core/schema/blueprint";
import { putBlueprint, SaveError } from "../../lib/client/save-blueprint";
import { createSaveQueue, type SaveQueue } from "../../lib/client/save-queue";
import type { StructureStore } from "../../store/structure-store";

const FALLBACK = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * 작업공간(프로젝트) 하나의 저장 큐. 전송은 putBlueprint로 하고, 큐 상태와 실패 문구를 스토어에 반영한다.
 * 성공하면 저장 실패 문구를 지운다.
 */
export function createSessionQueue(store: StructureStore, projectId: string, put: typeof putBlueprint = putBlueprint): SaveQueue<Blueprint> {
  return createSaveQueue<Blueprint>({
    send: async (blueprint) => {
      try {
        await put(projectId, blueprint);
        store.getState().setSaveError(null);
      } catch (e) {
        store.getState().setSaveError(e instanceof SaveError ? { message: e.message, needsLogin: e.needsLogin } : { message: FALLBACK, needsLogin: false });
        throw e; // 큐가 error 상태로 멈추고 다시 시도를 기다린다
      }
    },
    onStatus: (status) => store.getState().setSaveStatus(status),
  });
}

/** 편집이 설계도에 반영될 때마다(editRevision이 바뀔 때) 저장을 예약한다. 해제 함수를 돌려준다 */
export function connectAutoSave(store: StructureStore, queue: Pick<SaveQueue<Blueprint>, "schedule">): () => void {
  return store.subscribe((state, prev) => {
    if (state.editRevision !== prev.editRevision && state.blueprint) queue.schedule(state.blueprint);
  });
}
