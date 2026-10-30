import type { EditResult } from "./result";

const MAX_NAMES = 3;

/** 연산이 사용자 몰래 바꾼 값을 화면에 짧게 알리는 문구. 바꾼 것이 없으면 빈 배열 */
export function describeEditNotices(result: EditResult): string[] {
  if (!result.ok) return [];
  const name = (id: string) => result.blueprint.nodes.find((n) => n.id === id)?.name ?? id;
  const list = (ids: string[]) => (ids.length > MAX_NAMES ? `${ids.slice(0, MAX_NAMES).map(name).join(", ")} 외 ${ids.length - MAX_NAMES}개` : ids.map(name).join(", "));

  const notices: string[] = [];
  if (result.filledLayout?.length)
    notices.push(`${list(result.filledLayout)}의 배치를 세로 정렬(flex, 간격 없음)로 지정했습니다.`);
  if (result.toClient?.length)
    notices.push(`client 영역 안으로 옮겨져 노드 ${result.toClient.length}개를 client로 바꿨습니다(${list(result.toClient)}).`);
  return notices;
}
