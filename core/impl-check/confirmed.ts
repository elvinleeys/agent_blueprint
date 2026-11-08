import type { CodeModel } from "../code-model/facts";
import type { Blueprint } from "../schema/blueprint";
import { matchBlueprint, sameKind } from "./match";
import type { ConfirmedPair } from "./types";

// 사용자가 확정한 짝(confirmed)을 검사기에 넘기기 전에 검증한다. 클라이언트가 보낸 값을 그대로 믿지 않는다.
// 문제 하나는 어느 항목(index)이 왜 어긋났는지만 담는다. 코드 내용은 담지 않는다.

export type ConfirmedProblemReason =
  | "unknown-node" // nodeId가 기준 설계도에 없음
  | "unknown-code" // path·name이 올린 코드에 없음
  | "kind-mismatch" // 훅 노드 ↔ 컴포넌트 코드(또는 반대)
  | "duplicate-node" // 같은 노드를 두 번 확정
  | "duplicate-code" // 같은 코드를 여러 노드에 확정
  | "already-certain-node" // 이미 확실한 짝이 있는 노드를 다른 코드로 확정
  | "code-taken"; // 그 코드가 이미 다른 노드의 확실한 짝

export type ConfirmedProblem = { index: number; nodeId: string; reason: ConfirmedProblemReason };

export const CONFIRMED_PROBLEM_TEXT: Record<ConfirmedProblemReason, string> = {
  "unknown-node": "기준 설계도에 없는 노드입니다.",
  "unknown-code": "올린 코드에 없는 컴포넌트·훅입니다.",
  "kind-mismatch": "노드와 코드의 종류가 다릅니다(훅은 훅끼리, 컴포넌트·페이지는 컴포넌트끼리).",
  "duplicate-node": "같은 노드를 두 번 확정했습니다.",
  "duplicate-code": "같은 코드를 여러 노드에 확정했습니다.",
  "already-certain-node": "이미 확실한 짝이 있는 노드를 다른 코드로 확정할 수 없습니다.",
  "code-taken": "그 코드는 이미 다른 노드의 확실한 짝입니다.",
};

export function validateConfirmed(bp: Blueprint, model: CodeModel, confirmed: ConfirmedPair[]): ConfirmedProblem[] {
  if (!confirmed.length) return [];
  const units = new Map<string, (typeof model.files)[number]["units"][number]>(model.files.flatMap((f) => f.units.map((u) => [`${u.path}#${u.name}`, u] as const)));
  const base = matchBlueprint(bp, model); // 확정 없이 짝짓기한 결과: 이미 확실한 짝을 알아내는 기준
  const certainByUnit = new Map(base.pairs.map((p) => [`${p.unit.path}#${p.unit.name}`, p.nodeId]));
  const seenNode = new Set<string>();
  const seenCode = new Set<string>();
  const problems: ConfirmedProblem[] = [];
  confirmed.forEach((c, index) => {
    const add = (reason: ConfirmedProblemReason) => problems.push({ index, nodeId: c.nodeId, reason });
    const node = bp.nodes.find((n) => n.id === c.nodeId);
    const key = `${c.path}#${c.name}`;
    const unit = units.get(key);
    if (!node) return add("unknown-node");
    if (!unit) return add("unknown-code");
    if (!sameKind(node, unit)) return add("kind-mismatch");
    if (seenNode.has(node.id)) return add("duplicate-node");
    if (seenCode.has(key)) return add("duplicate-code");
    seenNode.add(node.id);
    seenCode.add(key);
    const current = base.pairOf(node.id);
    if (current && `${current.unit.path}#${current.unit.name}` !== key) return add("already-certain-node");
    const owner = certainByUnit.get(key);
    if (owner && owner !== node.id) return add("code-taken");
  });
  return problems;
}
