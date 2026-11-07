import { fetchSummary, type UnitFact } from "../../code-model/facts";
import type { ComponentNode } from "../../schema/blueprint";
import { at, findingId, type Ctx, type Located } from "../context";
import { dirMatches } from "../match";
import type { Finding } from "../result";
import { byCodePoint, isNameSimilar, nameScore } from "../similarity";

// 공통 규칙 IC-03~IC-08, IC-12(스택과 무관). 확실한 짝이 있는 노드에만 쓴다. IC-01·IC-02(짝 없음·코드에만 있음)는 run.ts가 짝짓기 결과로 낸다.
// 판정은 분석기가 확인한 근거 안에서만 한다: 근거가 부족하면 확인 필요(review), 설계와 다른 근거를 확인하면 불일치(mismatch).

const IGNORED_PROPS = new Set(["children", "className", "key", "ref"]);

const certain = (rule: string, node: ComponentNode, key: string, severity: "error" | "warning" | "info", message: string, evidence: string[], itemIds: string[], extra: Partial<Finding> = {}): Finding => ({
  id: findingId(rule, node.id, key),
  rule,
  certainty: "certain",
  severity,
  node: node.name,
  nodeIds: [node.id],
  itemIds,
  message,
  evidence,
  ...extra,
});

const review = (rule: string, node: ComponentNode, key: string, kind: NonNullable<Finding["kind"]>, message: string, evidence: string[], itemIds: string[], extra: Partial<Finding> = {}): Finding => ({
  id: findingId(rule, node.id, key),
  rule,
  certainty: "review",
  kind,
  node: node.name,
  nodeIds: [node.id],
  itemIds,
  message,
  evidence,
  ...extra,
});

const itemId = (node: ComponentNode, key: string) => `${node.id}|${key}`;

/** IC-03 위치: 코드 파일의 폴더가 설계의 location.dir로 끝나는가 */
function location(ctx: Ctx, node: ComponentNode, { unit }: Located) {
  const ok = dirMatches(unit.path, node.location.dir);
  const ev = [`${at(unit.path, unit.line)} ${unit.name}의 폴더 ← 설계 위치 ${node.location.dir}`];
  if (ok) return ctx.mark(node.id, "location", "match", ev);
  const f = certain("IC-03", node, "location", "warning", `${node.name}는 ${node.location.dir}에 있어야 하는데 ${unit.path}에 있습니다.`, ev, [itemId(node, "location")]);
  ctx.add(f);
  ctx.mark(node.id, "location", "mismatch", ev, f.id);
}

/** 부모 코드가 이 노드의 코드를 렌더링(훅이면 호출)하는가: yes / no / 읽지 못해 알 수 없음(import 또는 lazy) */
function relation(ctx: Ctx, node: ComponentNode, child: Located, parent: Located): { kind: "yes" } | { kind: "no" } | { kind: "import"; via: string } | { kind: "lazy"; via: string } {
  const cu = child.unit;
  const pu = parent.unit;
  const isHook = node.kind === "hook";
  const sameFile = pu.path === cu.path;
  if (isHook) {
    if (pu.hooks.some((h) => h.name === cu.name && (h.path === cu.path || (h.path === null && sameFile)))) return { kind: "yes" };
  } else if (pu.rendered.some((r) => (r.path === cu.path && (r.name === cu.name || r.name === "default")) || (r.path === null && r.name === cu.name && sameFile))) {
    return { kind: "yes" };
  }
  // 못 풀었거나 읽지 못한 코드가 그 관계를 가렸을 수 있는 경우
  const lazy = parent.file.unreadable.find((u) => u.reason === "lazy" && u.resolved === cu.path);
  if (lazy && !isHook) return { kind: "lazy", via: lazy.target ?? "" };
  const unresolved = parent.file.imports.find((i) => i.resolved === null && i.kind !== "package" && !i.typeOnly && (i.names.includes(cu.name) || i.names.includes("default")));
  const used = isHook ? pu.hooks.some((h) => h.name === cu.name) : pu.rendered.some((r) => r.tag === cu.name || r.name === cu.name);
  if (unresolved && used) return { kind: "import", via: unresolved.spec };
  return { kind: "no" };
}

