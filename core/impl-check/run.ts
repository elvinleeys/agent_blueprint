import { cssRules } from "../adapters/styling/impl-css";
import { tailwindRules } from "../adapters/styling/impl-tailwind";
import { nextRules } from "../adapters/framework/impl-next";
import { reactRules } from "../adapters/framework/impl-react";
import { fsdRules } from "../adapters/architecture/impl-fsd";
import type { CodeModel } from "../code-model/facts";
import type { Blueprint } from "../schema/blueprint";
import { Ctx, findingId } from "./context";
import { nodeBanKeys, nodeItemKeys } from "./items";
import { matchBlueprint } from "./match";
import { commonRules } from "./rules/common";
import { OUT_OF_SCOPE, type BanItem, type BanStatus, type DesignItem, type Finding, type ImplCheckResult, type ItemStatus } from "./result";
import { byCodePoint } from "./similarity";
import type { Pairing } from "./types";

// 구현 검사 실행: 짝짓기 → (짝 없는·짝 확인 필요 노드의 항목 정하기) → 공통 규칙 → 스택 어댑터 규칙 → 집계.
// 모든 판정은 분석기가 확인한 근거 안에서만 한다. AI를 부르지 않고 같은 입력이면 같은 결과·같은 id를 낸다.

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** 코드에 없는 노드와 짝 확인 필요 노드: 항목은 전부 불일치/확인 필요, 금지 규칙은 확인 불가. 결과 카드는 노드마다 한 장 */
function nodeLevel(ctx: Ctx, pairing: Pairing) {
  for (const m of pairing.missing) {
    const node = ctx.byId.get(m.nodeId)!;
    const keys = nodeItemKeys(ctx.bp, node);
    const f: Finding = {
      id: findingId("IC-01", node.id, "exists"),
      rule: "IC-01",
      certainty: "certain",
      severity: "warning",
      node: node.name,
      nodeIds: [node.id],
      itemIds: keys.map((k) => `${node.id}|${k}`),
      message: `설계의 ${node.name}가 코드에 없습니다.`,
      evidence: [`${node.location.dir} 아래에서 이름이 같거나 비슷한 컴포넌트를 찾지 못함`],
    };
    ctx.add(f);
    for (const k of keys) ctx.mark(node.id, k, "mismatch", ["코드에 없음"], f.id);
    for (const k of nodeBanKeys(node)) ctx.markBan(node.id, k, "unknown", ["코드에 없는 노드라 확인할 수 없음"], f.id);
  }
  for (const r of pairing.reviews) {
    const node = ctx.byId.get(r.nodeId)!;
    const unread = r.reason === "unreadable-named-path" || r.reason === "unreadable-unknown-target";
    const key = unread ? "unreadable" : "pair";
    const first = r.candidates[0];
    const kinds = first?.evidence.map((e) => e.kind) ?? [];
    const via = r.reason === "same-name-ambiguous" ? "같은 이름 여러 개" : r.reason === "unreadable-named-path" ? r.via : kinds.includes("file-name") ? "파일 이름" : kinds.includes("route") ? "화면 주소" : undefined;
    const keys = nodeItemKeys(ctx.bp, node);
    const text = {
      candidate: `${node.name}의 짝이 ${first ? first.unit.name : "?"}인지 확인이 필요합니다.`,
      "same-name-ambiguous": `${node.name}와 같은 이름의 코드가 여러 곳에 있어 어느 것인지 특정하지 못했습니다.`,
      "unreadable-named-path": `${node.name}가 보이는 경로(${r.via})의 파일을 읽지 못해 짝을 확정하지 못했습니다.`,
      "unreadable-unknown-target": `${node.name}의 짝을 찾지 못했고 경로를 알 수 없는 import가 있어 코드에 없다고 확정하지 못했습니다.`,
    }[r.reason];
    const f: Finding = {
      id: findingId("IC-01", node.id, key),
      rule: "IC-01",
      certainty: "review",
      kind: unread ? "unreadable" : "pair",
      node: node.name,
      nodeIds: [node.id],
      itemIds: keys.map((k) => `${node.id}|${k}`),
      message: text,
      evidence: r.evidence.map((e) => e.detail),
      ...(r.reason === "candidate" && first ? { candidate: first.unit.name } : {}),
      ...(via ? { via } : {}),
    };
    ctx.add(f);
    for (const k of keys) ctx.mark(node.id, k, "review", r.evidence.map((e) => e.detail), f.id);
    for (const k of nodeBanKeys(node)) ctx.markBan(node.id, k, "unknown", ["짝이 확실하지 않아 확인할 수 없음"], f.id);
  }
}

