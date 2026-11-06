import * as ts from "typescript";
import { readClassName, type ClassInfo } from "./class-names";
import { FETCH_FUNCTIONS, FETCH_METHODS, QUERY_CLIENT_METHODS, QUERY_CLIENT_NAME, USE_FUNCTION } from "./fetch-calls";
import { resolveModule } from "./imports";
import { PASCAL, baseName, extractComponents, hasJsx, isExported, toPascal, unwrap, type FnLike } from "./parse";
import type { ExtractedProp, PartialFile, SourceFile } from "./types";

// 구현 검사가 쓰는 "코드에서 읽은 사실". 판정은 하지 않는다(규칙은 core/impl-check).

export type ImportFact = {
  spec: string;
  /** 올린 파일 중 가리키는 파일. 패키지·올리지 않은 파일·읽지 못하는 별칭이면 null */
  resolved: string | null;
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
  /** className(class) 속성. 없으면 null */
  className: ClassInfo | null;
  /** `style={…}` 속성이 있다 */
  inlineStyle: boolean;
  /** on으로 시작하는 JSX 속성 이름(`onClick`) */
  eventAttrs: string[];
};

export type RenderedFact = { tag: string; /** import한 원래 이름 */ name: string; path: string | null };
export type HookCallFact = { name: string; path: string | null };
export type FetchCallFact = { callee: string; line: number };

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

export type RouteFact = { path: string; /** element·Component로 연결한 컴포넌트 이름, 없으면 null */ component: string | null; line: number };
export type UnreadableFact = { line: number; reason: "dynamic-import" | "lazy" | "reexport" };

export type FileFact = {
  path: string;
  /** 파일 맨 위 지시문에 "use client"가 있다 */
  useClient: boolean;
  imports: ImportFact[];
  units: UnitFact[];
  /** `export default 이름;`의 이름 */
  defaultExport: string | null;
  /** 라우터를 만드는 호출(createBrowserRouter 등)이나 <Routes>·<Route>가 있다 */
  routerConfig: boolean;
  routes: RouteFact[];
  unreadable: UnreadableFact[];
};

export type CodeModel = { files: FileFact[]; failedPaths: string[]; partialFiles: PartialFile[] };

const ROUTER_CALLS = new Set(["createBrowserRouter", "createHashRouter", "createMemoryRouter", "createRoutesFromElements", "useRoutes"]);
const HOOK = /^use[A-Z0-9]/;

const lineOf = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

type Binding = { path: string | null; name: string };

function readImports(sf: ts.SourceFile, paths: ReadonlySet<string>, from: string) {
  const imports: ImportFact[] = [];
  const bindings = new Map<string, Binding>();
  const unreadable: UnreadableFact[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const resolved = resolveModule(paths, from, spec);
      const clause = st.importClause;
      const names: string[] = [];
      let allType = !!clause?.isTypeOnly;
      if (clause?.name) {
        names.push("default");
        bindings.set(clause.name.text, { path: resolved, name: "default" });
      }
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) {
        names.push("*");
        bindings.set(nb.name.text, { path: resolved, name: "*" });
      } else if (nb) {
        let typed = 0;
        for (const e of nb.elements) {
          const orig = (e.propertyName ?? e.name).text;
          names.push(orig);
          bindings.set(e.name.text, { path: resolved, name: orig });
          if (e.isTypeOnly) typed++;
        }
        if (nb.elements.length && typed === nb.elements.length) allType = true;
      }
      imports.push({ spec, resolved, names, typeOnly: allType, reexport: false, line: lineOf(sf, st) });
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const exportNames = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements.map((e) => (e.propertyName ?? e.name).text) : ["*"];
      imports.push({ spec, resolved: resolveModule(paths, from, spec), names: exportNames, typeOnly: st.isTypeOnly, reexport: true, line: lineOf(sf, st) });
      unreadable.push({ line: lineOf(sf, st), reason: "reexport" });
    }
  }
  return { imports, bindings, unreadable };
}

const calleeName = (call: ts.CallExpression): string | null => {
  const e = call.expression;
  return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null;
};

