import * as ts from "typescript";
import type { SourceFile } from "../code-model/types";
import type { Blueprint } from "../schema/blueprint";
import type { Pairing, UnitRef } from "./types";

/**
 * AI 제안에 보낼 대상 고르기(순수 함수, 스펙 §8 AI·Q3). AI는 확실 결과를 바꾸지 못하고 의견만 낸다.
 * - 짝 제안: 짝 확인 필요 노드(후보가 있는 것)와 후보 코드(상위 3개)
 * - 책임 제안: 확실한 짝이 있는 노드의 책임(responsibilities)과 그 짝 코드
 * 보내는 코드는 파일 전체가 아니라 그 컴포넌트·훅의 선언 부분(함수 조각)뿐이다. 찾지 못하면 그 대상은 보내지 않는다.
 * 상한: 조각 하나 4,000자(넘으면 자름)·합계 30,000자·조각 12개. 짝 제안이 먼저이고, 넘치는 대상은 통째로 빼고 omitted에 적는다.
 */

export const AI_LIMITS = { perUnitChars: 4000, totalChars: 30000, maxUnits: 12 };
export type AiLimits = typeof AI_LIMITS;
const MAX_CANDIDATES = 3;
const TRUNCATED = "\n// …(4,000자를 넘어 잘림)";

export type AiUnit = { path: string; name: string; kind: UnitRef["kind"]; snippet: string; truncated: boolean };
export type AiPairTask = { nodeId: string; nodeName: string; nodeKind: string; responsibilities: string[]; props: string[]; candidates: { path: string; name: string }[] };
export type AiResponsibilityTask = { nodeId: string; nodeName: string; responsibilities: string[]; unit: { path: string; name: string } };
export type AiInput = {
  pairTasks: AiPairTask[];
  responsibilityTasks: AiResponsibilityTask[];
  units: AiUnit[];
  /** 상한·조각을 찾지 못해 보내지 않은 대상(노드 이름). 화면에 "생략"으로 보인다 */
  omitted: { pairNodes: string[]; responsibilityNodes: string[] };
};

const unitKey = (u: { path: string; name: string }) => `${u.path}#${u.name}`;

/** 선언 이름: function X, const X = …, class X. 이름 없는 기본 내보내기(nameSource file)는 export default 선언 */
function findDeclaration(sf: ts.SourceFile, name: string, defaultExport: boolean): ts.Node | null {
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name?.text === name) return st;
    if (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)) return st;
  }
  if (!defaultExport) return null;
  for (const st of sf.statements) {
    const isDefault = (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && !st.name && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (isDefault || ts.isExportAssignment(st)) return st;
  }
  return null;
}

/** 컴포넌트·훅의 선언 부분만 잘라 낸다. 찾지 못하면 null */
export function extractSnippet(files: SourceFile[], unit: UnitRef, limit = AI_LIMITS.perUnitChars): { snippet: string; truncated: boolean } | null {
  const file = files.find((f) => f.path === unit.path);
  if (!file) return null;
  const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const node = findDeclaration(sf, unit.name, unit.nameSource === "file");
  if (!node) return null;
  const text = node.getText(sf);
  return text.length > limit ? { snippet: text.slice(0, limit) + TRUNCATED, truncated: true } : { snippet: text, truncated: false };
}

export function buildAiInput(blueprint: Blueprint, pairing: Pairing, files: SourceFile[], limits: AiLimits = AI_LIMITS): AiInput {
  const nodeOf = new Map(blueprint.nodes.map((n) => [n.id, n]));
  const units = new Map<string, AiUnit>();
  let total = 0;
  const out: AiInput = { pairTasks: [], responsibilityTasks: [], units: [], omitted: { pairNodes: [], responsibilityNodes: [] } };

  /** 대상 하나에 필요한 조각을 모두 넣을 수 있으면 넣고 true. 하나라도 못 넣으면 아무것도 넣지 않는다 */
  const reserve = (refs: UnitRef[]): boolean => {
    const fresh: AiUnit[] = [];
    for (const u of refs) {
      if (units.has(unitKey(u)) || fresh.some((f) => unitKey(f) === unitKey(u))) continue;
      const s = extractSnippet(files, u, limits.perUnitChars);
      if (!s) return false;
      fresh.push({ path: u.path, name: u.name, kind: u.kind, ...s });
    }
    const added = fresh.reduce((n, f) => n + f.snippet.length, 0);
    if (units.size + fresh.length > limits.maxUnits || total + added > limits.totalChars) return false;
    for (const f of fresh) units.set(unitKey(f), f);
    total += added;
    return true;
  };

  // 1) 짝 제안: 후보가 있는 짝 확인 필요 노드(확인 필요 항목이 먼저)
  for (const r of pairing.reviews) {
    const node = nodeOf.get(r.nodeId);
    const candidates = r.candidates.slice(0, MAX_CANDIDATES).map((c) => c.unit);
    if (!node || !candidates.length) continue;
    if (!reserve(candidates)) {
      out.omitted.pairNodes.push(r.nodeName);
      continue;
    }
    out.pairTasks.push({ nodeId: r.nodeId, nodeName: r.nodeName, nodeKind: node.kind, responsibilities: node.responsibilities, props: node.props.map((p) => p.name), candidates: candidates.map(({ path, name }) => ({ path, name })) });
  }

  // 2) 책임 제안: 확실한 짝이 있고 책임이 적힌 노드
  for (const p of pairing.pairs) {
    const node = nodeOf.get(p.nodeId);
    if (!node || !node.responsibilities.length) continue;
    if (!reserve([p.unit])) {
      out.omitted.responsibilityNodes.push(p.nodeName);
      continue;
    }
    out.responsibilityTasks.push({ nodeId: p.nodeId, nodeName: p.nodeName, responsibilities: node.responsibilities, unit: { path: p.unit.path, name: p.unit.name } });
  }

  out.units = [...units.values()];
  return out;
}

/** 보낼 대상이 하나도 없는가(AI를 부르지 않는다) */
export const isEmptyAiInput = (i: AiInput) => i.pairTasks.length === 0 && i.responsibilityTasks.length === 0;
