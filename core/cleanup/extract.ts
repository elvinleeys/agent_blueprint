import * as ts from "typescript";
import type { AnalyzedComponent, ExtractedProp, PartialFile, SourceFile } from "./types";

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const WRAPPERS = new Set(["forwardRef", "memo"]);
const MAX_IMPORT_DEPTH = 8;

type Decl = ts.TypeNode | ts.InterfaceDeclaration;

/** 파일 하나의 선언 모음. imports는 상대 경로 import만 담는다(패키지 import는 따라가지 않음) */
type FileCtx = {
  path: string;
  sf: ts.SourceFile;
  types: Map<string, Decl>;
  /** cva 변수 이름 → { 그룹 이름 → 키 목록 } */
  cva: Map<string, Map<string, string[]>>;
  imports: Map<string, { from: string; name: string }>;
};

/** 올린 파일 전체. .ts는 컴포넌트로 세지 않고 타입을 찾는 데만 쓴다 */
type Project = { sources: Map<string, SourceFile>; cache: Map<string, FileCtx> };

type Collected = {
  props: ExtractedProp[];
  unresolved: string[];
  inherits: string[];
  inheritsComponents: string[];
  cvaVariants: string[] | null;
};

const nameText = (n: ts.PropertyName): string | null =>
  ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : null;

const hasJsx = (node: ts.Node): boolean => {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
  return ts.forEachChild(node, (c) => (hasJsx(c) ? true : undefined)) ?? false;
};

// ── 파일 문맥과 상대 경로 import 따라가기 ─────────────────────────────

/** `cva(base, { variants: { variant: { a: "", b: "" } } })` 에서 그룹별 키를 읽는다 */
function readCva(init: ts.Expression): Map<string, string[]> | null {
  if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression) || init.expression.text !== "cva") return null;
  const config = init.arguments[1];
  if (!config || !ts.isObjectLiteralExpression(config)) return null;
  const variants = config.properties.find(
    (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && nameText(p.name) === "variants",
  );
  if (!variants || !ts.isObjectLiteralExpression(variants.initializer)) return null;
  const groups = new Map<string, string[]>();
  for (const g of variants.initializer.properties) {
    if (!ts.isPropertyAssignment(g) || !ts.isObjectLiteralExpression(g.initializer)) continue;
    const gName = nameText(g.name);
    if (!gName) continue;
    const keys = g.initializer.properties.flatMap((p) => ("name" in p && p.name ? [nameText(p.name as ts.PropertyName)] : [])).filter((k): k is string => !!k);
    groups.set(gName, keys);
  }
  return groups;
}

function buildCtx(file: SourceFile): FileCtx {
  const kind = file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, kind);
  const ctx: FileCtx = { path: file.path, sf, types: new Map(), cva: new Map(), imports: new Map() };
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st)) ctx.types.set(st.name.text, st);
    else if (ts.isTypeAliasDeclaration(st)) ctx.types.set(st.name.text, st.type);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const groups = readCva(d.initializer);
        if (groups) ctx.cva.set(d.name.text, groups);
      }
    } else if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text.startsWith(".")) {
      const bindings = st.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const e of bindings.elements) ctx.imports.set(e.name.text, { from: st.moduleSpecifier.text, name: (e.propertyName ?? e.name).text });
      }
    }
  }
  return ctx;
}

const getCtx = (project: Project, path: string): FileCtx | undefined => {
  const hit = project.cache.get(path);
  if (hit) return hit;
  const src = project.sources.get(path);
  if (!src) return undefined;
  const ctx = buildCtx(src);
  project.cache.set(path, ctx);
  return ctx;
};

/** 올린 파일 경로 기준으로 상대 import를 파일로 바꾼다. 못 찾으면 null */
function resolveImport(project: Project, fromPath: string, spec: string): string | null {
  const parts = fromPath.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const base = parts.join("/");
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((p) => project.sources.has(p)) ?? null;
}

