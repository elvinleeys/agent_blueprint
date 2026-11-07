import * as ts from "typescript";
import { readClassName, type ClassInfo } from "./class-names";
import type { FetchKind } from "./fetch-calls";
import { classifyFetchCall } from "./fetch-kind";
import { createImportResolver, type ImportKind, type ImportResolver } from "./imports";
import { IMPL_CHECK_OPTIONS, type CodeModelOptions } from "./options";
import { PASCAL, baseName, extractComponents, hasJsx, isExported, toPascal, unwrap, type FnLike } from "./parse";
import { nextAppRouteFact } from "./route-next-app";
import { readReactRouterRoutes } from "./route-react-router";
import type { RouteFact } from "./routes";
import { readPathConfigs, type ConfigNote } from "./tsconfig";
import type { ExtractedProp, PartialFile, SourceFile } from "./types";

// 구현 검사가 쓰는 "코드에서 읽은 사실". 판정은 하지 않는다(규칙은 core/impl-check). 기능별 설정은 options.ts.

export type { FetchKind } from "./fetch-calls";
export type { RouteFact, RouterKind } from "./routes";

export type ImportFact = {
  spec: string;
  /** 올린 파일 중 가리키는 파일. 패키지·올리지 않은 파일·풀지 못한 별칭이면 null */
  resolved: string | null;
  /** relative: 상대 경로 / alias: `@/`·`~/`처럼 설정 파일(tsconfig·jsconfig)이나 기본 규칙으로 푸는 별칭 / package: 패키지 */
  kind: ImportKind;
  /** 무엇으로 풀었는지(근거). 못 풀었으면 null */
  resolvedBy: "relative" | "tsconfig" | "default" | null;
  /** tsconfig로 풀거나 풀려고 한 설정 파일 */
  config?: string;
  /** 가져온 이름: 이름 그대로, 기본값은 "default", 네임스페이스는 "*" */
  names: string[];
  /** `import type …`이거나 모든 이름이 `type` 표시. 런타임 import가 아니다 */
  typeOnly: boolean;
  /** `export … from`(다시 내보내기). 렌더링·호출 관계는 따라가지 않는다 */
  reexport: boolean;
  line: number;
};

export type ElementFact = {
  /** 쓴 그대로의 태그 이름("div", "ProductInfo", "Foo.Bar") */
  tag: string;
  line: number;
  /** 컴포넌트(함수) 안에서 다른 JSX 안에 있지 않은 맨 바깥 요소 */
  root: boolean;
  /** className(class) 속성. 없으면 null. `{...props}` 전개가 있으면 dynamic이 true다(전개가 className을 실을 수 있다) */
  className: ClassInfo | null;
  /** `style={…}` 속성이 있다 */
  inlineStyle: boolean;
  /** on으로 시작하는 JSX 속성 이름(`onClick`) */
  eventAttrs: string[];
};

export type RenderedFact = { tag: string; /** import한 원래 이름 */ name: string; path: string | null };
export type HookCallFact = { name: string; path: string | null };
/** 데이터 요청 호출. kind는 READ(조회)·WRITE(변경)·UNKNOWN(판별 불가) */
export type FetchCallFact = { callee: string; kind: FetchKind; line: number };

export type UnitFact = {
  name: string;
  kind: "component" | "hook";
  path: string;
  line: number;
  exported: boolean;
  /** useState·useReducer의 상태 이름(구조분해 첫 이름) */
  state: string[];
  /** 호출한 use* (React 기본 훅 포함, 이름 기준 중복 없음) */
  hooks: HookCallFact[];
  /** JSX에서 렌더링한 컴포넌트(대문자 태그, 이름 기준 중복 없음) */
  rendered: RenderedFact[];
  /** 선언한 props(컴포넌트만) */
  props: ExtractedProp[];
  /** on으로 시작하는 props: 선언한 것 + 매개변수 구조분해·`props.onX`로 읽은 것 */
  eventProps: string[];
  fetchCalls: FetchCallFact[];
  elements: ElementFact[];
};

