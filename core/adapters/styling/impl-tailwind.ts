import { classState, type ElementFact } from "../../code-model/facts";
import type { ClassInfo } from "../../code-model/class-names";
import { at, findingId, type Ctx } from "../../impl-check/context";
import type { Finding } from "../../impl-check/result";
import { expectedLayoutClasses, expectedSpanClasses, judgedTokens } from "../../impl-check/tailwind-classes";
import type { ComponentNode } from "../../schema/blueprint";

// Tailwind 구현 검사: 배치·자리(IC-09), 토큰(IC-10), 바깥 여백(IC-11). 노드의 맨 바깥 요소 className을 읽어 판정한다.
// 클래스마다 항상(ALWAYS) 있으면 일치, 없음(ABSENT)이면 불일치, 조건부(CONDITIONAL)·읽지 못함(DYNAMIC)이면 확인 필요다.
// 같은 요소에 읽지 못한 부분이 있으면 "없음"으로 확정하지 않는다.

type Verdict = { status: "match" | "mismatch" | "review"; notes: string[] };

/** 기대 클래스를 모두 보고 한 판정으로 합친다: 없는 것이 있으면 불일치, 없는 것은 없지만 확정하지 못한 것이 있으면 확인 필요 */
function judge(root: ElementFact | undefined, expected: string[]): Verdict {
  if (!root) return { status: "review", notes: ["맨 바깥 요소를 읽지 못함"] };
  const states = expected.map((c) => [c, classState(root.className, c)] as const);
  const notes = states.map(([c, s]) => `${c}: ${s}`);
  if (states.some(([, s]) => s === "ABSENT")) return { status: "mismatch", notes };
  if (states.some(([, s]) => s !== "ALWAYS")) return { status: "review", notes };
  return { status: "match", notes };
}

const classesOf = (info: ClassInfo | null) => [...(info?.always ?? []), ...(info?.conditional ?? [])];
const MARGIN = /^-?m[trblxyse]?-/;
const isOuterMargin = (c: string) => MARGIN.test(c) && c !== "mx-auto";

const finding = (rule: string, node: ComponentNode, key: string, certain: boolean, message: string, evidence: string[], itemIds: string[]): Finding => ({
  id: findingId(rule, node.id, key),
  rule,
  certainty: certain ? "certain" : "review",
  ...(certain ? { severity: "warning" as const } : { kind: "style" as const }),
  node: node.name,
  nodeIds: [node.id],
  itemIds,
  message,
  evidence,
});

export function tailwindRules(ctx: Ctx) {
  for (const node of ctx.nodes) {
    const loc = ctx.located(node.id);
    if (!loc || node.kind === "hook") continue;
    const { unit } = loc;
    const root = unit.elements.find((e) => e.root);
    const where = at(unit.path, root?.line ?? unit.line);

    // IC-09 배치(자식을 놓는 방식)와 자리(그리드 안에서 차지하는 칸): 카드는 노드마다 한 장
    const layoutItems: { key: string; v: Verdict }[] = [];
    if (node.layout) layoutItems.push({ key: "layout", v: judge(root, expectedLayoutClasses(node.layout)) });
    const parent = ctx.parentOf(node);
    if (node.placement && parent?.layout) layoutItems.push({ key: "placement", v: judge(root, expectedSpanClasses(parent.layout, node.placement.span)) });
    if (layoutItems.length) {
      const bad = layoutItems.filter((i) => i.v.status === "mismatch");
      const unsure = layoutItems.filter((i) => i.v.status === "review");
      let f: Finding | undefined;
      if (bad.length) f = finding("IC-09", node, "style", true, `${node.name}의 ${bad.map((i) => (i.key === "layout" ? "배치" : "자리")).join("·")} 클래스가 설계와 다릅니다.`, bad.flatMap((i) => i.v.notes.map((n) => `${where} ${n}`)), bad.map((i) => `${node.id}|${i.key}`));
      else if (unsure.length) f = finding("IC-09", node, "style", false, `${node.name}의 배치 클래스가 조건부이거나 읽지 못한 값이라 설계와 같은지 확인이 필요합니다.`, unsure.flatMap((i) => i.v.notes.map((n) => `${where} ${n}`)), unsure.map((i) => `${node.id}|${i.key}`));
      if (f) ctx.add(f);
      for (const i of layoutItems) ctx.mark(node.id, i.key, i.v.status, i.v.notes.map((n) => `${where} ${n}`), i.v.status === "match" ? undefined : f?.id);
    }

    // IC-10 토큰: 임의값(대괄호)은 불일치, 기본 색·간격 클래스나 읽지 못한 값은 확인 필요
    const tokens = judgedTokens(node);
    if (tokens.length) {
      const results = tokens.map((t) => {
        const state = classState(root?.className ?? null, t.cls);
        const same = classesOf(root?.className ?? null).filter((c) => c.startsWith(`${t.prefix}-`));
        const arbitrary = same.filter((c) => c.includes("["));
        const status: Verdict["status"] = state === "ALWAYS" ? "match" : arbitrary.length ? "mismatch" : "review";
        const note = `${t.property}: 기대 ${t.cls} (${state})${same.length ? ` · 같은 접두사 클래스 ${same.join(" ")}` : ""}`;
        return { key: `token:${t.property}`, status, note };
      });
      const bad = results.filter((r) => r.status === "mismatch");
      const unsure = results.filter((r) => r.status === "review");
      let f: Finding | undefined;
      if (bad.length) f = finding("IC-10", node, "token", true, `${node.name}가 토큰 대신 임의값을 씁니다(${bad.map((r) => r.key.slice(6)).join(", ")}).`, bad.map((r) => `${where} ${r.note}`), bad.map((r) => `${node.id}|${r.key}`));
      else if (unsure.length) f = finding("IC-10", node, "token", false, `${node.name}의 토큰 클래스를 확인하지 못했습니다(${unsure.map((r) => r.key.slice(6)).join(", ")}). 기본 색·간격 클래스를 쓰거나 조건부·읽지 못한 값입니다.`, unsure.map((r) => `${where} ${r.note}`), unsure.map((r) => `${node.id}|${r.key}`));
      if (f) ctx.add(f);
      for (const r of results) ctx.mark(node.id, r.key, r.status, [`${where} ${r.note}`], r.status === "match" ? undefined : f?.id);
    }

    // IC-11 바깥 여백(금지 규칙): 설계가 바깥 여백을 갖지 않는다고 했는데 맨 바깥 요소에 margin 클래스가 있으면 위반
    if (node.style) {
      if (node.style.ownsOuterSpacing) ctx.markBan(node.id, "outer-spacing", "ok", ["설계가 바깥 여백을 직접 갖는다고 정함"]);
      else {
        const always = (root?.className?.always ?? []).filter(isOuterMargin);
        const cond = (root?.className?.conditional ?? []).filter(isOuterMargin);
        if (always.length) {
          const ev = [`${where} margin 클래스 ${always.join(" ")}`];
          const f = finding("IC-11", node, "outer-spacing", true, `${node.name}가 바깥 여백(${always.join(" ")})을 직접 갖고 있습니다.`, ev, []);
          ctx.add(f);
          ctx.markBan(node.id, "outer-spacing", "violated", ev, f.id);
        } else if (cond.length || root?.className?.dynamic || !root) {
          ctx.markBan(node.id, "outer-spacing", "unknown", [`${where} 조건부 또는 읽지 못한 클래스가 있어 바깥 여백을 확정하지 못함`]);
        } else ctx.markBan(node.id, "outer-spacing", "ok", [`${where} margin 클래스 없음`]);
      }
    }
  }
}