/** 이름의 타입 선언을 같은 파일에서, 없으면 상대 경로 import를 따라 찾는다(import 사슬은 깊이 제한). 순환은 seen이 막는다 */
function lookupType(project: Project, ctx: FileCtx, name: string, depth = 0): { decl: Decl; ctx: FileCtx } | undefined {
  const local = ctx.types.get(name);
  if (local) return { decl: local, ctx };
  const imp = ctx.imports.get(name);
  if (!imp || depth >= MAX_IMPORT_DEPTH) return undefined;
  const target = resolveImport(project, ctx.path, imp.from);
  const tctx = target ? getCtx(project, target) : undefined;
  return tctx ? lookupType(project, tctx, imp.name, depth + 1) : undefined;
}

function lookupCva(project: Project, ctx: FileCtx, name: string, depth = 0): Map<string, string[]> | undefined {
  const local = ctx.cva.get(name);
  if (local) return local;
  const imp = ctx.imports.get(name);
  if (!imp || depth >= MAX_IMPORT_DEPTH) return undefined;
  const target = resolveImport(project, ctx.path, imp.from);
  const tctx = target ? getCtx(project, target) : undefined;
  return tctx ? lookupCva(project, tctx, imp.name, depth + 1) : undefined;
}

// ── HTML 요소·컴포넌트 상속 ─────────────────────────────────────────

const ELEMENT_NAMES: Record<string, string> = { Anchor: "a", Paragraph: "p", TextArea: "textarea", UList: "ul", OList: "ol", LI: "li", Image: "img", Div: "div", Html: "html" };
const toTag = (cls: string) => ELEMENT_NAMES[cls] ?? cls.toLowerCase();

type Inherit = { html: string } | { component: string };

/**
 * 속성을 물려받는 타입이면 대상을 돌려준다.
 * ComponentProps<"button"> → HTML 요소, ComponentProps<typeof DialogPrimitive.Root> → 컴포넌트(글자 그대로),
 * ButtonHTMLAttributes<HTMLButtonElement>·HTMLAttributes<HTMLDivElement> → HTML 요소
 */
function inheritOf(refName: string, typeArgs: readonly ts.TypeNode[] | undefined): Inherit | null {
  const last = refName.split(".").pop() ?? "";
  const arg = typeArgs?.[0];
  if (/^ComponentProps(WithoutRef|WithRef)?$/.test(last)) {
    if (arg && ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal)) return { html: arg.literal.text };
    if (arg && ts.isTypeQueryNode(arg)) return { component: arg.exprName.getText() };
    return null;
  }
  const m = /^(\w*?)HTMLAttributes$/.exec(last);
  if (!m) return null;
  const cls = arg ? /^HTML(\w+)Element$/.exec(arg.getText()) : null;
  if (cls) return { html: toTag(cls[1]) };
  if (arg?.getText() === "HTMLElement") return { html: "element" };
  const tag = m[1] ? m[1].toLowerCase() : arg ? null : "element";
  return tag ? { html: tag } : null;
}

const WRAPPER_TYPES = /^(Omit|Pick|Partial|Required|Readonly)$/;

/** Omit<React.ComponentProps<"input">, "size">처럼 감싼 것도 첫 인자가 상속이면 상속으로 본다 */
function inheritOfRef(name: string | null, refText: string, typeArgs: readonly ts.TypeNode[] | undefined): Inherit | null {
  const direct = inheritOf(refText, typeArgs);
  if (direct) return direct;
  const first = typeArgs?.[0];
  return name && WRAPPER_TYPES.test(name) && first && ts.isTypeReferenceNode(first) ? inheritOf(first.typeName.getText(), first.typeArguments) : null;
}

function recordInherit(out: Collected, inh: Inherit) {
  if ("html" in inh) out.inherits.push(inh.html);
  else out.inheritsComponents.push(inh.component);
}

// ── props 수집 ─────────────────────────────────────────────────────

function fromMembers(members: readonly ts.TypeElement[], out: Collected) {
  for (const m of members) {
    if (ts.isPropertySignature(m)) {
      const name = nameText(m.name);
      if (name) out.props.push({ name, type: m.type?.getText() ?? "unknown", required: !m.questionToken });
    } else if (ts.isMethodSignature(m)) {
      const name = nameText(m.name);
      if (name) out.props.push({ name, type: "function", required: !m.questionToken });
    }
  }
}

