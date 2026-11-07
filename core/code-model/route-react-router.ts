import * as ts from "typescript";
import { joinRoute, type RouteFact } from "./routes";

// React Router 해석기: 객체 설정(`createBrowserRouter([...])`, `useRoutes([...])`)과 `<Route>`를 모두 읽고, 부모 경로를 합쳐 공통 형식으로 바꾼다.
// - `children: [...]`의 자식 객체와 `<Route>` 안의 `<Route>`는 부모 경로 뒤에 붙는다. `/`로 시작하는 자식은 절대 경로다
// - `index`와 path 없는 레이아웃 라우트는 부모 경로 그대로다
// - 자식 라우트를 가진 라우트는 레이아웃(layout: true)으로 적는다
// 알려진 한계: `path`가 변수·계산식이면 읽지 못하고 detail에 적는다. 다른 파일에 나눠 둔 라우트 배열(`children: routes`)은 따라가지 않는다.

const ROUTER_CALLS = new Set(["createBrowserRouter", "createHashRouter", "createMemoryRouter", "createRoutesFromElements", "useRoutes"]);

export type ReactRouterResult = { routerConfig: boolean; routes: RouteFact[]; unreadable: { line: number; detail: string }[] };

const lineOf = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
const unparen = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) ? unparen(e.expression) : e);
const tagOf = (n: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText();
const attrsOf = (n: ts.JsxElement | ts.JsxSelfClosingElement) => (ts.isJsxElement(n) ? n.openingElement : n).attributes.properties;
const isRouteTag = (n: ts.Node): n is ts.JsxElement | ts.JsxSelfClosingElement => (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && tagOf(n) === "Route";

/** 객체에서 이름이 같은 속성 */
const prop = (obj: ts.ObjectLiteralExpression, key: string) =>
  obj.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key);

/** 경로 구간: 문자열이면 그 값, index면 "", 없으면 "" (경로 없는 레이아웃), 변수·계산식이면 undefined(읽지 못함) */
function objectSegment(obj: ts.ObjectLiteralExpression): string | undefined {
  const p = prop(obj, "path");
  if (p) return ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer) ? p.initializer.text : undefined;
  return "";
}

function parentObject(node: ts.ObjectLiteralExpression): ts.ObjectLiteralExpression | null {
  const arr = node.parent;
  if (arr && ts.isArrayLiteralExpression(arr) && arr.parent && ts.isPropertyAssignment(arr.parent) && (ts.isIdentifier(arr.parent.name) || ts.isStringLiteral(arr.parent.name)) && arr.parent.name.text === "children" && ts.isObjectLiteralExpression(arr.parent.parent)) {
    return arr.parent.parent;
  }
  return null;
}

/** 부모 객체들의 경로를 맨 위부터 합친 전체 주소. 중간에 읽지 못하는 구간이 있으면 null */
function objectFullPath(obj: ts.ObjectLiteralExpression): string | null {
  const chain: ts.ObjectLiteralExpression[] = [];
  for (let cur: ts.ObjectLiteralExpression | null = obj; cur; cur = parentObject(cur)) chain.unshift(cur);
  let path = "/";
  for (const o of chain) {
    const seg = objectSegment(o);
    if (seg === undefined) return null;
    path = joinRoute(path, seg);
  }
  return path;
}

function jsxSegment(n: ts.JsxElement | ts.JsxSelfClosingElement): string | undefined {
  const p = attrsOf(n).find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === "path");
  if (!p) return "";
  const init = p.initializer;
  if (init && ts.isStringLiteral(init)) return init.text;
  if (init && ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) return init.expression.text;
  return undefined;
}

function jsxFullPath(node: ts.JsxElement | ts.JsxSelfClosingElement): string | null {
  const chain: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [node];
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) if (isRouteTag(cur)) chain.unshift(cur);
  let path = "/";
  for (const r of chain) {
    const seg = jsxSegment(r);
    if (seg === undefined) return null;
    path = joinRoute(path, seg);
  }
  return path;
}

/** `element: <X />`·`element={<X />}` → "X" */
function elementName(e: ts.Expression | undefined): string | null {
  if (!e) return null;
  const x = unparen(e);
  if (ts.isJsxSelfClosingElement(x)) return x.tagName.getText();
  if (ts.isJsxElement(x)) return x.openingElement.tagName.getText();
  return null;
}

export function readReactRouterRoutes(sf: ts.SourceFile): ReactRouterResult {
  const out: ReactRouterResult = { routerConfig: false, routes: [], unreadable: [] };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const c = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      if (ROUTER_CALLS.has(c)) out.routerConfig = true;
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagOf(node);
      if (tag === "Route" || tag === "Routes") out.routerConfig = true;
      if (tag === "Route") {
        const attrs = attrsOf(node);
        const find = (name: string) => attrs.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name);
        const el = find("element");
        const comp = find("Component");
        const lazyAttr = find("lazy");
        if (el || comp || lazyAttr) {
          const full = jsxFullPath(node);
          if (full === null) out.unreadable.push({ line: lineOf(sf, node), detail: "<Route>의 path 값을 읽지 못함" });
          else {
            const compInit = comp?.initializer;
            const component = el ? elementName(el.initializer && ts.isJsxExpression(el.initializer) ? el.initializer.expression : undefined) : compInit && ts.isJsxExpression(compInit) && compInit.expression && ts.isIdentifier(compInit.expression) ? compInit.expression.text : null;
            const own = jsxSegment(node);
            const layout = ts.isJsxElement(node) && node.children.some((c) => isRouteTag(c));
            out.routes.push({ router: "react-router", path: full, raw: own ?? "", component, layout, line: lineOf(sf, node) });
          }
        }
      }
    }

    // 라우트 객체: path·index가 있거나, 다른 라우트 객체의 children 배열 안에 있는 경로 없는 레이아웃
    if (ts.isObjectLiteralExpression(node) && (prop(node, "path") || prop(node, "index") || parentObject(node))) {
      const el = prop(node, "element");
      const comp = prop(node, "Component");
      const lazyProp = prop(node, "lazy");
      if (el || comp || lazyProp) {
        const full = objectFullPath(node);
        if (full === null) out.unreadable.push({ line: lineOf(sf, node), detail: "라우트 객체의 path 값을 읽지 못함" });
        else {
          const component = el ? elementName(el.initializer) : comp && ts.isIdentifier(comp.initializer) ? comp.initializer.text : null;
          const children = prop(node, "children");
          const layout = !!children && ts.isArrayLiteralExpression(children.initializer) && children.initializer.elements.length > 0;
          const p = prop(node, "path");
          out.routes.push({ router: "react-router", path: full, raw: p && ts.isStringLiteral(p.initializer) ? p.initializer.text : "", component, layout, line: lineOf(sf, node) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
