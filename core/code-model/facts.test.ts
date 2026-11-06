import { describe, expect, it } from "vitest";
import { readClassName } from "./class-names";
import { readCodeModel, type FileFact } from "./facts";
import { resolveModule } from "./imports";
import * as ts from "typescript";

const model = (files: Record<string, string>) => readCodeModel(Object.entries(files).map(([path, content]) => ({ path, content })));
const one = (path: string, content: string, extra: Record<string, string> = {}): FileFact => model({ [path]: content, ...extra }).files.find((f) => f.path === path)!;

describe("resolveModule: import 경로 해석", () => {
  const paths = new Set(["my-app/src/a/B.tsx", "my-app/src/c/index.ts", "my-app/lib/x.ts", "src/y.ts", "my-app/src/pages/P.tsx"]);
  it("상대 경로(확장자·index 생략)", () => {
    expect(resolveModule(paths, "my-app/src/pages/P.tsx", "../a/B")).toBe("my-app/src/a/B.tsx");
    expect(resolveModule(paths, "my-app/src/pages/P.tsx", "../c")).toBe("my-app/src/c/index.ts");
  });
  it("@/는 가져오는 파일의 src/ 앞부분을 루트로 보고 src/ 먼저, 없으면 루트에서 찾는다", () => {
    expect(resolveModule(paths, "my-app/src/pages/P.tsx", "@/a/B")).toBe("my-app/src/a/B.tsx");
    expect(resolveModule(paths, "my-app/src/pages/P.tsx", "@/lib/x")).toBe("my-app/lib/x.ts"); // src/lib/x가 없으면 루트(my-app/)에서
    expect(resolveModule(new Set(["lib/x.ts"]), "app/page.tsx", "@/lib/x")).toBe("lib/x.ts"); // src가 없으면 빈 접두사
    expect(resolveModule(paths, "src/z.ts", "@/y")).toBe("src/y.ts");
  });
  it("패키지·다른 별칭은 null", () => {
    expect(resolveModule(paths, "src/z.ts", "react")).toBeNull();
    expect(resolveModule(paths, "src/z.ts", "~/y")).toBeNull();
    expect(resolveModule(paths, "src/z.ts", "@scope/pkg")).toBeNull();
  });
});

