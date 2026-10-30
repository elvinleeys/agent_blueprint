import { selectHasUnsaved, type StructureState } from "../../store/structure-store";

/** 다시 생성 전에 확인을 받아야 하는 이유. 둘 다일 수 있다 */
export type RegenerateReason = "unsaved" | "user-edited";

const MESSAGES: Record<RegenerateReason, string> = {
  unsaved: "저장되지 않은 수정은 사라집니다. 진행 중인 저장이 있으면 끝날 때까지 기다린 뒤 새 초안을 만들고, 생성에 실패하면 수정은 그대로 남아 다시 저장됩니다.",
  "user-edited": "현재 설계도는 이전 판으로 보관되고 새 초안으로 바뀝니다. 판 목록 화면은 아직 없어 지금 화면에서는 볼 수 없습니다.",
};

/**
 * "초안 다시 생성"을 누를 때 확인이 필요한 이유 목록. 비어 있으면 확인 없이 바로 생성한다.
 * - unsaved: 저장되지 않은 수정이 있다(저장 대기·전송 중·저장 실패·초안 저장 실패)
 * - user-edited: 현재 설계도가 사용자가 고친 것이다(generatedBy가 user). 저장이 끝났어도 이전 판으로 밀려나므로 알린다
 * 설계도가 없을 때(첫 생성)와, 최신 판이 AI 초안이고 저장되지 않은 수정도 없을 때는 확인하지 않는다.
 */
export function regenerateReasons(s: Pick<StructureState, "blueprint" | "unsaved" | "saveStatus">): RegenerateReason[] {
  const reasons: RegenerateReason[] = [];
  if (selectHasUnsaved(s)) reasons.push("unsaved");
  if (s.blueprint?.generatedBy === "user") reasons.push("user-edited");
  return reasons;
}

export const regenerateDescription = (reasons: readonly RegenerateReason[]): string => reasons.map((r) => MESSAGES[r]).join(" ");
