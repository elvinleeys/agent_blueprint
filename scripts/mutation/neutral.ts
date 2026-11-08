// 중립 변이: 코드의 뜻은 그대로이고 모양만 바꾼다. 구현 검사 결과(카드·항목 판정·집계·짝)가 같아야 한다.
// 같지 않으면 분석기가 코드 모양에 흔들리는 것이다(오탐·누락). 파일 위치(줄 번호)가 바뀌므로 근거 문구(evidence)는 비교에서 뺀다.
import ts from "typescript";
import { readCodeModel } from "../../core/code-model/facts";
import { checkImplementation } from "../../core/impl-check/run";
import { listCaseDirs, loadBlueprint, loadCode } from "../../core/impl-check/load-fixture";

type Edit = { start: number; end: number; text: string };
const parse = (path: string, text: string) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const apply = (text: string, edits: Edit[]) => [...edits].sort((a, b) => b.start - a.start).reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text);
const isCode = (path: string) => /\.(tsx?|jsx?)$/.test(path) && !path.endsWith(".d.ts");

type Transform = { id: string; name: string; run: (path: string, text: string) => string };

/** N1 줄 바꿈·들여쓰기 다시 쓰기: 컴파일러의 출력기로 파일을 다시 씀(모양이 통일되고 주석은 사라짐) */
const reprint: Transform = {
  id: "N1",
  name: "줄 바꿈·들여쓰기 다시 쓰기(코드를 다시 출력)",
  run: (path, text) => ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(parse(path, text)),
};

/** N2 주석 추가: 모든 최상위 문장 앞에 주석 */
const comments: Transform = {
  id: "N2",
  name: "주석 추가(모든 최상위 문장 앞과 중괄호 뒤)",
  run: (path, text) => {
    const sf = parse(path, text);
    const edits: Edit[] = sf.statements.map((s) => ({ start: s.getStart(sf), end: s.getStart(sf), text: "/* 메모 */ // 메모\n" }));
    return apply(text, edits) + "\n// 끝 메모\n";
  },
};

/** N3 import 줄 순서 뒤집기(맨 위 지시문 "use client"는 그대로) */
const importOrder: Transform = {
  id: "N3",
  name: "import 줄 순서 뒤집기",
  run: (path, text) => {
    const sf = parse(path, text);
    const imps = sf.statements.filter(ts.isImportDeclaration);
    if (imps.length < 2) return text;
    const texts = imps.map((i) => text.slice(i.getStart(sf), i.getEnd())).reverse();
    return apply(text, imps.map((i, k) => ({ start: i.getStart(sf), end: i.getEnd(), text: texts[k] })));
  },
};

