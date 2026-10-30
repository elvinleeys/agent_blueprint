import type { Blueprint } from "../../core/schema/blueprint";
import { runDraft } from "../../lib/client/run-draft";
import type { SaveQueue } from "../../lib/client/save-queue";
import type { StructureStore } from "../../store/structure-store";

type Queue = Pick<SaveQueue<Blueprint>, "settle" | "schedule" | "hasUnsaved">;

/**
 * 초안 생성 한 번. 순서가 중요하다(새 AI 초안 위에 이전 편집이 저장되면 안 된다).
 *   1. startDraft: 이 순간부터 편집이 막힌다(스토어의 applyEdit이 거부한다)
 *   2. queue.settle: 진행 중인 저장은 끝나길 기다리고, 보내지 않은 저장은 취소한다
 *   3. runDraft: 생성(서버가 성공한 초안을 새 판으로 저장한다)
 * 생성이 실패해서 화면에 이전 설계도(편집본)가 그대로 남으면, 2에서 취소한 저장을 다시 예약한다
 * (화면에는 보이는데 저장되지 않은 상태로 남지 않게). 저장만 실패한 새 초안(keptBlueprint)이 보일 때는 이전 편집이 화면에서 사라졌으므로 예약하지 않는다.
 * 입력(항목·화면 주소·이미지)은 어떤 경우에도 스토어에 그대로 남는다.
 */
export async function generateDraft({ store, projectId, queue, run = runDraft, now = Date.now }: { store: StructureStore; projectId: string; queue: Queue; run?: typeof runDraft; now?: () => number }): Promise<void> {
  const first = store.getState();
  if (first.status === "resizing" || first.status === "running") return;

  first.startDraft(now(), first.images.length > 0);
  const hadUnsaved = queue.hasUnsaved();
  await queue.settle();

  const { spec, route, images } = store.getState();
  const result = await run({ projectId, spec, route, images }, { onRunning: () => store.getState().setRunning(), onStage: (stage) => store.getState().addStage(stage) });

  if (result.kind === "done") {
    store.getState().finishDraft(result.blueprint, result.normalized);
    return;
  }
  store.getState().failDraft(result.error, result.keptBlueprint);
  const kept = store.getState().blueprint;
  if (hadUnsaved && !result.keptBlueprint && kept) queue.schedule(kept);
}