/**
 * 읽지 못한 코드. 영향은 관련된 판정에만 미친다(unreadableScope).
 * - lazy: `lazy(() => import("./X"))`. target에 경로가 적혀 있으면 그 파일과 관련된 판정만 영향
 * - dynamic-import: `import("./X")`·`import(변수)`. target이 null이면 경로를 알 수 없음
 * - reexport: `export … from`. 다시 내보낸 이름의 출처는 따라가지 않음
 * - router: 읽지 못하는 라우터(TanStack Router 등)이거나 path 값을 읽지 못한 라우트. target에 이유
 */
export type UnreadableFact = { line: number; reason: "dynamic-import" | "lazy" | "reexport" | "router"; target: string | null; resolved: string | null };

export type FileFact = {
  path: string;
  /** 파일 맨 위 지시문에 "use client"가 있다 */
  useClient: boolean;
  imports: ImportFact[];
  units: UnitFact[];
  /** `export default 이름;`·`export default function 이름`의 이름 */
  defaultExport: string | null;
  /** 라우터를 만드는 호출(createBrowserRouter 등)이나 <Routes>·<Route>가 있다 */
  routerConfig: boolean;
  /** 화면 주소(공통 형식). React Router는 이 파일의 설정, Next App Router는 이 파일이 app 폴더 아래 page.tsx일 때 */
  routes: RouteFact[];
  unreadable: UnreadableFact[];
};

export type CodeModel = { files: FileFact[]; failedPaths: string[]; partialFiles: PartialFile[]; configNotes: ConfigNote[] };

const HOOK = /^use[A-Z0-9]/;
/** 라우트를 읽지 못하는 라우터 패키지 */
const UNSUPPORTED_ROUTERS = new Set(["@tanstack/react-router", "wouter", "@reach/router"]);

const lineOf = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

type Binding = { path: string | null; name: string };

function readImports(sf: ts.SourceFile, resolve: ImportResolver, from: string) {
  const imports: ImportFact[] = [];
  const bindings = new Map<string, Binding>();
  const unreadable: UnreadableFact[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const r = resolve(from, spec);
      const clause = st.importClause;
      const names: string[] = [];
      let allType = !!clause?.isTypeOnly;
      if (clause?.name) {
        names.push("default");
        bindings.set(clause.name.text, { path: r.resolved, name: "default" });
      }
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) {
        names.push("*");
        bindings.set(nb.name.text, { path: r.resolved, name: "*" });
      } else if (nb) {
        let typed = 0;
        for (const e of nb.elements) {
          const orig = (e.propertyName ?? e.name).text;
          names.push(orig);
          bindings.set(e.name.text, { path: r.resolved, name: orig });
          if (e.isTypeOnly) typed++;
        }
        if (nb.elements.length && typed === nb.elements.length) allType = true;
      }
      imports.push({ spec, resolved: r.resolved, kind: r.kind, resolvedBy: r.by, ...(r.config ? { config: r.config } : {}), names, typeOnly: allType, reexport: false, line: lineOf(sf, st) });
      if (UNSUPPORTED_ROUTERS.has(spec)) unreadable.push({ line: lineOf(sf, st), reason: "router", target: spec, resolved: null });
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const r = resolve(from, spec);
      const exportNames = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements.map((e) => (e.propertyName ?? e.name).text) : ["*"];
      imports.push({ spec, resolved: r.resolved, kind: r.kind, resolvedBy: r.by, ...(r.config ? { config: r.config } : {}), names: exportNames, typeOnly: st.isTypeOnly, reexport: true, line: lineOf(sf, st) });
      unreadable.push({ line: lineOf(sf, st), reason: "reexport", target: spec, resolved: r.resolved });
    }
  }
  return { imports, bindings, unreadable };
}

const calleeName = (call: ts.CallExpression): string | null => {
  const e = call.expression;
  return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null;
};

const attrName = (a: ts.JsxAttributeLike) => (ts.isJsxAttribute(a) ? a.name.getText() : null);