/** 데이터 요청 호출이면 호출 이름(예: "fetch", "axios.get", "supabase.from")을 돌려준다. 목록은 fetch-calls.ts */
function fetchCallee(call: ts.CallExpression): string | null {
  const e = call.expression;
  if (ts.isIdentifier(e)) {
    if (FETCH_FUNCTIONS.has(e.text)) return e.text;
    if (e.text === USE_FUNCTION) {
      const a = call.arguments[0];
      if (a && (ts.isCallExpression(a) || (ts.isIdentifier(a) && !a.text.endsWith("Context")))) return e.text;
    }
    return null;
  }
  if (!ts.isPropertyAccessExpression(e)) return null;
  const obj = e.expression.getText();
  const method = e.name.text;
  if (method === "fetch" && /^(window|globalThis|self)$/.test(obj)) return "fetch";
  if (FETCH_METHODS[obj]?.has(method)) return `${obj}.${method}`;
  if (QUERY_CLIENT_METHODS.has(method) && QUERY_CLIENT_NAME.test(obj)) return `${obj}.${method}`;
  return null;
}

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
      unit.elements.push({
        tag,
        line: lineOf(sf, node),
        root: depth === 0,
        className: cls ? readClassName(cls) : null,
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
      if (callee && HOOK.test(callee)) {
        if (!hookSeen.has(callee)) {
          hookSeen.add(callee);
          const b = ts.isIdentifier(node.expression) ? bindings.get(callee) : undefined;
          unit.hooks.push({ name: callee, path: b?.path ?? null });
        }
      }
      const f = fetchCallee(node);
      if (f) unit.fetchCalls.push({ callee: f, line: lineOf(sf, node) });
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

/** `element={<X />}` → "X" */
function elementComponent(init: ts.JsxAttribute["initializer"]): string | null {
  if (!init || !ts.isJsxExpression(init) || !init.expression) return null;
  let e: ts.Expression = init.expression;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isJsxSelfClosingElement(e)) return e.tagName.getText();
  if (ts.isJsxElement(e)) return e.openingElement.tagName.getText();
  return null;
}

/** 파일 어디서든: 동적 import·lazy(읽지 못함), 라우터 호출, `<Route>`, 라우트 객체 */
function readSpecial(sf: ts.SourceFile, node: ts.Node, unreadable: UnreadableFact[], flags: { router: boolean }, routes: RouteFact[]) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const open = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = open.tagName.getText();
    if (tag === "Route" || tag === "Routes") flags.router = true;
    if (tag === "Route") {
      const find = (n: string) => open.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && attrName(a) === n);
      const p = find("path");
      const el = find("element");
      if (p?.initializer && ts.isStringLiteral(p.initializer)) routes.push({ path: p.initializer.text, component: el ? elementComponent(el.initializer) : null, line: lineOf(sf, node) });
    }
  }
  if (ts.isCallExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) unreadable.push({ line: lineOf(sf, node), reason: "dynamic-import" });
    const c = calleeName(node);
    if (c === "lazy" || (c === "dynamic" && ts.isIdentifier(node.expression))) unreadable.push({ line: lineOf(sf, node), reason: "lazy" });
    if (c && ROUTER_CALLS.has(c)) flags.router = true;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const get = (k: string) => node.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === k);
    const p = get("path");
    if (p && ts.isStringLiteral(p.initializer) && (get("element") || get("Component") || get("children") || get("lazy"))) {
      const el = get("element");
      const comp = get("Component");
      let component: string | null = null;
      if (el) {
        let e: ts.Expression = el.initializer;
        while (ts.isParenthesizedExpression(e)) e = e.expression;
        component = ts.isJsxSelfClosingElement(e) ? e.tagName.getText() : ts.isJsxElement(e) ? e.openingElement.tagName.getText() : null;
      } else if (comp && ts.isIdentifier(comp.initializer)) component = comp.initializer.text;
      routes.push({ path: p.initializer.text, component, line: lineOf(sf, node) });
    }
  }
}

function readFile(file: SourceFile, paths: ReadonlySet<string>, propsByUnit: Map<string, ExtractedProp[]>): FileFact {
  const kind = file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, kind);
  const { imports, bindings, unreadable } = readImports(sf, paths, file.path);
  const flags = { router: false };
  const routes: RouteFact[] = [];
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

  // 파일 전체에서: 라우터 설정·라우트, 읽지 못하는 것(동적 import·lazy)
  const walk = (n: ts.Node) => {
    readSpecial(sf, n, unreadable, flags, routes);
    ts.forEachChild(n, walk);
  };
  walk(sf);

  return { path: file.path, useClient, imports, units, defaultExport, routerConfig: flags.router, routes, unreadable };
}

/** 올린 파일(.ts·.tsx, .d.ts 제외)에서 구현 검사에 필요한 사실을 읽는다. 파일 하나가 실패해도 나머지는 계속한다 */
export function readCodeModel(files: SourceFile[]): CodeModel {
  const { components, partialFiles } = extractComponents(files);
  const propsByUnit = new Map(components.map((c) => [`${c.path}#${c.name}`, c.props]));
  const paths = new Set(files.map((f) => f.path));
  const out: FileFact[] = [];
  const failedPaths: string[] = [];
  for (const f of files) {
    if (!/\.tsx?$/.test(f.path) || f.path.endsWith(".d.ts")) continue;
    try {
      out.push(readFile(f, paths, propsByUnit));
    } catch {
      failedPaths.push(f.path);
    }
  }
  return { files: out, failedPaths, partialFiles };
}