/** N4 className 문자열 안의 클래스 순서 뒤집기(문자열 리터럴로 쓴 것만) */
const classOrder: Transform = {
  id: "N4",
  name: "className 클래스 순서 뒤집기",
  run: (path, text) => {
    const sf = parse(path, text);
    const edits: Edit[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isJsxAttribute(n) && n.name.getText(sf) === "className" && n.initializer && ts.isStringLiteral(n.initializer)) {
        const q = text[n.initializer.getStart(sf)];
        edits.push({ start: n.initializer.getStart(sf), end: n.initializer.getEnd(), text: `${q}${n.initializer.text.split(/\s+/).filter(Boolean).reverse().join(" ")}${q}` });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return apply(text, edits);
  },
};

/** N5 지역 변수 이름 바꾸기: 상태·훅 반환값이 아닌 `const 이름 = …`(단순 식별자, 호출식이 아닌 초기값)만. 단축 속성에 쓰인 이름은 건드리지 않는다 */
const rename: Transform = {
  id: "N5",
  name: "지역 변수 이름 바꾸기(상태가 아닌 const 변수)",
  run: (path, text) => {
    const sf = parse(path, text);
    const targets = new Set<string>();
    const shorthand = new Set<string>();
    const collect = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && !ts.isCallExpression(n.initializer) && !ts.isArrowFunction(n.initializer) && !ts.isFunctionExpression(n.initializer) && n.parent.parent && ts.isVariableStatement(n.parent.parent) && !ts.isSourceFile(n.parent.parent.parent)) targets.add(n.name.text);
      if (ts.isShorthandPropertyAssignment(n)) shorthand.add(n.name.text);
      ts.forEachChild(n, collect);
    };
    collect(sf);
    const names = [...targets].filter((t) => !shorthand.has(t));
    if (!names.length) return text;
    const edits: Edit[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isIdentifier(n) && names.includes(n.text)) {
        const p = n.parent;
        const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isJsxAttribute(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isBindingElement(p) && p.propertyName === n) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p);
        if (!isName) edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${n.text}Renamed` });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return apply(text, edits);
  },
};

/** N6 컴포넌트가 돌려주는 맨 바깥 JSX를 <>…</> Fragment로 감싸기. Fragment는 요소가 아니므로 그 안의 최상위 요소가 맨 바깥 요소로 판단돼야 한다 */
const fragment: Transform = {
  id: "N6",
  name: "맨 바깥 요소를 <>…</> Fragment로 감싸기",
  run: (path, text) => {
    const sf = parse(path, text);
    const edits: Edit[] = [];
    const isJsx = (e: ts.Expression): boolean => ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || (ts.isParenthesizedExpression(e) && isJsx(e.expression));
    const topLevelFn = (fn: ts.Node): boolean => {
      let p: ts.Node | undefined = fn.parent;
      while (p && (ts.isVariableDeclaration(p) || ts.isVariableDeclarationList(p) || ts.isVariableStatement(p) || ts.isExportAssignment(p) || ts.isParenthesizedExpression(p))) p = p.parent;
      return !!p && ts.isSourceFile(p);
    };
    const enclosing = (n: ts.Node): ts.Node | undefined => {
      for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return p;
      return undefined;
    };
    const wrap = (e: ts.Expression) => {
      const inner = ts.isParenthesizedExpression(e) ? e.expression : e;
      edits.push({ start: inner.getStart(sf), end: inner.getEnd(), text: `<>${inner.getText(sf)}</>` });
    };
    const visit = (n: ts.Node) => {
      if (ts.isReturnStatement(n) && n.expression && isJsx(n.expression)) {
        const fn = enclosing(n);
        if (fn && (topLevelFn(fn) || ts.isFunctionDeclaration(fn)) && enclosing(fn) === undefined) wrap(n.expression);
      }
      if (ts.isArrowFunction(n) && !ts.isBlock(n.body) && isJsx(n.body as ts.Expression) && topLevelFn(n) && enclosing(n) === undefined) wrap(n.body as ts.Expression);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return apply(text, edits);
  },
};

const TRANSFORMS = [reprint, comments, importOrder, classOrder, rename, fragment];

/** 비교용으로 줄여 낸 결과: 근거 문구(줄 번호가 들어 있음)는 뺀다 */
function digest(bundle: string, name: string, transform?: Transform) {
  const bp = loadBlueprint(bundle, name);
  let changed = 0;
  const files = loadCode(bundle, name).map((f) => {
    if (!transform || !isCode(f.path)) return f;
    const content = transform.run(f.path, f.content);
    if (content !== f.content) changed++;
    return { ...f, content };
  });
  const r = checkImplementation(bp, readCodeModel(files));
  return {
    changed,
    value: {
      findings: r.findings.map((f) => ({ id: f.id, rule: f.rule, certainty: f.certainty, severity: f.severity, kind: f.kind, node: f.node, message: f.message, candidate: f.candidate, design: f.design, via: f.via })),
      items: r.items.map((i) => ({ id: i.id, status: i.status, findingIds: i.findingIds })),
      bans: r.bans.map((b) => ({ id: b.id, status: b.status, findingIds: b.findingIds })),
      summary: r.summary,
      pairs: r.pairing.pairs.map((p) => `${p.nodeName}→${p.unit.name}@${p.unit.path}`),
      reviews: r.pairing.reviews.map((p) => `${p.nodeName}:${p.reason}:${p.candidates.map((c) => c.unit.name).join(",")}`),
      missing: r.pairing.missing.map((m) => m.nodeName),
    },
  };
}

function firstDiff(a: unknown, b: unknown, path = "$"): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: 원래 ${JSON.stringify(a)?.slice(0, 100)} ← 변경 후 ${JSON.stringify(b)?.slice(0, 100)}`;
}

export type NeutralResult = { id: string; name: string; same: boolean; cases: number; changedFiles: number; diff?: string };

export function runNeutral(): NeutralResult[] {
  const cases = ["next", "react"].flatMap((bundle) => ["correct", ...listCaseDirs(bundle).filter((d) => d !== "correct")].map((name) => ({ bundle, name })));
  const base = new Map(cases.map((c) => [`${c.bundle}/${c.name}`, digest(c.bundle, c.name).value]));
  return TRANSFORMS.map((t) => {
    let changedFiles = 0;
    let diff: string | undefined;
    for (const c of cases) {
      const d = digest(c.bundle, c.name, t);
      changedFiles += d.changed;
      const x = firstDiff(base.get(`${c.bundle}/${c.name}`), d.value);
      if (x && !diff) diff = `${c.bundle}/${c.name} ${x}`;
    }
    return { id: t.id, name: t.name, same: !diff, cases: cases.length, changedFiles, ...(diff ? { diff } : {}) };
  });
}
