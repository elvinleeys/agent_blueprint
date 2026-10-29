export type RepairIssue = { path: PropertyKey[]; message: string };

export const MAX_REPAIR_ISSUES = 10;

function describePath(path: PropertyKey[], nodeNames?: string[]): string {
  if (path.length === 0) return "(root)";
  const parts = path.map(String);
  const index = path[1];
  const name = path[0] === "nodes" && typeof index === "number" ? nodeNames?.[index] : undefined;
  // nodes.3.order 보다 nodes[3] ProductTabs.order 가 모델이 고칠 위치를 찾기 쉽다
  return name ? [`nodes[${String(index)}] ${name}`, ...parts.slice(2)].join(".") : parts.join(".");
}

/** Zod 검증 오류 → 모델에게 다시 시도하라고 보낼 지시문. 직전 응답 원문은 대화 이력으로 따로 전달한다. */
export function buildRepairPrompt({ issues, nodeNames }: { issues: RepairIssue[]; nodeNames?: string[] }): string {
  const shown = issues.slice(0, MAX_REPAIR_ISSUES);
  const omitted = issues.length - shown.length;
  return [
    "직전 응답이 설계도 규칙을 어겼다. 아래 오류를 모두 고쳐 설계도 전체를 JSON으로 다시 출력하라. 오류와 무관한 부분은 바꾸지 말고, 코드나 설명 없이 JSON만 출력한다.",
    ...(shown.length > 0
      ? ["", "오류 (nodes[N]은 nodes 배열의 N번째, 0부터 센다):", ...shown.map((i) => `- ${describePath(i.path, nodeNames)}: ${i.message}`)]
      : []),
    ...(omitted > 0 ? [`- (그 밖의 오류 ${omitted}개는 생략했다. 위 오류를 고친 뒤 같은 유형이 없는지 전체를 점검하라)`] : []),
  ].join("\n");
}
