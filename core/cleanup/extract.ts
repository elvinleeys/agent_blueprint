import * as ts from "typescript";
import type { AnalyzedComponent, ExtractedProp, SourceFile } from "./types";

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const WRAPPERS = new Set(["forwardRef", "memo"]);

type Ctx = {
  sf: ts.SourceFile;
  types: Map<string, ts.TypeNode | ts.InterfaceDeclaration>;
  /** cva 변수 이름 → { 그룹 이름 → 키 목록 } */
  cva: Map<string, Map<string, string[]>>;
};

type Collected = { props: ExtractedProp[]; unresolved: string[] };

const nameText = (n: ts.PropertyName): string | null =>
  ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : null;

const hasJsx = (node: ts.Node): boolean => {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
  return ts.forEachChild(node, (c) => (hasJsx(c) ? true : undefined)) ?? false;
};

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

function collectDeclarations(sf: ts.SourceFile): Pick<Ctx, "types" | "cva"> {
  const types: Ctx["types"] = new Map();
  const cva: Ctx["cva"] = new Map();
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st)) types.set(st.name.text, st);
    else if (ts.isTypeAliasDeclaration(st)) types.set(st.name.text, st.type);
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const groups = readCva(d.initializer);
        if (groups) cva.set(d.name.text, groups);
      }
    }
  }
  return { types, cva };
}

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

function collect(node: ts.TypeNode | ts.InterfaceDeclaration, ctx: Ctx, out: Collected, seen: Set<string>) {
  if (ts.isInterfaceDeclaration(node)) {
    fromMembers(node.members, out);
    for (const h of node.heritageClauses ?? []) {
      for (const t of h.types) {
        const name = ts.isIdentifier(t.expression) ? t.expression.text : null;
        const local = name ? ctx.types.get(name) : undefined;
        if (name && local && !seen.has(name)) collect(local, ctx, out, new Set(seen).add(name));
        else out.unresolved.push(t.getText());
      }
    }
  } else if (ts.isTypeLiteralNode(node)) fromMembers(node.members, out);
  else if (ts.isParenthesizedTypeNode(node)) collect(node.type, ctx, out, seen);
  else if (ts.isIntersectionTypeNode(node)) node.types.forEach((t) => collect(t, ctx, out, seen));
  else if (ts.isTypeReferenceNode(node)) {
    const name = ts.isIdentifier(node.typeName) ? node.typeName.text : null;
    const local = name ? ctx.types.get(name) : undefined;
    const arg = node.typeArguments?.[0];
    if (name === "VariantProps" && arg && ts.isTypeQueryNode(arg) && ts.isIdentifier(arg.exprName) && ctx.cva.has(arg.exprName.text)) {
      for (const [group, keys] of ctx.cva.get(arg.exprName.text)!) {
        out.props.push({ name: group, type: keys.map((k) => JSON.stringify(k)).join(" | ") || "string", required: false });
      }
    } else if (name && local && !seen.has(name)) collect(local, ctx, out, new Set(seen).add(name));
    else out.unresolved.push(node.getText());
  } else out.unresolved.push(node.getText());
}

/** 유니온 타입 노드에서 문자열 리터럴 값. 문자열 리터럴이 아닌 멤버가 있으면 null */
function literalUnion(type: ts.TypeNode): string[] | null {
  const members = ts.isUnionTypeNode(type) ? type.types : [type];
  const values: string[] = [];
  for (const m of members) {
    if (m.kind === ts.SyntaxKind.UndefinedKeyword) continue;
    if (ts.isLiteralTypeNode(m) && m.literal.kind === ts.SyntaxKind.NullKeyword) continue;
    if (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal)) values.push(m.literal.text);
    else return null;
  }
  return values.length ? values : null;
}