/** IC-04 부모-자식 */
function parentChild(ctx: Ctx, node: ComponentNode, child: Located) {
  const parentNode = ctx.parentOf(node);
  if (!parentNode) return;
  const key = "parent";
  const parentState = ctx.stateOf(parentNode.id);
  if (parentState !== "certain") {
    // 부모 짝이 확실하지 않으면 이 관계는 확인할 수 없다(부모의 결과 카드에 묶인다)
    const fid = parentState === "missing" ? findingId("IC-01", parentNode.id, "exists") : findingId("IC-01", parentNode.id, ctx.pairing.reviews.find((r) => r.nodeId === parentNode.id)?.reason.startsWith("unreadable") ? "unreadable" : "pair");
    return ctx.mark(node.id, key, "review", [`부모 ${parentNode.name}의 짝이 확실하지 않아 관계를 확인하지 못함`], fid);
  }
  const parent = ctx.located(parentNode.id)!;
  const r = relation(ctx, node, child, parent);
  const verb = node.kind === "hook" ? "호출" : "렌더링";
  const ev = [`${at(parent.unit.path, parent.unit.line)} ${parent.unit.name}가 ${child.unit.name}를 ${verb}하는지 확인`];
  if (r.kind === "yes") return ctx.mark(node.id, key, "match", ev);
  if (r.kind === "no") {
    const hookNote = node.kind === "hook" ? " (훅 사용 누락)" : "";
    const f = certain("IC-04", node, key, "warning", `${parentNode.name}가 ${node.name}를 ${verb}해야 하는데 하지 않습니다${hookNote}.`, ev, [itemId(node, key)]);
    ctx.add(f);
    return ctx.mark(node.id, key, "mismatch", ev, f.id);
  }
  const f = review("IC-04", node, key, r.kind === "import" ? "import" : "unreadable", `${parentNode.name}가 ${node.name}를 ${verb}하는지 ${r.kind === "import" ? "import 경로를 풀지 못해" : "lazy로 불러와"} 확인하지 못했습니다.`, [...ev, `읽지 못한 경로 ${r.via}`], [itemId(node, key)], { via: r.via });
  ctx.add(f);
  ctx.mark(node.id, key, "review", ev, f.id);
}

/** 이름이 비슷한 쌍을 찾는다: 이름 유사도 → 남은 것끼리 1:1. 쌍과 못 짝지은 쪽을 돌려준다 */
function pairByName(design: string[], code: string[]) {
  const freeCode = [...code];
  const pairs: [string, string][] = [];
  const left: string[] = [];
  for (const d of design) {
    const best = freeCode.map((c) => ({ c, s: nameScore(d, c, false) })).filter((x) => isNameSimilar(x.s)).sort((a, b) => b.s - a.s || byCodePoint(a.c, b.c))[0];
    if (best) {
      pairs.push([d, best.c]);
      freeCode.splice(freeCode.indexOf(best.c), 1);
    } else left.push(d);
  }
  if (left.length === 1 && freeCode.length === 1) {
    pairs.push([left[0], freeCode[0]]);
    return { pairs, missing: [] as string[], extra: [] as string[] };
  }
  return { pairs, missing: left, extra: freeCode };
}

/** IC-05 상태: 같은 이름이 다른 곳에 있으면 위치 다름 한 건, 이름이 비슷하면 확인 필요, 없으면 누락 */
function states(ctx: Ctx, node: ComponentNode, { unit }: Located, movedIn: Set<string>) {
  const design = node.state.map((s) => s.name);
  const exact = design.filter((s) => unit.state.includes(s));
  for (const s of exact) ctx.mark(node.id, `state:${s}`, "match", [`${at(unit.path, unit.line)} 상태 ${s} 있음`]);
  const missingNames = design.filter((s) => !unit.state.includes(s));
  const free = unit.state.filter((c) => !design.includes(c) && !movedIn.has(`${unit.path}#${unit.name}#${c}`));
  const remaining: string[] = [];
  for (const s of missingNames) {
    const other = ctx.allUnits().find((u) => u.unit !== unit && u.unit.state.includes(s));
    const key = `state:${s}`;
    // 이 코드가 직접 부르는 훅 안에 상태가 있으면 그 상태는 이 코드의 상태로 본다(상태를 훅으로 뽑아낸 구현)
    const viaHook = other && unit.hooks.some((h) => h.name === other.unit.name && h.path === other.unit.path);
    if (other && viaHook) {
      ctx.mark(node.id, key, "match", [`${at(other.unit.path, other.unit.line)} ${unit.name}가 부르는 훅 ${other.unit.name} 안에 상태 ${s}이(가) 있음`]);
    } else if (other) {
      const ev = [`${at(other.unit.path, other.unit.line)} ${other.unit.name}에 상태 ${s}이(가) 있음`];
      const f = certain("IC-05", node, key, "warning", `상태 ${s}은(는) ${node.name}에 있어야 하는데 ${other.unit.name}에 있습니다(위치 다름).`, ev, [itemId(node, key)]);
      ctx.add(f);
      ctx.mark(node.id, key, "mismatch", ev, f.id);
    } else remaining.push(s);
  }
  const r = pairByName(remaining, free);
  for (const [d, c] of r.pairs) {
    const key = `state:${d}`;
    const ev = [`${at(unit.path, unit.line)} 설계 상태 ${d} ↔ 코드 상태 ${c}`];
    const f = review("IC-05", node, key, "state", `설계의 상태 ${d}이(가) 코드의 ${c}와 같은 것인지 확인이 필요합니다.`, ev, [itemId(node, key)], { design: d, candidate: c });
    ctx.add(f);
    ctx.mark(node.id, key, "review", ev, f.id);
  }
  for (const d of r.missing) {
    const key = `state:${d}`;
    const ev = [`${at(unit.path, unit.line)} ${unit.name}의 상태: ${unit.state.join(", ") || "없음"}`];
    const f = certain("IC-05", node, key, "warning", `상태 ${d}이(가) ${node.name}에 없습니다(누락).`, ev, [itemId(node, key)]);
    ctx.add(f);
    ctx.mark(node.id, key, "mismatch", ev, f.id);
  }
  for (const c of r.extra) {
    ctx.add(certain("IC-05", node, `extra-state:${c}`, "info", `상태 ${c}은(는) 설계에 없습니다(코드에만 있음).`, [`${at(unit.path, unit.line)} ${unit.name}의 상태 ${c}`], [], { outsideDesign: true }));
  }
}

