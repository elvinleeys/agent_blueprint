import { unreadableScope, type CodeModel, type FileFact, type UnitFact } from "../code-model/facts";
import { dirOf } from "../code-model/path-utils";
import { normalizeRoute } from "../code-model/routes";
import type { Blueprint, ComponentNode } from "../schema/blueprint";
import { byCodePoint, isNameSimilar, isPropsSimilar, nameScore, propsScore, sharesWord } from "./similarity";
import type { CandidateEntry, CertainPair, Evidence, PairReview, Pairing, UnitRef } from "./types";

// 설계 노드 ↔ 코드 컴포넌트·훅 짝짓기. 규칙은 스펙 tasks/spec-implementation-check.md §6-1.
// - 확실: 이름이 정확히 같거나 대소문자만 다르고 종류(컴포넌트·훅)가 같음. 같은 이름이 여러 개면 파일 위치로 특정, 못 하면 확인 필요
// - 후보: 이름 유사도·위치·화면 주소·파일 이름 근거. 후보는 "짝 확인 필요" 한 건만 내고 이후 검사를 하지 않는다
// - 읽지 못한 코드: 경로에 노드 이름이 보이는 읽지 못한 파일이 있으면 확실한 짝도 낮추고, import(변수)는 "코드에 없음"만 확인 필요로 보낸다
// 같은 입력이면 같은 결과: 코드 단위는 (경로, 이름), 노드는 (이름, id) 코드 포인트 순으로 정렬해 처리하므로 입력 파일 순서에 영향받지 않는다.

type Unit = { fact: UnitFact; file: FileFact; key: string };
type Edge = { node: ComponentNode; unit: Unit; evidence: Evidence[]; strength: number; nameJ: number; propsJ: number };