function collect(project: Project, node: Decl, ctx: FileCtx, out: Collected, seen: Set<string>) {
  const follow = (name: string) => {
    const found = lookupType(project, ctx, name);
    const key = found ? `${found.ctx.path}#${name}` : "";
    if (!found || seen.has(key)) return false;
    collect(project, found.decl, found.ctx, out, new Set(seen).add(key));
    return true;
  };

  if (ts.isInterfaceDeclaration(node)) {
    fromMembers(node.members, out);
    for (const h of node.heritageClauses ?? []) {
      for (const t of h.types) {
        const name = ts.isIdentifier(t.expression) ? t.expression.text : null;
        const inh = inheritOfRef(name, t.expression.getText(), t.typeArguments);
        if (name && follow(name)) continue;
        if (inh) recordInherit(out, inh);
        else out.unresolved.push(t.getText());
      }
    }
  } else if (ts.isTypeLiteralNode(node)) fromMembers(node.members, out);
  else if (ts.isParenthesizedTypeNode(node)) collect(project, node.type, ctx, out, seen);
  else if (ts.isIntersectionTypeNode(node)) node.types.forEach((t) => collect(project, t, ctx, out, seen));
  else if (ts.isTypeReferenceNode(node)) {
    const name = ts.isIdentifier(node.typeName) ? node.typeName.text : null;
    const arg = node.typeArguments?.[0];
    const inh = inheritOfRef(name, node.typeName.getText(), node.typeArguments);
    const groups =
      name === "VariantProps" && arg && ts.isTypeQueryNode(arg) && ts.isIdentifier(arg.exprName) ? lookupCva(project, ctx, arg.exprName.text) : undefined;
    if (inh) recordInherit(out, inh);
    else if (groups) {
      for (const [group, keys] of groups) {
        out.props.push({ name: group, type: keys.map((k) => JSON.stringify(k)).join(" | ") || "string", required: false });
      }
      out.cvaVariants = groups.get("variant") ?? out.cvaVariants;
    } else if (!(name && follow(name))) out.unresolved.push(node.getText());
  } else out.unresolved.push(node.getText());
}

/** props 타입에서 prop 이름 → 타입 노드(variant 값을 읽기 위한 것). collect와 같은 해석 규칙 */
function propTypeNodes(project: Project, node: Decl, ctx: FileCtx, map: Map<string, { node: ts.TypeNode; ctx: FileCtx }>, seen: Set<string>) {
  const members = (ms: readonly ts.TypeElement[]) => {
    for (const m of ms) {
      if (!ts.isPropertySignature(m) || !m.type) continue;
      const n = nameText(m.name);
      if (n && !map.has(n)) map.set(n, { node: m.type, ctx });
    }
  };
  const follow = (name: string) => {
    const found = lookupType(project, ctx, name);
    const key = found ? `${found.ctx.path}#${name}` : "";
    if (found && !seen.has(key)) propTypeNodes(project, found.decl, found.ctx, map, new Set(seen).add(key));
  };
  if (ts.isInterfaceDeclaration(node)) {
    members(node.members);
    for (const h of node.heritageClauses ?? []) for (const t of h.types) if (ts.isIdentifier(t.expression)) follow(t.expression.text);
  } else if (ts.isTypeLiteralNode(node)) members(node.members);
  else if (ts.isParenthesizedTypeNode(node)) propTypeNodes(project, node.type, ctx, map, seen);
  else if (ts.isIntersectionTypeNode(node)) node.types.forEach((t) => propTypeNodes(project, t, ctx, map, seen));
  else if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) follow(node.typeName.text);
}