/** IC-02: 코드에만 있는 내보낸 컴포넌트(설계에 없는 발견). 화면 주소를 맡는 page.tsx 안의 컴포넌트는 프레임워크 라우팅 파일이라 제외한다 */
function extras(ctx: Ctx, pairing: Pairing) {
  const routeFiles = new Set(ctx.model.files.filter((f) => f.routes.some((r) => r.router === "next-app")).map((f) => f.path));
  for (const u of pairing.extraUnits) {
    if (u.kind !== "component" || routeFiles.has(u.path)) continue;
    ctx.add({
      id: findingId("IC-02", "-", `${u.name}@${u.path}`),
      rule: "IC-02",
      certainty: "certain",
      severity: "info",
      node: u.name,
      nodeIds: [],
      itemIds: [],
      message: `${u.name}는 설계에 없는 컴포넌트입니다(코드에만 있음).`,
      evidence: [`${u.path} 에서 내보냄`],
      outsideDesign: true,
    });
  }
}

const worst = (list: { status: ItemStatus }[]): ItemStatus => (list.some((c) => c.status === "mismatch") ? "mismatch" : list.some((c) => c.status === "review") ? "review" : "match");
const worstBan = (list: { status: BanStatus }[]): BanStatus => (list.some((c) => c.status === "violated") ? "violated" : list.some((c) => c.status === "unknown") ? "unknown" : "ok");

export function checkImplementation(bp: Blueprint, model: CodeModel): ImplCheckResult & { pairing: Pairing } {
  const pairing = matchBlueprint(bp, model);
  const ctx = new Ctx(bp, model, pairing);

  nodeLevel(ctx, pairing);
  commonRules(ctx);
  const { framework, styling, architecture } = bp.stack;
  if (framework === "next") nextRules(ctx);
  if (framework === "react") reactRules(ctx);
  if (styling === "tailwind") tailwindRules(ctx);
  else cssRules(ctx);
  if (architecture === "fsd") fsdRules(ctx);
  extras(ctx, pairing);

  const items: DesignItem[] = [];
  const bans: BanItem[] = [];
  for (const node of bp.nodes) {
    for (const key of nodeItemKeys(bp, node)) {
      const id = `${node.id}|${key}`;
      const contribs = ctx.itemContribs.get(id) ?? [];
      items.push({
        id,
        nodeId: node.id,
        nodeName: node.name,
        key,
        status: contribs.length ? worst(contribs) : "review",
        findingIds: [...new Set(contribs.map((c) => c.findingId).filter((x): x is string => !!x))],
        evidence: contribs.length ? contribs.flatMap((c) => c.evidence) : ["판정한 규칙이 없음"],
      });
    }
    for (const key of nodeBanKeys(node)) {
      const id = `${node.id}|${key}`;
      const contribs = ctx.banContribs.get(id) ?? [];
      bans.push({
        id,
        nodeId: node.id,
        nodeName: node.name,
        key,
        status: contribs.length ? worstBan(contribs) : "unknown",
        findingIds: [...new Set(contribs.map((c) => c.findingId).filter((x): x is string => !!x))],
        evidence: contribs.length ? contribs.flatMap((c) => c.evidence) : ["판정한 규칙이 없음"],
      });
    }
  }

  // 항목은 id 순으로 정렬한다(설계도의 노드 순서가 달라도 같은 결과)
  items.sort((a, b) => byCodePoint(a.id, b.id));
  bans.sort((a, b) => byCodePoint(a.id, b.id));

  // 결과 카드: 확실(오류 → 경고 → 정보) 다음 확인 필요. 같은 입력이면 같은 순서
  const findings = [...ctx.findings].sort((a, b) => {
    if (a.certainty !== b.certainty) return a.certainty === "certain" ? -1 : 1;
    const sev = a.certainty === "certain" ? SEVERITY_ORDER[a.severity!] - SEVERITY_ORDER[b.severity!] : 0;
    return sev || byCodePoint(a.rule, b.rule) || byCodePoint(a.node, b.node) || byCodePoint(a.id, b.id);
  });

  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  return {
    pairing,
    items,
    bans,
    findings,
    summary: {
      design: { total: items.length, match: count("match"), mismatch: count("mismatch"), review: count("review") },
      ban: { violated: bans.filter((b) => b.status === "violated").length, unknown: bans.filter((b) => b.status === "unknown").length },
      outsideDesign: findings.filter((f) => f.outsideDesign).length,
      outOfScope: OUT_OF_SCOPE,
    },
  };
}
