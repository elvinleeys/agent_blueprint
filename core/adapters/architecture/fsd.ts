import { nodeMap } from "../../rules/helpers";
import type { Rule, Violation } from "../../rules/types";
import type { ComponentNode } from "../../schema/blueprint";

const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"] as const;
const SLICED = new Set(["pages", "widgets", "features", "entities"]);

/** `계층/슬라이스/세그먼트` 또는 `계층/세그먼트`를 나눈다(형식은 스키마가 보장하지만 읽을 수 없으면 null) */
function parseDir(dir: string) {
  const parts = dir.split("/");
  const rank = LAYERS.indexOf(parts[0] as (typeof LAYERS)[number]);
  if (rank < 0) return null;
  return { layer: parts[0], rank, slice: SLICED.has(parts[0]) ? parts[1] : null, segment: parts[parts.length - 1] };
}

function pairs(bp: Parameters<Rule>[0], visit: (child: ComponentNode, parent: ComponentNode) => Violation | null): Violation[] {
  const map = nodeMap(bp);
  return bp.nodes.flatMap((child) => {
    const parent = child.parentId === null ? undefined : map.get(child.parentId);
    const v = parent ? visit(child, parent) : null;
    return v ? [v] : [];
  });
}

/** AR-01 오류: 자식이 부모보다 위 계층 (위 계층을 가져오는 import 방향 위반) */
export const ar01: Rule = (bp) =>
  pairs(bp, (c, p) => {
    const cl = parseDir(c.location.dir);
    const pl = parseDir(p.location.dir);
    if (!cl || !pl || cl.rank >= pl.rank) return null;
    return { ruleId: "AR-01", severity: "error", nodeIds: [c.id, p.id], message: `${c.name}(${cl.layer})이(가) 부모 ${p.name}(${pl.layer})보다 위 계층입니다. 아래 계층이 위 계층을 가져올 수 없습니다.` };
  });

/** AR-02 오류: 같은 계층의 다른 슬라이스를 자식으로 가짐 (app·shared는 슬라이스가 없어 제외) */
export const ar02: Rule = (bp) =>
  pairs(bp, (c, p) => {
    const cl = parseDir(c.location.dir);
    const pl = parseDir(p.location.dir);
    if (!cl || !pl || cl.layer !== pl.layer || cl.slice === null || cl.slice === pl.slice) return null;
    return { ruleId: "AR-02", severity: "error", nodeIds: [c.id, p.id], message: `${p.name}(${pl.layer}/${pl.slice})이(가) 같은 계층의 다른 슬라이스 ${c.name}(${cl.layer}/${cl.slice})을(를) 자식으로 가집니다.` };
  });

/** AR-03 경고: kind와 계층·세그먼트 불일치 (page≠pages, hook≠model·api·lib, 그 외≠ui) */
export const ar03: Rule = (bp) =>
  bp.nodes.flatMap((n): Violation[] => {
    const loc = parseDir(n.location.dir);
    if (!loc) return [];
    let problem: string | null = null;
    if (n.kind === "page") {
      if (loc.layer !== "pages") problem = "페이지는 pages 계층에 두어야 합니다";
    } else if (n.kind === "hook") {
      if (!["model", "api", "lib"].includes(loc.segment)) problem = "훅은 model·api·lib 세그먼트에 두어야 합니다";
    } else if (loc.segment !== "ui") {
      problem = "화면 컴포넌트는 ui 세그먼트에 두어야 합니다";
    }
    return problem ? [{ ruleId: "AR-03", severity: "warning", nodeIds: [n.id], message: `${n.name}의 위치 ${n.location.dir}: ${problem}.` }] : [];
  });

export const fsdRules: Rule[] = [ar01, ar02, ar03];