/** 처음 매개변수의 props 타입 노드. forwardRef<Ref, Props>(…)처럼 타입 인자에 있으면 그것을 쓴다 */
function propsTypeNode(fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration, typeArgs?: readonly ts.TypeNode[]) {
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

function build(name: string, fn: FnLike, typeArgs: readonly ts.TypeNode[] | undefined, path: string, ctx: Ctx): AnalyzedComponent | null {
  if (!fn.body || !hasJsx(fn.body)) return null;
  const out: Collected = { props: [], unresolved: [] };
  const typeNode = propsTypeNode(fn, typeArgs);
  if (typeNode) collect(typeNode, ctx, out, new Set());
  const seenNames = new Set<string>();
  const props = out.props.filter((p) => !seenNames.has(p.name) && seenNames.add(p.name));

  let variants: string[] = [];
  const typeNodeByName = new Map<string, ts.TypeNode>();
  if (typeNode) collectPropTypeNodes(typeNode, ctx, typeNodeByName, new Set());
  const vNode = typeNodeByName.get("variant");
  const literal = vNode ? literalUnion(vNode) : null;
  if (literal) variants = literal;
  else {
    const cvaProp = props.find((p) => p.name === "variant");
    const fromCva = cvaProp ? readVariantFromCva(ctx, typeNode) : null;
    if (fromCva) variants = fromCva;
  }
  return { name, path, props, variants: [...new Set(variants)], unresolved: out.unresolved };
}

/** variant prop의 타입 노드를 찾기 위해 props 타입을 한 번 더 훑는다(collect와 같은 해석 규칙) */
function collectPropTypeNodes(node: ts.TypeNode | ts.InterfaceDeclaration, ctx: Ctx, map: Map<string, ts.TypeNode>, seen: Set<string>) {
  const members = (ms: readonly ts.TypeElement[]) => {
    for (const m of ms) {
      if (ts.isPropertySignature(m) && m.type) {
        const n = nameText(m.name);
        if (n && !map.has(n)) map.set(n, m.type);
      }
    }
  };
  if (ts.isInterfaceDeclaration(node)) {
    members(node.members);
    for (const h of node.heritageClauses ?? []) {
      for (const t of h.types) {
        const name = ts.isIdentifier(t.expression) ? t.expression.text : null;
        const local = name ? ctx.types.get(name) : undefined;
        if (name && local && !seen.has(name)) collectPropTypeNodes(local, ctx, map, new Set(seen).add(name));
      }
    }
  } else if (ts.isTypeLiteralNode(node)) members(node.members);
  else if (ts.isParenthesizedTypeNode(node)) collectPropTypeNodes(node.type, ctx, map, seen);
  else if (ts.isIntersectionTypeNode(node)) node.types.forEach((t) => collectPropTypeNodes(t, ctx, map, seen));
  else if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    const local = ctx.types.get(node.typeName.text);
    if (local && !seen.has(node.typeName.text)) collectPropTypeNodes(local, ctx, map, new Set(seen).add(node.typeName.text));
  }
}

/** props 타입 안의 VariantProps<typeof x>가 가리키는 cva 정의에서 variant 그룹의 키 */
function readVariantFromCva(ctx: Ctx, typeNode: ts.TypeNode | undefined): string[] | null {
  if (!typeNode) return null;
  let found: string[] | null = null;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && n.typeName.text === "VariantProps") {
      const arg = n.typeArguments?.[0];
      if (arg && ts.isTypeQueryNode(arg) && ts.isIdentifier(arg.exprName)) found = ctx.cva.get(arg.exprName.text)?.get("variant") ?? null;
    }
    ts.forEachChild(n, visit);
  };
  visit(typeNode);
  return found;
}

/** 파일 하나에서 컴포넌트(PascalCase 이름, JSX를 반환하는 함수)를 찾는다 */
export function extractFromFile(file: SourceFile): AnalyzedComponent[] {
  const sf = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ctx: Ctx = { sf, ...collectDeclarations(sf) };
  const found: AnalyzedComponent[] = [];
  const add = (c: AnalyzedComponent | null) => c && !found.some((f) => f.name === c.name) && found.push(c);
  const defaultName = toPascal(baseName(file.path));

  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st)) {
      const isDefault = ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      const name = st.name?.text ?? (isDefault ? defaultName : "");
      if (PASCAL.test(name)) add(build(name, st, undefined, file.path, ctx));
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !PASCAL.test(d.name.text) || !d.initializer) continue;
        const u = unwrap(d.initializer);
        if (u) add(build(d.name.text, u.fn, u.typeArgs, file.path, ctx));
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const u = unwrap(st.expression);
      if (!u) continue;
      const named = ts.isFunctionExpression(u.fn) ? u.fn.name?.text : undefined;
      const name = named && PASCAL.test(named) ? named : defaultName;
      if (PASCAL.test(name)) add(build(name, u.fn, u.typeArgs, file.path, ctx));
    }
  }
  return found;
}

/** 여러 파일 분석. 파일 하나가 분석 중 실패해도 나머지는 계속한다 */
export function extractComponents(files: SourceFile[]): { components: AnalyzedComponent[]; failedPaths: string[] } {
  const components: AnalyzedComponent[] = [];
  const failedPaths: string[] = [];
  for (const f of files) {
    try {
      components.push(...extractFromFile(f));
    } catch {
      failedPaths.push(f.path);
    }
  }
  return { components, failedPaths };
}