const ALIAS_LIKE = /^(@|~|#)\//;
const EXT = /\.(tsx?|jsx?)$/;

const refOf = (u: UnitFact): UnitRef => ({ name: u.name, path: u.path, kind: u.kind, exported: u.exported, nameSource: u.nameSource });
const keyOf = (u: { path: string; name: string }) => `${u.path}#${u.name}`;
const base = (path: string) => path.split("/").pop() ?? path;
const sameKind = (n: ComponentNode, u: UnitFact) => (n.kind === "hook") === (u.kind === "hook");
/** 코드 파일의 폴더가 설계의 location.dir로 끝나는가(폴더 이름이 앞에 붙은 업로드를 허용하는 접미사 일치) */
export const dirMatches = (path: string, dir: string) => {
  const d = dirOf(path);
  return d === dir || d.endsWith(`/${dir}`);
};

/** 설계의 화면 주소(`/products/[id]`·`/products/:id`)를 공통 형식(`/products/:id`)으로 */
export function designRoute(route: string | null): string | null {
  if (!route) return null;
  const segs = route.split("/").filter(Boolean).map((s) => {
    const optionalCatchAll = /^\[\[\.\.\.(.+)\]\]$/.exec(s);
    const catchAll = /^\[\.\.\.(.+)\]$/.exec(s);
    const dynamic = /^\[(.+)\]$/.exec(s);
    return optionalCatchAll ? "*?" : catchAll ? "*" : dynamic ? `:${dynamic[1]}` : s;
  });
  return normalizeRoute(segs.join("/"));
}

/** 읽지 못한 경로: 파일을 올리지 않았거나 풀지 못한 import·lazy·동적 import(경로가 글자로 적힌 것) */
type UnreadablePath = { spec: string; from: string };

function unreadablePaths(model: CodeModel): UnreadablePath[] {
  const out: UnreadablePath[] = [];
  for (const f of model.files) {
    for (const i of f.imports) if (i.kind !== "package" && i.resolved === null && !i.typeOnly) out.push({ spec: i.spec, from: f.path });
    for (const u of f.unreadable) if ((u.reason === "lazy" || u.reason === "dynamic-import") && u.target && u.resolved === null && (u.target.startsWith(".") || ALIAS_LIKE.test(u.target))) out.push({ spec: u.target, from: f.path });
  }
  return out;
}

/** 경로 글자에 노드 이름이 한 구간으로 보이는가(대소문자 무시, 확장자 무시) */
const pathShowsName = (spec: string, name: string) =>
  spec.split("/").some((seg) => seg && seg !== "." && seg !== ".." && !ALIAS_LIKE.test(`${seg}/`) && seg.replace(EXT, "").toLowerCase() === name.toLowerCase());

/** 별칭을 못 풀었을 뿐 올린 파일 중에 같은 끝 경로의 파일이 있으면 그 파일을 가리킨다고 본다(상대 경로는 정확히 풀리므로 해당 없음) */
function aliasTargetUploaded(spec: string, uploaded: string[]): boolean {
  if (spec.startsWith(".")) return false;
  const rest = spec.replace(ALIAS_LIKE, "");
  return uploaded.some((p) => [`${rest}.ts`, `${rest}.tsx`, `${rest}/index.ts`, `${rest}/index.tsx`].some((s) => p === s || p.endsWith(`/${s}`)));
}

export function matchBlueprint(bp: Blueprint, model: CodeModel): Pairing {
  const nodes = [...bp.nodes].sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.id, b.id));
  const files = [...model.files].sort((a, b) => byCodePoint(a.path, b.path));
  const units: Unit[] = files
    .flatMap((file) => file.units.map((fact) => ({ fact, file, key: keyOf(fact) })))
    .sort((a, b) => byCodePoint(a.fact.path, b.fact.path) || byCodePoint(a.fact.name, b.fact.name));
  const unitByKey = new Map(units.map((u) => [u.key, u]));
  const uploadedPaths = files.map((f) => f.path);

  /** 짝·확인 필요에 쓰인 코드 단위(다른 노드가 가져가지 못하게 한다) */
  const claimed = new Set<string>();
  const done = new Set<string>();
  const pairs = new Map<string, CertainPair>();
  const reviews = new Map<string, PairReview>();
  const ambiguous: { node: ComponentNode; cands: Unit[] }[] = [];

  // ── 1. 확실한 짝: 이름이 정확히 같음 → 대소문자만 다름. 같은 이름이 여러 개면 위치로 특정 ──
  const tier = (kind: "exact" | "case", same: (n: ComponentNode, u: UnitFact) => boolean) => {
    for (const node of nodes) {
      if (done.has(node.id)) continue;
      const cands = units.filter((u) => !claimed.has(u.key) && sameKind(node, u.fact) && u.fact.nameSource === "declared" && same(node, u.fact));
      if (!cands.length) continue;
      const make = (u: Unit, ev: Evidence): void => {
        pairs.set(node.id, { nodeId: node.id, nodeName: node.name, unit: refOf(u.fact), evidence: [ev] });
        claimed.add(u.key);
        done.add(node.id);
      };
      const label = kind === "exact" ? "이름이 정확히 같음" : "대소문자만 다름";
      if (cands.length === 1) {
        const u = cands[0];
        make(u, { kind, detail: `${label}(${u.fact.name})${u.fact.exported ? "" : " · 내보내지 않음(파일 안에서만 사용)"}` });
        continue;
      }
      const byLocation = cands.filter((u) => dirMatches(u.fact.path, node.location.dir));
      if (byLocation.length === 1) {
        make(byLocation[0], { kind: "same-name-location", detail: `같은 이름 ${cands.length}개 중 위치(${node.location.dir}) 일치` });
        continue;
      }
      // 위치로 특정하지 못함: 후보를 다른 노드가 가져가지 못하게 묶어 두고, 순서는 부모의 짝이 정해진 뒤 정한다
      for (const u of cands) claimed.add(u.key);
      done.add(node.id);
      ambiguous.push({ node, cands });
    }
  };
  tier("exact", (n, u) => u.name === n.name);
  tier("case", (n, u) => u.name !== n.name && u.name.toLowerCase() === n.name.toLowerCase());

  // ── 2. 읽지 못한 경로에 노드 이름이 보이면 확실한 짝도 낮춘다 ──
  const unread = unreadablePaths(model);
  for (const node of nodes) {
    if (reviews.has(node.id) || ambiguous.some((a) => a.node.id === node.id)) continue;
    const hit = unread.find((t) => pathShowsName(t.spec, node.name) && !aliasTargetUploaded(t.spec, uploadedPaths));
    if (!hit) continue;
    const pair = pairs.get(node.id);
    const sameName = units.filter((u) => sameKind(node, u.fact) && u.fact.name.toLowerCase() === node.name.toLowerCase());
    const cands: CandidateEntry[] = (pair ? [unitByKey.get(keyOf(pair.unit))!] : sameName).map((u) => ({ unit: refOf(u.fact), evidence: [], score: nameScore(node.name, u.fact.name, node.kind === "hook") }));
    for (const u of sameName) claimed.add(u.key);
    pairs.delete(node.id);
    done.add(node.id);
    reviews.set(node.id, {
      nodeId: node.id,
      nodeName: node.name,
      reason: "unreadable-named-path",
      candidates: cands,
      via: hit.spec,
      evidence: [{ kind: "path-name-unread", detail: `${hit.from}의 "${hit.spec}"에 ${node.name}가 보이지만 그 파일을 읽지 못함` }],
    });
  }

  const parentUnit = (node: ComponentNode): Unit | undefined => {
    const p = node.parentId ? pairs.get(node.parentId) : undefined;
    return p ? unitByKey.get(keyOf(p.unit)) : undefined;
  };
  /** 부모의 확실한 짝이 이 코드를 렌더링(훅이면 호출)하는가 */
  const linkedFromParent = (node: ComponentNode, parent: Unit | undefined, u: Unit): boolean => {
    if (!parent) return false;
    if (node.kind === "hook") return parent.fact.hooks.some((h) => h.name === u.fact.name && (h.path === u.fact.path || (h.path === null && parent.fact.path === u.fact.path)));
    return parent.fact.rendered.some((r) => (r.path === u.fact.path && (r.name === u.fact.name || r.name === "default")) || (r.path === null && r.name === u.fact.name && parent.fact.path === u.fact.path));
  };

  // ── 3. 같은 이름 여러 개를 특정하지 못한 확인 필요: 부모가 렌더링하는 것을 앞에, 나머지는 경로 순 ──
  for (const { node, cands } of ambiguous) {
    const parent = parentUnit(node);
    const ordered = [...cands].sort((a, b) => Number(linkedFromParent(node, parent, b)) - Number(linkedFromParent(node, parent, a)) || byCodePoint(a.fact.path, b.fact.path));
    reviews.set(node.id, {
      nodeId: node.id,
      nodeName: node.name,
      reason: "same-name-ambiguous",
      candidates: ordered.map((u) => ({
        unit: refOf(u.fact),
        evidence: [{ kind: "same-name", detail: `같은 이름 ${cands.length}개 중 위치로 특정하지 못함${linkedFromParent(node, parent, u) ? ` · 부모 ${parent!.fact.name}가 렌더링` : ""}` }],
        score: 1,
      })),
      evidence: [{ kind: "same-name", detail: `${node.name} 이름의 코드가 ${cands.length}개이고 위치(${node.location.dir})로 특정하지 못함` }],
    });
  }

  // ── 4. 후보: 이름 유사도·위치(부모가 렌더링)·화면 주소·파일 이름. 후보는 한 건만 내고 이후 검사를 하지 않는다 ──
  const route = designRoute(bp.route);
  const edges: Edge[] = [];
  for (const node of nodes) {
    if (done.has(node.id)) continue;
    const hook = node.kind === "hook";
    const parent = parentUnit(node);
    const propNames = node.props.map((p) => p.name);
    for (const u of units) {
      if (claimed.has(u.key) || !sameKind(node, u.fact)) continue;
      const ev: Evidence[] = [];
      const nameJ = nameScore(node.name, u.fact.name, hook);
      if (u.fact.nameSource === "file" && u.fact.name.toLowerCase() === node.name.toLowerCase()) {
        ev.push({ kind: "file-name", detail: `이름 없는 기본 내보내기: 컴포넌트 이름이 아니라 파일 이름(${base(u.fact.path)})이 ${node.name}와 같아서 판단함` });
      } else if (isNameSimilar(nameJ)) {
        ev.push({ kind: "name-similarity", score: nameJ, detail: `이름 유사도 ${nameJ.toFixed(2)}(${node.name} ↔ ${u.fact.name})` });
      }
      const propsJ = hook ? 0 : propsScore(propNames, u.fact.props.map((p) => p.name));
      if (linkedFromParent(node, parent, u)) {
        const sameFolder = dirMatches(u.fact.path, node.location.dir);
        const propsSimilar = isPropsSimilar(propsJ);
        const shares = sharesWord(node.name, u.fact.name, hook);
        if (sameFolder || propsSimilar || shares) {
          const why = [sameFolder ? `같은 폴더(${node.location.dir})` : "", propsSimilar ? `props 유사 ${propsJ.toFixed(2)}` : "", shares ? "이름 단어 겹침" : ""].filter(Boolean).join(" + ");
          ev.push({ kind: "location", detail: `부모 ${parent!.fact.name}가 ${hook ? "호출" : "렌더링"} + ${why}` });
        }
      }
      if (node.kind === "page" && route && u.file.routes.some((r) => r.path === route && r.component === u.fact.name && (r.router !== "next-app" || r.raw === u.fact.path))) {
        ev.push({ kind: "route", detail: `화면 주소 ${route} 일치(${base(u.fact.path)})` });
      }
      if (ev.length) edges.push({ node, unit: u, evidence: ev, strength: ev.length, nameJ, propsJ });
    }
  }
  const bestFirst = (a: Edge, b: Edge) => b.strength - a.strength || b.nameJ - a.nameJ || b.propsJ - a.propsJ;
  const globalOrder = [...edges].sort((a, b) => bestFirst(a, b) || byCodePoint(a.node.name, b.node.name) || byCodePoint(a.unit.fact.path, b.unit.fact.path) || byCodePoint(a.unit.fact.name, b.unit.fact.name));
  const primary = new Map<string, Edge>();
  const taken = new Set<string>();
  for (const e of globalOrder) {
    if (primary.has(e.node.id) || taken.has(e.unit.key)) continue; // 한 코드가 두 노드의 1순위면 점수가 높은 노드가 가진다
    primary.set(e.node.id, e);
    taken.add(e.unit.key);
  }
  const holderOf = new Map([...primary.values()].map((e) => [e.unit.key, e.node.name]));
  const candidateKeys = new Set<string>();
  for (const node of nodes) {
    const mine = edges.filter((e) => e.node.id === node.id).sort((a, b) => bestFirst(a, b) || byCodePoint(a.unit.fact.path, b.unit.fact.path) || byCodePoint(a.unit.fact.name, b.unit.fact.name));
    if (!mine.length) continue;
    const first = primary.get(node.id);
    const list = first ? [first, ...mine.filter((e) => e !== first)] : mine;
    for (const e of list) candidateKeys.add(e.unit.key);
    reviews.set(node.id, {
      nodeId: node.id,
      nodeName: node.name,
      reason: "candidate",
      candidates: list.map((e) => {
        const holder = holderOf.get(e.unit.key);
        return { unit: refOf(e.unit.fact), evidence: e.evidence, score: e.nameJ, ...(holder && holder !== node.name ? { contestedBy: [holder] } : {}) };
      }),
      evidence: list[0].evidence,
    });
    done.add(node.id);
  }

  // ── 5. 남은 노드: 경로를 알 수 없는 import(변수)가 있으면 "코드에 없음"을 확정하지 않고, 아니면 코드에 없음 ──
  const scope = unreadableScope(model);
  const missing: Pairing["missing"] = [];
  for (const node of nodes) {
    if (done.has(node.id)) continue;
    if (scope.unknownTarget) {
      reviews.set(node.id, {
        nodeId: node.id,
        nodeName: node.name,
        reason: "unreadable-unknown-target",
        candidates: [],
        evidence: [{ kind: "unknown-target", detail: "짝을 찾지 못했고 경로를 알 수 없는 import(변수)가 있어 코드에 없다고 확정하지 못함" }],
      });
    } else missing.push({ nodeId: node.id, nodeName: node.name });
  }

  const reviewCandidateKeys = new Set([...reviews.values()].flatMap((r) => r.candidates.map((c) => keyOf(c.unit))));
  const pairedKeys = new Set([...pairs.values()].map((p) => keyOf(p.unit)));
  const extraUnits = units.filter((u) => u.fact.exported && !pairedKeys.has(u.key) && !reviewCandidateKeys.has(u.key) && !candidateKeys.has(u.key)).map((u) => refOf(u.fact));

  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const byNode = <T extends { nodeId: string }>(m: T[]) => m.sort((a, b) => order.get(a.nodeId)! - order.get(b.nodeId)!);
  return {
    pairs: byNode([...pairs.values()]),
    reviews: byNode([...reviews.values()]),
    missing: byNode(missing),
    extraUnits,
    checkable: (id) => pairs.has(id),
    pairOf: (id) => pairs.get(id),
  };
}