function readUnit(sf: ts.SourceFile, path: string, name: string, kind: UnitFact["kind"], fn: FnLike, exported: boolean, bindings: Map<string, Binding>, props: ExtractedProp[]): UnitFact {
  const unit: UnitFact = { name, kind, path, line: lineOf(sf, fn), exported, state: [], hooks: [], rendered: [], props, eventProps: props.map((p) => p.name).filter((n) => /^on[A-Z]/.test(n)), fetchCalls: [], elements: [] };
  const hookSeen = new Set<string>();
  const renderedSeen = new Set<string>();
  const addEvent = (n: string) => /^on[A-Z]/.test(n) && !unit.eventProps.includes(n) && unit.eventProps.push(n);

  // props 매개변수에서 읽은 이벤트: `({ onClick })` 또는 `(props) … props.onClick`
  const p0 = fn.parameters[0]?.name;
  let propsIdent: string | null = null;
  if (p0 && ts.isObjectBindingPattern(p0)) for (const el of p0.elements) addEvent(((el.propertyName ?? el.name) as ts.Identifier).text ?? "");
  else if (p0 && ts.isIdentifier(p0)) propsIdent = p0.text;

  const visit = (node: ts.Node, depth: number): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = open.tagName.getText();
      const attrs = open.attributes.properties;
      const cls = attrs.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && (attrName(a) === "className" || attrName(a) === "class"));
      let className = cls ? readClassName(cls) : null;
      // `{...props}` 전개는 className을 실을 수 있어 읽지 못한 부분으로 센다
      if (attrs.some((a) => ts.isJsxSpreadAttribute(a))) className = { always: className?.always ?? [], conditional: className?.conditional ?? [], dynamic: true };
      unit.elements.push({
        tag,
        line: lineOf(sf, node),
        root: depth === 0,
        className,
        inlineStyle: attrs.some((a) => attrName(a) === "style"),
        eventAttrs: attrs.map(attrName).filter((n): n is string => !!n && /^on[A-Z]/.test(n)),
      });
      const rootId = tag.split(".")[0];
      if (PASCAL.test(rootId) && !renderedSeen.has(tag)) {
        renderedSeen.add(tag);
        const b = bindings.get(rootId);
        unit.rendered.push({ tag, name: b?.name ?? rootId, path: b?.path ?? null });
      }
      return ts.forEachChild(node, (c) => visit(c, depth + 1));
    }
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      if (callee && HOOK.test(callee) && !hookSeen.has(callee)) {
        hookSeen.add(callee);
        const b = ts.isIdentifier(node.expression) ? bindings.get(callee) : undefined;
        unit.hooks.push({ name: callee, path: b?.path ?? null });
      }
      const f = classifyFetchCall(node);
      if (f) unit.fetchCalls.push({ callee: f.callee, kind: f.kind, line: lineOf(sf, node) });
    }
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && ts.isArrayBindingPattern(node.name)) {
      const c = calleeName(node.initializer);
      const first = node.name.elements[0];
      if ((c === "useState" || c === "useReducer") && first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) unit.state.push(first.name.text);
    }
    if (propsIdent && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === propsIdent) addEvent(node.name.text);
    ts.forEachChild(node, (c) => visit(c, depth));
  };
  if (fn.body) visit(fn.body, 0);
  return unit;
}

/** `import("…")` 호출을 찾는다(lazy 안쪽) */
function findImportCall(node: ts.Node): ts.CallExpression | null {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) return node;
  return ts.forEachChild(node, (c) => findImportCall(c)) ?? null;
}

const importTarget = (call: ts.CallExpression): string | null => {
  const a = call.arguments[0];
  return a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null;
};

/** 파일 어디서든: 동적 import·lazy(읽지 못함). 경로가 글자로 적혀 있으면 target에 담는다 */
function readUnreadable(sf: ts.SourceFile, node: ts.Node, resolve: ImportResolver, from: string, out: UnreadableFact[], lazyInner: Set<ts.Node>) {
  if (!ts.isCallExpression(node)) return;
  const entry = (reason: "dynamic-import" | "lazy", call: ts.CallExpression | null): UnreadableFact => {
    const target = call ? importTarget(call) : null;
    return { line: lineOf(sf, node), reason, target, resolved: target ? resolve(from, target).resolved : null };
  };
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    if (!lazyInner.has(node)) out.push(entry("dynamic-import", node));
    return;
  }
  const c = calleeName(node);
  if (c === "lazy" || (c === "dynamic" && ts.isIdentifier(node.expression))) {
    const inner = findImportCall(node);
    if (inner) lazyInner.add(inner);
    out.push(entry("lazy", inner));
  }
}