const cls = (attr: string) => {
  const sf = ts.createSourceFile("x.tsx", `const a = <div ${attr} />;`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.JsxAttribute | undefined;
  const walk = (n: ts.Node): void => {
    if (ts.isJsxAttribute(n)) found = n;
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  return readClassName(found!);
};

describe("className 읽기", () => {
  it("문자열 리터럴은 항상 붙는 클래스", () => {
    expect(cls('className="flex  gap-4"')).toEqual({ always: ["flex", "gap-4"], conditional: [], dynamic: false });
    expect(cls('className={"a b"}')).toEqual({ always: ["a", "b"], conditional: [], dynamic: false });
  });
  it("cn·clsx: 문자열은 항상, && 오른쪽·삼항·객체 키는 조건부, 변수·호출은 dynamic", () => {
    expect(cls('className={cn("flex", on && "p-4", big ? "text-lg" : "text-sm", { "m-2": x, hidden: y }, extra)}')).toEqual({
      always: ["flex"],
      conditional: ["p-4", "text-lg", "text-sm", "m-2", "hidden"],
      dynamic: true,
    });
    expect(cls('className={clsx(["a", z && "b"], "c")}')).toEqual({ always: ["a", "c"], conditional: ["b"], dynamic: false });
  });
  it("템플릿 문자열: 고정 조각만 읽고 값이 붙은 조각은 버리며 dynamic", () => {
    expect(cls("className={`flex p-${n} ${open ? 'a' : 'b'} gap-2`}")).toEqual({ always: ["flex", "gap-2"], conditional: [], dynamic: true });
  });
  it("변수·CSS Modules 멤버·전개는 dynamic", () => {
    expect(cls("className={styles.root}")).toEqual({ always: [], conditional: [], dynamic: true });
    expect(cls("className={cn(...list)}").dynamic).toBe(true);
  });
});

describe("readCodeModel: 파일 사실", () => {
  it("use client 지시문은 파일 맨 위에서만 인정한다", () => {
    expect(one("a.tsx", '"use client";\nexport function A() { return <div />; }').useClient).toBe(true);
    expect(one("b.tsx", 'import x from "y";\n"use client";\nexport function B() { return <div />; }').useClient).toBe(false);
    expect(one("c.ts", "export const c = 1;").useClient).toBe(false);
  });

  it("import: 상대·@/ 해석, 타입 전용, 다시 내보내기·동적 import·lazy는 읽지 못함", () => {
    const f = one(
      "src/pages/P.tsx",
      `import type { T } from "@/t";
import { type U, V } from "@/v";
import { lazy } from "react";
export { W } from "./w";
const L = lazy(() => import("./l"));
export function P() { return <div />; }`,
      { "src/t.ts": "export type T = 1;", "src/v.ts": "export type U = 1; export const V = 1;", "src/pages/w.ts": "export const W = 1;" },
    );
    expect(f.imports.map((i) => [i.spec, i.resolved, i.typeOnly, i.reexport])).toEqual([
      ["@/t", "src/t.ts", true, false],
      ["@/v", "src/v.ts", false, false],
      ["react", null, false, false],
      ["./w", "src/pages/w.ts", false, true],
    ]);
    expect(f.unreadable.map((u) => u.reason).sort()).toEqual(["dynamic-import", "lazy", "reexport"]);
  });

  it("컴포넌트: 상태·훅 호출·렌더링 관계·이벤트 props·요소", () => {
    const f = one(
      "src/widgets/Info.tsx",
      `import { useCart } from "@/features/useCart";
import { Price } from "@/entities/Price";
type Props = { onPick: () => void; label: string };
export function Info({ onPick, onClose, label }: Props) {
  const [sel, setSel] = useState(null);
  const { count } = useCart();
  return (
    <div className="flex" style={{ margin: 1 }}>
      <Price />
      <Ui.Box onHover={() => {}} />
      <button onClick={onPick}>{label}</button>
    </div>
  );
}`,
      { "src/features/useCart.ts": "export function useCart() { return { count: 1 }; }", "src/entities/Price.tsx": "export function Price() { return <p />; }" },
    );
    const u = f.units[0];
    expect(u).toMatchObject({ name: "Info", kind: "component", exported: true, state: ["sel"] });
    expect(u.hooks).toEqual([{ name: "useState", path: null }, { name: "useCart", path: "src/features/useCart.ts" }]);
    expect(u.rendered).toEqual([
      { tag: "Price", name: "Price", path: "src/entities/Price.tsx" },
      { tag: "Ui.Box", name: "Ui", path: null },
    ]);
    expect(u.eventProps.sort()).toEqual(["onClose", "onPick"]);
    expect(u.props.map((p) => p.name)).toEqual(["onPick", "label"]);
    expect(u.elements.map((e) => [e.tag, e.root])).toEqual([["div", true], ["Price", false], ["Ui.Box", false], ["button", false]]);
    expect(u.elements[0]).toMatchObject({ className: { always: ["flex"] }, inlineStyle: true });
    expect(u.elements[2]).toMatchObject({ eventAttrs: ["onHover"] });
    expect(u.elements[3]).toMatchObject({ eventAttrs: ["onClick"], className: null, inlineStyle: false });
  });

  it("props 객체로 받은 이벤트(props.onX), Fragment 안 최상위는 모두 root, map 안은 root 아님", () => {
    const u = one("A.tsx", "export const A = (props: { onGo: () => void }) => <><h1 className='m-2' /><ul>{[1].map((n) => <li key={n} onClick={props.onGo} />)}</ul></>;").units[0];
    expect(u.eventProps).toEqual(["onGo"]);
    expect(u.elements.map((e) => [e.tag, e.root])).toEqual([["h1", true], ["ul", true], ["li", false]]);
  });

  it("훅: use로 시작하는 함수는 JSX가 없어도 단위로 읽고 안의 조회 호출을 담는다", () => {
    const u = one("src/useP.ts", `export function useP() { const [p, setP] = useState(0); useEffect(() => { fetch("/a"); }, []); return p; }`).units[0];
    expect(u).toMatchObject({ name: "useP", kind: "hook", state: ["p"] });
    expect(u.fetchCalls).toEqual([{ callee: "fetch", line: 1 }]);
  });

  it("조회 호출 목록: fetch·axios·supabase·조회 훅·use(promise). 비슷하지만 아닌 것은 걸리지 않는다", () => {
    const body = `
      fetch("/a"); axios.get("/b"); axios.create(); window.fetch("/c");
      supabase.from("t").select(); db.from("t"); useQuery({}); useSWR("/k"); use(loadItem()); use(ThemeContext); use(promise);
      client.get("/x"); cache.fetch(1);`;
    const u = one("S.tsx", `export function S() { ${body} return <div />; }`).units[0];
    expect(u.fetchCalls.map((c) => c.callee)).toEqual(["fetch", "axios.get", "fetch", "supabase.from", "useQuery", "useSWR", "use", "use"]);
  });

  it("기본 내보내기·export { } 이름과 내부용(내보내지 않음) 구분", () => {
    const f = one("Page.tsx", "function Inner() { return <i />; }\nfunction Page() { return <Inner />; }\nexport default Page;");
    expect(f.defaultExport).toBe("Page");
    expect(f.units.map((u) => [u.name, u.exported])).toEqual([["Inner", false], ["Page", true]]);
  });

  it("라우터: createBrowserRouter 객체·<Route>에서 경로와 컴포넌트를 읽고, 없으면 routerConfig false", () => {
    const a = one("router.tsx", 'export const r = createBrowserRouter([{ path: "/p/:id", element: <Page /> }, { path: "/q", Component: Q }]);');
    expect(a.routerConfig).toBe(true);
    expect(a.routes.map((r) => [r.path, r.component])).toEqual([["/p/:id", "Page"], ["/q", "Q"]]);
    const b = one("App.tsx", 'export function App() { return <Routes><Route path="/x" element={<X />} /></Routes>; }');
    expect(b.routerConfig).toBe(true);
    expect(b.routes.map((r) => [r.path, r.component])).toEqual([["/x", "X"]]);
    expect(one("c.tsx", "export function C() { return <div />; }").routerConfig).toBe(false);
  });

  it("문법 오류·.d.ts: .d.ts는 읽지 않고, 문법 오류가 있어도 나머지는 계속", () => {
    const m = model({ "a.d.ts": "declare const x: 1;", "b.tsx": "export function B() { return <div>; }", "c.tsx": "export function C() { return <i />; }" });
    expect(m.files.map((f) => f.path)).toEqual(["b.tsx", "c.tsx"]);
    expect(m.partialFiles.map((p) => p.path)).toEqual(["b.tsx"]);
  });
});