/** 유니온 타입 노드에서 문자열 리터럴 값(타입 별칭은 따라간다). 문자열 리터럴이 아닌 멤버가 있으면 null */
function literalUnion(project: Project, type: ts.TypeNode, ctx: FileCtx, depth = 0): string[] | null {
  const members = ts.isUnionTypeNode(type) ? type.types : [type];
  const values: string[] = [];
  for (const m of members) {
    if (m.kind === ts.SyntaxKind.UndefinedKeyword) continue;
    if (ts.isLiteralTypeNode(m) && m.literal.kind === ts.SyntaxKind.NullKeyword) continue;
    if (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal)) values.push(m.literal.text);
    else if (ts.isTypeReferenceNode(m) && ts.isIdentifier(m.typeName) && depth < MAX_IMPORT_DEPTH) {
      const found = lookupType(project, ctx, m.typeName.text);
      const sub = found && !ts.isInterfaceDeclaration(found.decl) ? literalUnion(project, found.decl, found.ctx, depth + 1) : null;
      if (!sub) return null;
      values.push(...sub);
    } else return null;
  }
  return values.length ? values : null;
}

/** 처음 매개변수의 props 타입 노드. forwardRef<Ref, Props>(…)처럼 타입 인자에 있으면 그것을 쓴다 */
function propsTypeNode(fn: FnLike, typeArgs?: readonly ts.TypeNode[]) {
  const p = fn.parameters[0];
  if (p?.type) return p.type;
  return typeArgs && typeArgs.length >= 2 ? typeArgs[1] : typeArgs?.length === 1 ? typeArgs[0] : undefined;
}

type FnLike = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

/** forwardRef(...)·memo(...)를 겹쳐 감싼 것을 벗겨 안쪽 함수와 타입 인자를 돌려준다 */
function unwrap(expr: ts.Expression): { fn: FnLike; typeArgs?: readonly ts.TypeNode[] } | null {
  let typeArgs: readonly ts.TypeNode[] | undefined;
  let cur: ts.Expression = expr;
  while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  while (ts.isCallExpression(cur)) {
    const callee = ts.isPropertyAccessExpression(cur.expression) ? cur.expression.name.text : ts.isIdentifier(cur.expression) ? cur.expression.text : "";
    if (!WRAPPERS.has(callee) || !cur.arguments[0]) return null;
    if (cur.typeArguments) typeArgs = cur.typeArguments;
    cur = cur.arguments[0];
    while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
  }
  return ts.isArrowFunction(cur) || ts.isFunctionExpression(cur) ? { fn: cur, typeArgs } : null;
}

const baseName = (path: string) => (path.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
const toPascal = (s: string) => s.replace(/(^|[-_.\s]+)([a-zA-Z0-9])/g, (_m, _s, c: string) => c.toUpperCase());

function build(project: Project, ctx: FileCtx, name: string, fn: FnLike, typeArgs: readonly ts.TypeNode[] | undefined, exported: boolean): AnalyzedComponent | null {
  if (!fn.body || !hasJsx(fn.body)) return null;
  const out: Collected = { props: [], unresolved: [], inherits: [], inheritsComponents: [], cvaVariants: null };
  const typeNode = propsTypeNode(fn, typeArgs);
  const nodes = new Map<string, { node: ts.TypeNode; ctx: FileCtx }>();
  if (typeNode) {
    collect(project, typeNode, ctx, out, new Set());
    propTypeNodes(project, typeNode, ctx, nodes, new Set());
  }
  const seenNames = new Set<string>();
  const props = out.props.filter((p) => !seenNames.has(p.name) && seenNames.add(p.name));

  const v = nodes.get("variant");
  const variants = (v && literalUnion(project, v.node, v.ctx)) ?? out.cvaVariants ?? [];
  const uniq = (xs: string[]) => [...new Set(xs)];
  return { name, path: ctx.path, props, variants: uniq(variants), inherits: uniq(out.inherits), inheritsComponents: uniq(out.inheritsComponents), unresolved: out.unresolved, exported };
}

// ── 파일·프로젝트 분석 ──────────────────────────────────────────────

export type FileAnalysis = { components: AnalyzedComponent[]; syntaxErrors: PartialFile["errors"] };

const isExported = (st: ts.Statement) => !!ts.getModifiers(st as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword);

/** 문법 오류 목록: 파서가 보고하는 구문 진단만 얻기 위해 transpileModule(타입 검사 없음)을 쓴다 */
function syntaxErrorsOf(file: SourceFile, sf: ts.SourceFile): PartialFile["errors"] {
  const { diagnostics } = ts.transpileModule(file.content, {
    fileName: file.path,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest },
  });
  return (diagnostics ?? []).slice(0, 3).map((d) => ({
    line: d.start === undefined ? 1 : sf.getLineAndCharacterOfPosition(d.start).line + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, " "),
  }));
}