function readFile(file: SourceFile, resolve: ImportResolver, propsByUnit: Map<string, ExtractedProp[]>): FileFact {
  const kind = file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, kind);
  const { imports, bindings, unreadable } = readImports(sf, resolve, file.path);
  const units: UnitFact[] = [];

  let useClient = false;
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) useClient ||= st.expression.text === "use client";
    else break;
  }

  const exportedNames = new Set<string>();
  let defaultExport: string | null = null;
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) st.exportClause.elements.forEach((e) => exportedNames.add((e.propertyName ?? e.name).text));
    else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
      exportedNames.add(st.expression.text);
      defaultExport = st.expression.text;
    }
  }

  const defaultName = toPascal(baseName(file.path));
  const add = (name: string, fn: FnLike, exported: boolean) => {
    const isHook = HOOK.test(name);
    if (!isHook && !(PASCAL.test(name) && fn.body && hasJsx(fn.body))) return;
    if (units.some((u) => u.name === name)) return;
    const props = isHook ? [] : (propsByUnit.get(`${file.path}#${name}`) ?? []);
    units.push(readUnit(sf, file.path, name, isHook ? "hook" : "component", fn, exported, bindings, props));
  };

  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st)) {
      const isDefault = ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      const name = st.name?.text ?? (isDefault ? defaultName : "");
      if (name) add(name, st, isExported(st) || exportedNames.has(name));
      if (isDefault && name) defaultExport ??= name;
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const u = unwrap(d.initializer);
        if (u) add(d.name.text, u.fn, isExported(st) || exportedNames.has(d.name.text));
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const u = unwrap(st.expression);
      if (!u) continue;
      const named = ts.isFunctionExpression(u.fn) ? u.fn.name?.text : undefined;
      add(named && PASCAL.test(named) ? named : defaultName, u.fn, true);
      defaultExport ??= named && PASCAL.test(named) ? named : defaultName;
    }
  }

  // 파일 전체에서: 동적 import·lazy(읽지 못함)
  const lazyInner = new Set<ts.Node>();
  const walk = (n: ts.Node) => {
    readUnreadable(sf, n, resolve, file.path, unreadable, lazyInner);
    ts.forEachChild(n, walk);
  };
  walk(sf);

  // 화면 주소: 라우터별 해석기가 공통 형식으로 바꾼다
  const rr = readReactRouterRoutes(sf);
  const routes: RouteFact[] = [...rr.routes];
  for (const u of rr.unreadable) unreadable.push({ line: u.line, reason: "router", target: u.detail, resolved: null });
  const next = nextAppRouteFact(file.path, defaultExport);
  if (next.fact) routes.push(next.fact);
  if (next.unreadable) unreadable.push({ line: 1, reason: "router", target: next.unreadable, resolved: null });

  return { path: file.path, useClient, imports, units, defaultExport, routerConfig: rr.routerConfig, routes, unreadable };
}

/** 올린 파일(.ts·.tsx, .d.ts 제외)에서 구현 검사에 필요한 사실을 읽는다. 파일 하나가 실패해도 나머지는 계속한다 */
export function readCodeModel(files: SourceFile[], options: CodeModelOptions = IMPL_CHECK_OPTIONS): CodeModel {
  const { components, partialFiles } = extractComponents(files);
  const propsByUnit = new Map(components.map((c) => [`${c.path}#${c.name}`, c.props]));
  const configs = options.aliases === "tsconfig" ? readPathConfigs(files) : null;
  const resolve = createImportResolver(new Set(files.map((f) => f.path)), options.aliases, configs);
  const out: FileFact[] = [];
  const failedPaths: string[] = [];
  for (const f of files) {
    if (!/\.tsx?$/.test(f.path) || f.path.endsWith(".d.ts")) continue;
    try {
      out.push(readFile(f, resolve, propsByUnit));
    } catch {
      failedPaths.push(f.path);
    }
  }
  return { files: out, failedPaths, partialFiles, configNotes: configs?.notes ?? [] };
}

