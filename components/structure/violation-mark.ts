export type NodeCounts = { error: number; warning: number };

/** 노드 상자·카드에 붙일 위반 표시. 오류가 있으면 빨강, 없고 경고가 있으면 주황, 둘 다 없으면 null(정보는 표시하지 않는다) */
export function violationMark(counts: NodeCounts | undefined): { label: string; border: string; text: string } | null {
  if (!counts) return null;
  if (counts.error > 0) return { label: `오류 ${counts.error}`, border: "border-destructive", text: "text-destructive" };
  if (counts.warning > 0) return { label: `경고 ${counts.warning}`, border: "border-warning", text: "text-warning" };
  return null;
}

/** AI 가정은 회색 점선. 주황은 경고 전용 상태 색이라 쓰지 않는다 */
export const ASSUMED_BORDER = "border-dashed border-foreground-tertiary";
export const ASSUMED_TEXT = "text-foreground-tertiary";
