import * as ts from "typescript";
import {
  FETCH_CLIENT_FUNCTIONS,
  FETCH_CONFIG_FUNCTIONS,
  FETCH_METHODS,
  METHOD_KIND,
  QUERY_CLIENT_METHODS,
  QUERY_CLIENT_NAME,
  READ_HOOKS,
  SUPABASE_READ,
  SUPABASE_WRITE,
  USE_FUNCTION,
  WRITE_HOOKS,
  type FetchKind,
} from "./fetch-calls";

export type FetchCall = { callee: string; kind: FetchKind };

const methodKind = (name: string): FetchKind => METHOD_KIND[name.toLowerCase()] ?? "UNKNOWN";

const strip = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) ? strip(e.expression) : e);
const isText = (e: ts.Expression): e is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);

/**
 * 옵션 객체에서 HTTP method를 읽는다.
 * 옵션이 없거나 객체에 method가 없으면 GET(READ), 문자열이면 그 값, 변수·전개·객체가 아닌 옵션이면 UNKNOWN.
 */
function kindFromOptions(arg: ts.Expression | undefined): FetchKind {
  if (!arg) return "READ";
  const e = strip(arg);
  if (!ts.isObjectLiteralExpression(e)) return "UNKNOWN";
  if (e.properties.some((p) => ts.isSpreadAssignment(p))) return "UNKNOWN";
  for (const p of e.properties) {
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === "method") return "UNKNOWN";
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "method") {
      const v = strip(p.initializer);
      return isText(v) ? methodKind(v.text) : "UNKNOWN";
    }
  }
  return "READ";
}

/** `fetch(주소, 옵션)`: 첫 인자가 Request 객체면 그 안의 method를 알 수 없으므로 UNKNOWN */
function fetchKind(args: ts.NodeArray<ts.Expression>): FetchKind {
  const first = args[0] && strip(args[0]);
  if (first && ts.isNewExpression(first)) return "UNKNOWN";
  return kindFromOptions(args[1]);
}

/** `axios(설정)`·`axios(주소, 설정)`·`axios.request(설정)` */
function configKind(args: ts.NodeArray<ts.Expression>): FetchKind {
  const first = args[0] && strip(args[0]);
  return kindFromOptions(first && isText(first) ? args[1] : args[0]);
}

/** `supabase.from("t").select()`처럼 `.from(...)` 뒤에 이어진 체인에서 처음 만나는 select·insert 등으로 유형을 정한다 */
function supabaseKind(call: ts.CallExpression): FetchKind {
  let node: ts.Node = call;
  while (node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && node.parent.parent && ts.isCallExpression(node.parent.parent) && node.parent.parent.expression === node.parent) {
    const m = node.parent.name.text;
    if (SUPABASE_WRITE.has(m)) return "WRITE";
    if (SUPABASE_READ.has(m)) return "READ";
    node = node.parent.parent;
  }
  return "UNKNOWN";
}

/** 호출이 데이터 요청이면 이름과 유형을 돌려준다. 어떤 호출을 요청으로 보는지는 fetch-calls.ts의 목록이 정한다 */
export function classifyFetchCall(call: ts.CallExpression): FetchCall | null {
  const e = call.expression;
  const args = call.arguments;
  if (ts.isIdentifier(e)) {
    const n = e.text;
    if (READ_HOOKS.has(n)) return { callee: n, kind: "READ" };
    if (WRITE_HOOKS.has(n)) return { callee: n, kind: "WRITE" };
    if (FETCH_CONFIG_FUNCTIONS.has(n)) return { callee: n, kind: configKind(args) };
    if (FETCH_CLIENT_FUNCTIONS.has(n)) return { callee: n, kind: fetchKind(args) };
    if (n === USE_FUNCTION) {
      const a = args[0];
      return a && (ts.isCallExpression(a) || (ts.isIdentifier(a) && !a.text.endsWith("Context"))) ? { callee: n, kind: "UNKNOWN" } : null;
    }
    return null;
  }
  if (!ts.isPropertyAccessExpression(e)) return null;
  const obj = e.expression.getText();
  const method = e.name.text;
  if (method === "fetch" && /^(window|globalThis|self)$/.test(obj)) return { callee: "fetch", kind: fetchKind(args) };
  if (FETCH_METHODS[obj]?.has(method)) return { callee: `${obj}.${method}`, kind: method === "request" ? configKind(args) : methodKind(method) };
  if (QUERY_CLIENT_METHODS.has(method) && QUERY_CLIENT_NAME.test(obj)) return { callee: `${obj}.${method}`, kind: method === "from" ? supabaseKind(call) : "UNKNOWN" };
  return null;
}