/** IC-06 props: 이름이 비슷하면 확인 필요, 없으면 누락, 설계에 없는 props는 경고(설계 밖) */
function props(ctx: Ctx, node: ComponentNode, { unit }: Located) {
  const events = new Set(node.events);
  const design = node.props.map((p) => p.name);
  const code = unit.props.map((p) => p.name).filter((n) => !IGNORED_PROPS.has(n) && !events.has(n));
  for (const d of design.filter((p) => code.includes(p))) ctx.mark(node.id, `prop:${d}`, "match", [`${at(unit.path, unit.line)} props ${d} 있음`]);
  const r = pairByName(
    design.filter((p) => !code.includes(p)),
    code.filter((c) => !design.includes(c)),
  );
  for (const [d, c] of r.pairs) {
    const key = `prop:${d}`;
    const ev = [`${at(unit.path, unit.line)} 설계 props ${d} ↔ 코드 props ${c}`];
    const f = review("IC-06", node, key, "prop", `설계의 props ${d}이(가) 코드의 ${c}와 같은 것인지 확인이 필요합니다.`, ev, [itemId(node, key)], { design: d, candidate: c });
    ctx.add(f);
    ctx.mark(node.id, key, "review", ev, f.id);
  }
  for (const d of r.missing) {
    const key = `prop:${d}`;
    const ev = [`${at(unit.path, unit.line)} ${unit.name}의 props: ${unit.props.map((p) => p.name).join(", ") || "없음"}`];
    const f = certain("IC-06", node, key, "warning", `props ${d}이(가) ${node.name}에 없습니다.`, ev, [itemId(node, key)]);
    ctx.add(f);
    ctx.mark(node.id, key, "mismatch", ev, f.id);
  }
  for (const c of r.extra) {
    ctx.add(certain("IC-06", node, `extra-prop:${c}`, "warning", `props ${c}은(는) 설계에 없습니다.`, [`${at(unit.path, unit.line)} ${unit.name}의 props ${c}`], [], { outsideDesign: true }));
  }
}

/** IC-07 이벤트: 설계의 이벤트 이름이 on* props나 JSX 속성으로 있는가 */
function events(ctx: Ctx, node: ComponentNode, { unit }: Located) {
  const attrs = new Set(unit.elements.flatMap((e) => e.eventAttrs));
  for (const e of node.events) {
    const key = `event:${e}`;
    const has = unit.eventProps.includes(e) || attrs.has(e);
    const ev = [`${at(unit.path, unit.line)} ${unit.name}의 이벤트 props: ${unit.eventProps.join(", ") || "없음"}, JSX 이벤트 속성: ${[...attrs].join(", ") || "없음"}`];
    if (has) {
      ctx.mark(node.id, key, "match", ev);
      continue;
    }
    const f = certain("IC-07", node, key, "warning", `이벤트 ${e}이(가) ${node.name}에 없습니다.`, ev, [itemId(node, key)]);
    ctx.add(f);
    ctx.mark(node.id, key, "mismatch", ev, f.id);
  }
}

/** 이 코드가 부르는 훅 중 조회 호출이 든 것 */
function fetchingHooks(ctx: Ctx, unit: UnitFact): string[] {
  return unit.hooks
    .filter((h) => h.path && ctx.unit(h.path, h.name)?.unit.fetchCalls.length)
    .map((h) => h.name)
    .sort(byCodePoint);
}

