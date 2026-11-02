import type { AnalyzedComponent, OfficialComponent } from "./types";

/** 판정 기준값. 실제 코드로 돌려 본 뒤 조정하기 쉽게 여기에만 둔다 */
export const COMPARE_CONFIG = {
  /** C-02: 이름 단어(PascalCase 분리) Jaccard 최소값 */
  NAME_JACCARD_MIN: 0.5,
  /** C-02: props 이름 Jaccard 최소값(양쪽 props가 1개 이상일 때만 비교) */
  PROPS_JACCARD_MIN: 0.5,
  /** C-02: 같은 라이브러리 컴포넌트를 상속한 쌍이 후보가 되려면 겹쳐야 하는 이름 단어 수 */
  LIB_INHERIT_NAME_WORDS_MIN: 1,
  /** C-03: props가 이 개수를 넘으면 나누기 후보 */
  MAX_PROPS: 8,
} as const;

export type Severity = "warning" | "info";
/** path가 null이면 JSON 스펙의 공식 컴포넌트(파일 없음) */
export type CompRef = { name: string; path: string | null; official: boolean };

export type Finding =
  | { rule: "C-01"; severity: "info"; component: CompRef; message: string }
  | { rule: "C-02"; severity: Severity; members: CompRef[]; evidence: string[]; message: string }
  | { rule: "C-03"; severity: "warning"; component: CompRef; propCount: number; message: string }
  /** 폴더로 만든 스펙에서, 폴더 밖에 공식 컴포넌트와 같은 이름의 컴포넌트가 따로 있음 */
  | { rule: "C-05"; severity: "warning"; component: CompRef; officialPath: string | null; message: string };

export type CompareSummary = {
  officialCount: number;
  /** 비교한 컴포넌트(검사할 코드에서 내보낸 것) */
  comparedCount: number;
  /** 파일 안에서만 쓰는 내부용이라 비교하지 않은 컴포넌트 */
  internalCount: number;
  /** props 일부만 읽은 비교 대상 컴포넌트(C-04 요약). 결과 목록에는 올리지 않는다 */
  unresolvedCount: number;
};

export type CompareResult = { findings: Finding[]; summary: CompareSummary };

export type CompareInput = {
  official: OfficialComponent[];
  /** 검사할 코드에서 분석한 컴포넌트(디자인 시스템 파일은 포함하지 않는다) */
  analyzed: AnalyzedComponent[];
  /** 공식 목록을 디자인 시스템으로 올린 파일에서 만들었는가. true일 때만 C-05(같은 이름의 별도 구현)를 건다 */
  officialFromFiles?: boolean;
};

const words = (name: string) => new Set((name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) ?? []).map((w) => w.toLowerCase()));

const common = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => b.has(x));
const jaccard = <T>(a: Set<T>, b: Set<T>) => {
  const inter = common(a, b).length;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
};

type Node = { ref: CompRef; words: Set<string>; props: Set<string>; inherits: Set<string>; inheritsComponents: Set<string> };

const fix = (n: number) => n.toFixed(2);

/** 합치기 후보 쌍을 판정한다. 아니면 null */
function judgePair(a: Node, b: Node): string[] | null {
  const C = COMPARE_CONFIG;
  const nameJ = jaccard(a.words, b.words);
  const evidence: string[] = [];

  const libs = common(a.inheritsComponents, b.inheritsComponents);
  const libCandidate = libs.length > 0 && common(a.words, b.words).length >= C.LIB_INHERIT_NAME_WORDS_MIN;
  const propsJ = a.props.size && b.props.size ? jaccard(a.props, b.props) : 0;
  const nameProps = nameJ >= C.NAME_JACCARD_MIN && propsJ >= C.PROPS_JACCARD_MIN;
  if (!libCandidate && !nameProps) return null;

  if (nameProps) evidence.push(`이름 단어 유사도 ${fix(nameJ)}, props 이름 유사도 ${fix(propsJ)}`);
  if (libCandidate) evidence.push(`같은 라이브러리 컴포넌트를 상속: ${libs.join(", ")}`);
  // 흔한 HTML 요소 때문에 후보가 늘지 않도록 후보 조건에는 쓰지 않고, 이름 조건을 통과한 후보의 근거로만 보인다
  const html = common(a.inherits, b.inherits);
  if (nameJ >= C.NAME_JACCARD_MIN && html.length) evidence.push(`같은 HTML 요소를 감쌈: ${html.join(", ")}`);
  return evidence;
}

