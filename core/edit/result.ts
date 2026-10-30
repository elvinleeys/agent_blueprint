import { BlueprintSchema, type Blueprint, type ComponentNode } from "../schema/blueprint";

/**
 * 실패 시 nodeId·path는 입력칸 옆에 이유를 보여 주는 데 쓴다(path는 그 노드 기준).
 * 성공 시 연산이 사용자 몰래 바꾼 것은 알림용으로 담는다: filledLayout은 기본 배치를 채운 노드 id, toClient는 client로 바뀐 노드 id.
 */
export type EditResult =
  | { ok: true; blueprint: Blueprint; selectId?: string; filledLayout?: string[]; toClient?: string[] }
  | { ok: false; reason: string; nodeId?: string; path?: (string | number)[] };

export const reject = (reason: string, nodeId?: string, path?: (string | number)[]): EditResult => ({ ok: false, reason, nodeId, path });

/**
 * 바뀐 노드 배열로 설계도를 만들어 스키마로 검증한다. 통과한 결과만 돌려주므로 편집 결과는 항상 저장 가능하다.
 * 편집이 반영되면 generatedBy는 user가 된다(서버가 AI 원본을 보존하는 기준).
 */
export function commitNodes(bp: Blueprint, nodes: ComponentNode[], editedId?: string): EditResult {
  const r = BlueprintSchema.safeParse({ ...bp, generatedBy: "user", nodes });
  if (r.success) return { ok: true, blueprint: r.data };

  const nodeIndex = (path: PropertyKey[]) => (path[0] === "nodes" && typeof path[1] === "number" ? path[1] : undefined);
  const issue = r.error.issues.find((i) => editedId !== undefined && nodeIndex(i.path) !== undefined && nodes[nodeIndex(i.path)!]?.id === editedId) ?? r.error.issues[0];
  const idx = nodeIndex(issue.path);
  return reject(issue.message, idx === undefined ? undefined : nodes[idx]?.id, issue.path.slice(idx === undefined ? 0 : 2) as (string | number)[]);
}