const newProject = (files: SourceFile[]): Project => ({ sources: new Map(files.map((f) => [f.path, f])), cache: new Map() });

/** 컴포넌트를 찾는 파일인가: .tsx만(.d.ts 제외). .ts는 타입을 찾는 데만 쓴다 */
const isComponentFile = (path: string) => path.endsWith(".tsx") && !path.endsWith(".d.tsx");

function analyzeInProject(project: Project, file: SourceFile): FileAnalysis {
  const ctx = getCtx(project, file.path)!;
  const syntaxErrors = syntaxErrorsOf(file, ctx.sf);
  if (!isComponentFile(file.path)) return { components: [], syntaxErrors };

  const found: AnalyzedComponent[] = [];
  const add = (c: AnalyzedComponent | null) => c && !found.some((f) => f.name === c.name) && found.push(c);
  const defaultName = toPascal(baseName(file.path));

  // `export { A, B as C }`(가져오기 없는 것)와 `export default A`로 내보내는 로컬 이름
  const exportedNames = new Set<string>();
  for (const st of ctx.sf.statements) {
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      st.exportClause.elements.forEach((e) => exportedNames.add((e.propertyName ?? e.name).text));
    } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) exportedNames.add(st.expression.text);
  }

  for (const st of ctx.sf.statements) {
    if (ts.isFunctionDeclaration(st)) {
      const isDefault = ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      const name = st.name?.text ?? (isDefault ? defaultName : "");
      if (PASCAL.test(name)) add(build(project, ctx, name, st, undefined, isExported(st) || exportedNames.has(name)));
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !PASCAL.test(d.name.text) || !d.initializer) continue;
        const u = unwrap(d.initializer);
        if (u) add(build(project, ctx, d.name.text, u.fn, u.typeArgs, isExported(st) || exportedNames.has(d.name.text)));
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const u = unwrap(st.expression);
      if (!u) continue;
      const named = ts.isFunctionExpression(u.fn) ? u.fn.name?.text : undefined;
      const name = named && PASCAL.test(named) ? named : defaultName;
      if (PASCAL.test(name)) add(build(project, ctx, name, u.fn, u.typeArgs, true));
    }
  }
  return { components: found, syntaxErrors };
}

/** 파일 하나만으로 분석한다(다른 파일의 타입은 따라가지 않음) */
export const analyzeFile = (file: SourceFile): FileAnalysis => analyzeInProject(newProject([file]), file);

export const extractFromFile = (file: SourceFile) => analyzeFile(file).components;

/**
 * 여러 파일 분석. 올린 파일 안의 상대 경로 import 타입을 따라가며 props를 읽는다.
 * 파일 하나가 분석 중 실패해도 나머지는 계속하고, 문법 오류가 있는 파일은 partialFiles로 알린다
 */
export function extractComponents(files: SourceFile[]): { components: AnalyzedComponent[]; failedPaths: string[]; partialFiles: PartialFile[] } {
  const project = newProject(files);
  const components: AnalyzedComponent[] = [];
  const failedPaths: string[] = [];
  const partialFiles: PartialFile[] = [];
  for (const f of files) {
    try {
      const r = analyzeInProject(project, f);
      components.push(...r.components);
      if (r.syntaxErrors.length) partialFiles.push({ path: f.path, errors: r.syntaxErrors });
    } catch {
      failedPaths.push(f.path);
    }
  }
  return { components, failedPaths, partialFiles };
}