export function compareDesignSystem(input: CompareInput): CompareResult {
  const { official, analyzed, officialFromFiles } = input;
  const officialNames = new Set(official.map((o) => o.name));

  const exported = analyzed.filter((c) => c.exported);
  const internalCount = analyzed.length - exported.length;

  const findings: Finding[] = [];
  const refOf = (c: AnalyzedComponent): CompRef => ({ name: c.name, path: c.path, official: officialNames.has(c.name) });

  // C-01 공식 목록에 없음(정보): 화면별 컴포넌트가 공식 목록에 없는 것은 정상이라 낮은 심각도
  for (const c of exported) {
    if (!officialNames.has(c.name)) findings.push({ rule: "C-01", severity: "info", component: refOf(c), message: `${c.name}은(는) 공식 컴포넌트 목록에 없습니다.` });
  }

  // C-05 공식과 같은 이름의 별도 구현(경고): 디자인 시스템 폴더로 스펙을 만든 경우에만. 폴더 밖에 같은 이름이 따로 있다는 뜻이다.
  // JSON 스펙은 구현 위치를 알 수 없어 같은 이름을 공식 구현으로 본다(지금처럼 C-01·합치기 쌍에서만 뺀다)
  if (officialFromFiles) {
    for (const c of exported) {
      const o = official.find((x) => x.name === c.name);
      if (!o) continue;
      findings.push({ rule: "C-05", severity: "warning", component: refOf(c), officialPath: o.path ?? null, message: `${c.name}은(는) 공식 컴포넌트와 같은 이름의 별도 구현입니다${o.path ? `(공식: ${o.path})` : ""}. 공식 컴포넌트를 쓰도록 바꿀 수 있는지 검토하세요.` });
    }
  }

  // C-03 나누기 후보
  for (const c of exported) {
    if (c.props.length > COMPARE_CONFIG.MAX_PROPS) {
      findings.push({ rule: "C-03", severity: "warning", component: refOf(c), propCount: c.props.length, message: `${c.name}의 props가 ${c.props.length}개입니다(기준 ${COMPARE_CONFIG.MAX_PROPS}개 초과). 나눌 수 있는지 검토하세요.` });
    }
  }

  // C-02 합치기 후보: 공식 이름과 같은 컴포넌트는 그 공식 항목 자체라 쌍에서 뺀다. 공식끼리의 쌍도 제외
  const nodes: Node[] = [
    ...official.map((o) => ({
      ref: { name: o.name, path: o.path ?? null, official: true } as CompRef,
      words: words(o.name),
      props: new Set(o.props.map((p) => p.name)),
      inherits: new Set(o.inherits ?? []),
      inheritsComponents: new Set(o.inheritsComponents ?? []),
    })),
    ...exported
      .filter((c) => !officialNames.has(c.name))
      .map((c) => ({ ref: refOf(c), words: words(c.name), props: new Set(c.props.map((p) => p.name)), inherits: new Set(c.inherits), inheritsComponents: new Set(c.inheritsComponents) })),
  ];
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const evidenceByGroupMember = new Map<number, string[]>();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].ref.official && nodes[j].ref.official) continue;
      const ev = judgePair(nodes[i], nodes[j]);
      if (!ev) continue;
      parent[find(i)] = find(j);
      const line = `${nodes[i].ref.name}↔${nodes[j].ref.name}: ${ev.join("; ")}`;
      for (const k of [i, j]) evidenceByGroupMember.set(k, [...(evidenceByGroupMember.get(k) ?? []), line]);
    }
  }
  const groups = new Map<number, number[]>();
  for (const k of evidenceByGroupMember.keys()) groups.set(find(k), [...(groups.get(find(k)) ?? []), k]);
  for (const members of groups.values()) {
    const refs = members.map((k) => nodes[k].ref);
    const hasOfficial = refs.some((r) => r.official);
    const evidence = [...new Set(members.flatMap((k) => evidenceByGroupMember.get(k) ?? []))];
    const names = refs.map((r) => r.name).join(", ");
    findings.push({
      rule: "C-02",
      // 공식 컴포넌트와 비슷한데 따로 만든 경우가 실제로 고칠 대상이라 경고, 공식이 없는 쌍은 정보
      severity: hasOfficial ? "warning" : "info",
      members: refs,
      evidence,
      message: hasOfficial
        ? `${names}: 공식 컴포넌트(${refs.filter((r) => r.official).map((r) => r.name).join(", ")})와 비슷한 컴포넌트가 따로 있습니다. 공식 컴포넌트로 합칠 수 있는지 검토하세요.`
        : `${names}: 서로 비슷한 컴포넌트입니다. 합칠 수 있는지 검토하세요.`,
    });
  }

  const rank = { warning: 0, info: 1 } as const;
  const keyName = (f: Finding) => ("component" in f ? f.component.name : f.members.map((m) => m.name).sort().join(","));
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.rule.localeCompare(b.rule) || keyName(a).localeCompare(keyName(b)));

  return {
    findings,
    summary: {
      officialCount: official.length,
      comparedCount: exported.length,
      internalCount,
      unresolvedCount: exported.filter((c) => c.unresolved.length > 0).length,
    },
  };
}