// ── 판정에 쓰는 요약 도우미(판정 자체는 하지 않는다) ─────────────────────

/** 클래스 하나의 상태: ALWAYS(항상) / CONDITIONAL(조건부) / DYNAMIC(못 읽음) / ABSENT(없음). 못 읽은 부분이 있으면 ABSENT로 확정하지 않는다 */
export type ClassState = "ALWAYS" | "CONDITIONAL" | "DYNAMIC" | "ABSENT";

export function classState(info: ClassInfo | null, cls: string): ClassState {
  if (info?.always.includes(cls)) return "ALWAYS";
  if (info?.conditional.includes(cls)) return "CONDITIONAL";
  if (info?.dynamic) return "DYNAMIC";
  return "ABSENT";
}

/** 컴포넌트의 맨 바깥 요소 기준 클래스 상태. 맨 바깥 요소가 없으면(훅 등) null */
export function rootClassState(unit: UnitFact, cls: string): ClassState | null {
  const root = unit.elements.find((e) => e.root);
  return root ? classState(root.className, cls) : null;
}

/** 서버 통신 요약: 조회와 변경은 합쳐서 한 가지(READ+WRITE 포함), 판별 불가만 있으면 UNKNOWN, 요청이 없으면 null */
export function fetchSummary(unit: UnitFact): "READ" | "WRITE" | "READ+WRITE" | "UNKNOWN" | null {
  const kinds = new Set(unit.fetchCalls.map((c) => c.kind));
  if (kinds.has("READ") && kinds.has("WRITE")) return "READ+WRITE";
  if (kinds.has("READ")) return "READ";
  if (kinds.has("WRITE")) return "WRITE";
  return kinds.has("UNKNOWN") ? "UNKNOWN" : null;
}

/** 화면 주소 하나로 세는 라우트(레이아웃 제외) */
export const pageRoutes = (model: CodeModel): RouteFact[] => model.files.flatMap((f) => f.routes).filter((r) => !r.layout);

/**
 * 읽지 못한 코드가 영향을 주는 범위. 규칙은 이 범위 안의 판정만 확인 필요로 보낸다.
 * - files: 경로가 적혀 있고 올린 파일로 풀린 파일(lazy·import("./X")): 그 파일과 관련된 판정만
 * - unresolvedTargets: 경로는 적혔지만 올린 파일로 풀리지 않은 글자
 * - unknownTarget: `import(변수)`처럼 경로를 알 수 없음 → "코드에 없음" 판정(IC-01 등)만 확인 필요
 * - unreadableRouters: 읽지 못한 라우터·라우트(이유 글자) → 화면 주소 판정만
 * - reexports: 다시 내보낸 파일(`export … from`) → 그 출처와 관련된 판정만
 */
export type UnreadableScope = { files: Set<string>; unresolvedTargets: Set<string>; unknownTarget: boolean; unreadableRouters: string[]; reexports: Set<string> };

export function unreadableScope(model: CodeModel): UnreadableScope {
  const scope: UnreadableScope = { files: new Set(), unresolvedTargets: new Set(), unknownTarget: false, unreadableRouters: [], reexports: new Set() };
  for (const f of model.files) {
    for (const u of f.unreadable) {
      if (u.reason === "router") scope.unreadableRouters.push(u.target ?? "");
      else if (u.reason === "reexport") {
        if (u.resolved) scope.reexports.add(u.resolved);
        else if (u.target) scope.unresolvedTargets.add(u.target);
      } else if (u.target === null) scope.unknownTarget = true;
      else if (u.resolved) scope.files.add(u.resolved);
      else scope.unresolvedTargets.add(u.target);
    }
  }
  return scope;
}