/** IC-08 서버 통신: 설계의 조회 담당 여부와 코드의 호출(조회·변경을 합쳐 비교, 유형은 근거에 보인다) */
function fetch(ctx: Ctx, node: ComponentNode, { unit }: Located) {
  const key = "fetch";
  const sum = fetchSummary(unit);
  const calls = unit.fetchCalls.map((c) => `${c.callee}(${c.kind}) ${at(unit.path, c.line)}`);
  const ev = [`${unit.name}의 서버 통신: ${sum ?? "없음"}${calls.length ? ` · ${calls.join(", ")}` : ""}`];
  if (node.dataFetch) {
    if (sum && sum !== "UNKNOWN") return ctx.mark(node.id, key, "match", ev);
    if (sum === "UNKNOWN") {
      const f = review("IC-08", node, key, "fetch-kind", `${node.name}의 서버 통신은 있지만 조회인지 변경인지 코드만으로 알 수 없습니다.`, ev, [itemId(node, key)]);
      ctx.add(f);
      return ctx.mark(node.id, key, "review", ev, f.id);
    }
    const hooks = fetchingHooks(ctx, unit);
    if (hooks.length) {
      const f = review("IC-08", node, key, "fetch", `${node.name}는 직접 조회하지 않고 훅(${hooks.join(", ")}) 안에서 조회합니다. 조회 담당이 맞는지 확인이 필요합니다.`, [...ev, `조회가 든 훅: ${hooks.join(", ")}`], [itemId(node, key)], { via: hooks[0] });
      ctx.add(f);
      return ctx.mark(node.id, key, "review", ev, f.id);
    }
    const f = certain("IC-08", node, key, "warning", `${node.name}는 서버 통신을 맡아야 하는데 조회·변경 호출이 없습니다.`, ev, [itemId(node, key)]);
    ctx.add(f);
    return ctx.mark(node.id, key, "mismatch", ev, f.id);
  }
  if (!sum) return ctx.mark(node.id, key, "match", ev);
  if (sum === "UNKNOWN") {
    const f = review("IC-08", node, key, "fetch-kind", `${node.name}에 서버 통신 호출이 있는데 어떤 종류인지 알 수 없어 서버 통신을 맡지 않는다는 설계와 맞는지 확인이 필요합니다.`, ev, [itemId(node, key)]);
    ctx.add(f);
    return ctx.mark(node.id, key, "review", ev, f.id);
  }
  const f = certain("IC-08", node, key, "warning", `${node.name}는 서버 통신을 맡지 않는데 코드에 호출이 있습니다.`, ev, [itemId(node, key)]);
  ctx.add(f);
  ctx.mark(node.id, key, "mismatch", ev, f.id);
}

/** IC-12 인라인 style 금지(금지 규칙 항목) */
function inlineStyle(ctx: Ctx, node: ComponentNode, { unit }: Located) {
  if (node.kind === "hook") return;
  const hit = unit.elements.filter((e) => e.inlineStyle);
  if (!hit.length) return ctx.markBan(node.id, "inline-style", "ok", [`${at(unit.path, unit.line)} ${unit.name}의 요소에 style 속성이 없음`]);
  const ev = hit.map((e) => `${at(unit.path, e.line)} <${e.tag}>에 style 속성`);
  const f = certain("IC-12", node, "inline-style", "warning", `${node.name}에 인라인 style이 있습니다.`, ev, []);
  ctx.add(f);
  ctx.markBan(node.id, "inline-style", "violated", ev, f.id);
}

/** 확실한 짝이 있는 노드마다 공통 규칙을 돌린다 */
export function commonRules(ctx: Ctx) {
  // 상태가 다른 코드로 옮겨진 경우, 옮겨 간 쪽의 "설계에 없는 상태" 정보를 따로 내지 않는다(위치 다름 한 건으로 묶는다)
  const movedIn = new Set<string>();
  for (const node of ctx.nodes) {
    const loc = ctx.located(node.id);
    if (!loc) continue;
    for (const s of node.state) {
      if (loc.unit.state.includes(s.name)) continue;
      const other = ctx.allUnits().find((u) => u.unit !== loc.unit && u.unit.state.includes(s.name));
      if (other) movedIn.add(`${other.unit.path}#${other.unit.name}#${s.name}`);
    }
  }
  for (const node of ctx.nodes) {
    const loc = ctx.located(node.id);
    if (!loc) continue;
    ctx.mark(node.id, "exists", "match", [`${at(loc.unit.path, loc.unit.line)} ${loc.unit.name} ← ${ctx.pairing.pairOf(node.id)!.evidence[0]?.detail ?? "짝"}`]);
    location(ctx, node, loc);
    parentChild(ctx, node, loc);
    states(ctx, node, loc, movedIn);
    props(ctx, node, loc);
    events(ctx, node, loc);
    fetch(ctx, node, loc);
    inlineStyle(ctx, node, loc);
  }
}
