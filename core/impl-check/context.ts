import { unreadableScope, type CodeModel, type FileFact, type UnitFact, type UnreadableScope } from "../code-model/facts";
import type { Blueprint, ComponentNode } from "../schema/blueprint";
import type { BanKey, BanStatus, Finding, ItemStatus } from "./result";
import type { Pairing } from "./types";

// 규칙들이 함께 쓰는 문맥: 설계도·코드 사실·짝짓기 결과와, 항목 판정(mark)·결과 카드(add)를 모으는 곳.
// 규칙은 확실한 짝이 있는 노드에만 쓴다. 코드에 없는 노드·짝 확인 필요 노드의 항목은 run.ts가 먼저 정한다.

export type Located = { unit: UnitFact; file: FileFact };
export type NodeState = "certain" | "review" | "missing";

type Contribution = { status: ItemStatus; evidence: string[]; findingId?: string };
type BanContribution = { status: BanStatus; evidence: string[]; findingId?: string };

export class Ctx {
  readonly nodes: ComponentNode[];
  readonly byId: Map<string, ComponentNode>;
  readonly scope: UnreadableScope;
  readonly findings: Finding[] = [];
  readonly itemContribs = new Map<string, Contribution[]>();
  readonly banContribs = new Map<string, BanContribution[]>();
  private readonly unitByKey = new Map<string, Located>();

  constructor(
    readonly bp: Blueprint,
    readonly model: CodeModel,
    readonly pairing: Pairing,
  ) {
    this.nodes = bp.nodes;
    this.byId = new Map(bp.nodes.map((n) => [n.id, n]));
    this.scope = unreadableScope(model);
    for (const file of model.files) for (const unit of file.units) this.unitByKey.set(`${unit.path}#${unit.name}`, { unit, file });
  }

  get stack() {
    return this.bp.stack;
  }

  stateOf(nodeId: string): NodeState {
    if (this.pairing.pairOf(nodeId)) return "certain";
    return this.pairing.missing.some((m) => m.nodeId === nodeId) ? "missing" : "review";
  }

  /** 확실한 짝의 코드 단위와 그 파일 */
  located(nodeId: string): Located | undefined {
    const p = this.pairing.pairOf(nodeId);
    return p ? this.unitByKey.get(`${p.unit.path}#${p.unit.name}`) : undefined;
  }

  /** 코드 단위(경로#이름)로 찾는다 */
  unit(path: string, name: string): Located | undefined {
    return this.unitByKey.get(`${path}#${name}`);
  }

  /** 모든 코드 단위(훅이 부르는 훅의 조회 여부 등을 볼 때) */
  allUnits(): Located[] {
    return [...this.unitByKey.values()];
  }

  /** 확실한 짝이 있는 노드의 부모 */
  parentOf(node: ComponentNode): ComponentNode | undefined {
    return node.parentId ? this.byId.get(node.parentId) : undefined;
  }

  /** 항목 판정을 더한다. 최종 상태는 불일치 > 확인 필요 > 일치 순으로 합친다 */
  mark(nodeId: string, key: string, status: ItemStatus, evidence: string[], findingId?: string) {
    const id = `${nodeId}|${key}`;
    const list = this.itemContribs.get(id) ?? [];
    list.push({ status, evidence, findingId });
    this.itemContribs.set(id, list);
  }

  markBan(nodeId: string, key: BanKey, status: BanStatus, evidence: string[], findingId?: string) {
    const id = `${nodeId}|${key}`;
    const list = this.banContribs.get(id) ?? [];
    list.push({ status, evidence, findingId });
    this.banContribs.set(id, list);
  }

  add(f: Finding) {
    this.findings.push(f);
  }
}

export const findingId = (rule: string, nodeId: string, key: string) => `${rule}|${nodeId}|${key}`;

/** 코드 위치 문구: 파일:줄 */
export const at = (path: string, line?: number) => (line ? `${path}:${line}` : path);
