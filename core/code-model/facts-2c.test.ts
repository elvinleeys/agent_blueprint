import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { classState, fetchSummary, pageRoutes, readCodeModel, unreadableScope, type FileFact } from "./facts";
import { classifyFetchCall } from "./fetch-kind";
import { filterFiles } from "./filter-files";
import { createImportResolver } from "./imports";
import { CLEANUP_OPTIONS } from "./options";
import { nextAppRoute } from "./route-next-app";
import { joinRoute } from "./routes";
import { configFor, readPathConfigs } from "./tsconfig";

const src = (files: Record<string, string>) => Object.entries(files).map(([path, content]) => ({ path, content }));
const model = (files: Record<string, string>, options?: Parameters<typeof readCodeModel>[1]) => readCodeModel(src(files), options);
const one = (path: string, files: Record<string, string>): FileFact => model(files).files.find((f) => f.path === path)!;

describe("tsconfig·jsconfig paths 읽기", () => {
  it("주석·끝 쉼표를 허용하고, paths는 설정 파일 폴더(baseUrl이 있으면 baseUrl) 기준으로 푼다", () => {
    const c = readPathConfigs(src({ "app/tsconfig.json": `{\n // 주석\n "compilerOptions": { /* 별칭 */ "paths": { "~/*": ["./src/*"], }, }\n}` }));
    expect(c.notes).toEqual([]);
    expect(configFor(c, "app/src/a/B.tsx")).toMatchObject({ pathsBase: "app", paths: [{ pattern: "~/*", targets: ["./src/*"] }], baseUrl: null });
    expect(configFor(c, "other/C.tsx")).toBeNull();
    const withBase = readPathConfigs(src({ "tsconfig.json": `{"compilerOptions":{"baseUrl":"src","paths":{"@lib/*":["lib/*"]}}}` }));
    expect(configFor(withBase, "src/x.ts")).toMatchObject({ pathsBase: "src", baseUrl: "src" });
  });

  it("올린 상대 경로 extends는 따라가 합치고(자식이 덮음), 못 따라가는 extends는 기록한다", () => {
    const followed = readPathConfigs(src({ "tsconfig.base.json": `{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}`, "tsconfig.json": `{"extends":"./tsconfig.base.json"}` }));
    expect(followed.notes).toEqual([]);
    expect(configFor(followed, "src/a.ts")?.paths).toEqual([{ pattern: "@/*", targets: ["./src/*"] }]);
    const overridden = readPathConfigs(src({ "tsconfig.base.json": `{"compilerOptions":{"paths":{"@/*":["./a/*"]}}}`, "tsconfig.json": `{"extends":"./tsconfig.base.json","compilerOptions":{"paths":{"@/*":["./b/*"]}}}` }));
    expect(configFor(overridden, "x.ts")?.paths).toEqual([{ pattern: "@/*", targets: ["./b/*"] }]);
    const missing = readPathConfigs(src({ "tsconfig.json": `{"extends":["./nope.json","@tsconfig/node20/tsconfig.json"],"compilerOptions":{"paths":{"~/*":["./*"]}}}` }));
    expect(missing.notes).toEqual([
      { path: "tsconfig.json", reason: "extends-not-followed", extends: "./nope.json" },
      { path: "tsconfig.json", reason: "extends-not-followed", extends: "@tsconfig/node20/tsconfig.json" },
    ]);
    expect(configFor(missing, "a.ts")?.paths).toHaveLength(1); // 따라가지 못해도 이 파일의 paths는 쓴다
  });

  it("읽지 못하는 설정은 기록하고 건너뛴다. 같은 폴더에 둘 다 있으면 tsconfig가 jsconfig를 덮는다", () => {
    expect(readPathConfigs(src({ "tsconfig.json": "{ not json" })).notes).toEqual([{ path: "tsconfig.json", reason: "invalid-json" }]);
    const both = readPathConfigs(src({ "jsconfig.json": `{"compilerOptions":{"paths":{"@/*":["./j/*"]}}}`, "tsconfig.json": `{"compilerOptions":{"paths":{"@/*":["./t/*"]}}}` }));
    expect(configFor(both, "a.ts")?.paths[0].targets).toEqual(["./t/*"]);
  });
});

describe("import 해석기: 설정 우선, 없으면 기본 규칙, 못 풀면 null", () => {
  const files = ["src/a/B.tsx", "src/lib/x.ts", "lib/y.ts", "src/pages/P.tsx", "app/src/z.ts", "web/src/q.ts"];
  const set = new Set(files);
  const cfg = readPathConfigs(src({ "tsconfig.json": `{"compilerOptions":{"paths":{"~/*":["./src/*"],"@/*":["./src/*"],"#exact":["./lib/y.ts"]}}}` }));

  it("설정의 paths로 푼다(와일드카드·정확히 같은 키)", () => {
    const r = createImportResolver(set, "tsconfig", cfg);
    expect(r("src/pages/P.tsx", "~/a/B")).toEqual({ resolved: "src/a/B.tsx", kind: "alias", by: "tsconfig", config: "tsconfig.json" });
    expect(r("src/pages/P.tsx", "#exact").resolved).toBe("lib/y.ts");
  });

  it("paths를 정의한 설정이 있으면 거기 없는 별칭은 기본 규칙으로 몰래 풀지 않는다", () => {
    const only = readPathConfigs(src({ "tsconfig.json": `{"compilerOptions":{"paths":{"~/*":["./src/*"]}}}` }));
    const r = createImportResolver(set, "tsconfig", only)("src/pages/P.tsx", "@/a/B");
    expect(r).toMatchObject({ resolved: null, kind: "alias", by: null });
  });

  it("설정이 없거나 paths가 없으면 기본 규칙(@/ → src/ 또는 프로젝트 루트)", () => {
    const none = createImportResolver(set, "tsconfig", null);
    expect(none("src/pages/P.tsx", "@/a/B")).toEqual({ resolved: "src/a/B.tsx", kind: "alias", by: "default" });
    expect(none("src/pages/P.tsx", "@/../lib/y")).toMatchObject({ resolved: null });
    expect(none("app/page.tsx", "@/lib/y")).toMatchObject({ resolved: "lib/y.ts", by: "default" });
    const noPaths = readPathConfigs(src({ "tsconfig.json": `{"compilerOptions":{"jsx":"preserve"}}` }));
    expect(createImportResolver(set, "tsconfig", noPaths)("src/pages/P.tsx", "@/a/B").resolved).toBe("src/a/B.tsx");
  });

  it("알 수 없는 별칭은 resolved null + kind alias, 패키지는 kind package, 상대 경로는 relative", () => {
    const r = createImportResolver(set, "tsconfig", null);
    expect(r("src/pages/P.tsx", "~/a/B")).toEqual({ resolved: null, kind: "alias", by: null });
    expect(r("src/pages/P.tsx", "react")).toEqual({ resolved: null, kind: "package", by: null });
    expect(r("src/pages/P.tsx", "@scope/pkg")).toMatchObject({ kind: "package" });
    expect(r("src/pages/P.tsx", "../a/B")).toEqual({ resolved: "src/a/B.tsx", kind: "relative", by: "relative" });
    expect(r("src/pages/P.tsx", "../a/Nope")).toEqual({ resolved: null, kind: "relative", by: null });
  });

  it("baseUrl만 있으면 별칭 없는 bare import를 baseUrl 기준으로 푼다", () => {
    const base = readPathConfigs(src({ "tsconfig.json": `{"compilerOptions":{"baseUrl":"src"}}` }));
    expect(createImportResolver(set, "tsconfig", base)("src/pages/P.tsx", "a/B")).toMatchObject({ resolved: "src/a/B.tsx", by: "tsconfig" });
  });

  it("가장 가까운 위쪽 폴더의 설정을 쓴다(폴더 이름이 앞에 붙은 업로드)", () => {
    const c = readPathConfigs(src({ "web/tsconfig.json": `{"compilerOptions":{"paths":{"~/*":["./src/*"]}}}` }));
    const r = createImportResolver(set, "tsconfig", c);
    expect(r("web/src/q.ts", "~/q")).toMatchObject({ resolved: "web/src/q.ts", by: "tsconfig", config: "web/tsconfig.json" });
    expect(r("src/pages/P.tsx", "~/q")).toMatchObject({ resolved: null, kind: "alias" }); // web/ 밖의 파일에는 그 설정이 적용되지 않는다
  });

  it("모드 off: 상대 경로만 풀고 @/는 풀지 않는다(디자인 시스템 정리 설정)", () => {
    const off = createImportResolver(set, "off", cfg);
    expect(off("src/pages/P.tsx", "@/a/B")).toEqual({ resolved: null, kind: "alias", by: null });
    expect(off("src/pages/P.tsx", "../a/B").resolved).toBe("src/a/B.tsx");
    expect(CLEANUP_OPTIONS.aliases).toBe("off");
  });
});

describe("업로드 거르기: 설정 파일은 옵션을 줄 때만 받는다", () => {
  const entries = [{ path: "tsconfig.json", size: 10 }, { path: "app/jsconfig.json", size: 10 }, { path: "node_modules/x/tsconfig.json", size: 10 }, { path: "package.json", size: 10 }, { path: "a.tsx", size: 10 }];
  it("기본값은 그대로 .ts·.tsx만(디자인 시스템 정리 결과가 변하지 않는다)", () => {
    expect(filterFiles(entries).accepted.map((e) => e.path)).toEqual(["a.tsx"]);
  });
  it("allowConfigFiles: tsconfig.json·jsconfig.json만 더 받고, 제외 폴더 안과 다른 json은 거른다", () => {
    expect(filterFiles(entries, { allowConfigFiles: true }).accepted.map((e) => e.path)).toEqual(["tsconfig.json", "app/jsconfig.json", "a.tsx"]);
  });
});

// ── 서버 통신 분류 ──────────────────────────────────────────────────
const callOf = (code: string): ts.CallExpression => {
  const sf = ts.createSourceFile("x.ts", code, ts.ScriptTarget.Latest, true);
  let found: ts.CallExpression | undefined;
  const walk = (n: ts.Node): void => {
    if (!found && ts.isCallExpression(n) && classifyFetchCall(n)) found = n;
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  return found!;
};
const kind = (code: string) => classifyFetchCall(callOf(code))?.kind;

describe("서버 통신 분류: READ · WRITE · UNKNOWN", () => {
  it("fetch: method 없음=READ, POST·PUT·PATCH·DELETE=WRITE, method가 변수·전개·Request면 UNKNOWN", () => {
    expect(kind('fetch("/a")')).toBe("READ");
    expect(kind('fetch("/a", { headers: {} })')).toBe("READ");
    expect(kind('fetch("/a", { method: "get" })')).toBe("READ");
    expect(["POST", "PUT", "PATCH", "DELETE", "delete"].map((m) => kind(`fetch("/a", { method: "${m}" })`))).toEqual(["WRITE", "WRITE", "WRITE", "WRITE", "WRITE"]);
    expect(kind('fetch("/a", { method })')).toBe("UNKNOWN");
    expect(kind('fetch("/a", { method: m })')).toBe("UNKNOWN");
    expect(kind('fetch("/a", { ...opts })')).toBe("UNKNOWN");
    expect(kind('fetch("/a", opts)')).toBe("UNKNOWN");
    expect(kind('fetch(new Request("/a"))')).toBe("UNKNOWN");
    expect(kind('window.fetch("/a", { method: "POST" })')).toBe("WRITE");
  });

  it("axios·ky·got: 메서드 이름으로, axios(설정)·request(설정)은 설정의 method로", () => {
    expect(kind('axios.get("/a")')).toBe("READ");
    expect(kind('axios.head("/a")')).toBe("READ");
    expect(["post", "put", "patch", "delete"].map((m) => kind(`axios.${m}("/a")`))).toEqual(["WRITE", "WRITE", "WRITE", "WRITE"]);
    expect(kind('ky.post("/a")')).toBe("WRITE");
    expect(kind('got.get("/a")')).toBe("READ");
    expect(kind('axios({ url: "/a" })')).toBe("READ");
    expect(kind('axios({ method: "post", url: "/a" })')).toBe("WRITE");
    expect(kind('axios("/a", { method: "delete" })')).toBe("WRITE");
    expect(kind("axios.request(cfg)")).toBe("UNKNOWN");
    expect(kind('ky("/a", { method: "post" })')).toBe("WRITE");
  });

  it("조회 훅=READ, useMutation=WRITE, use(promise)=UNKNOWN", () => {
    expect(["useQuery", "useInfiniteQuery", "useSuspenseQuery", "useSWR", "useSWRImmutable"].map((h) => kind(`${h}({})`))).toEqual(["READ", "READ", "READ", "READ", "READ"]);
    expect(kind("useMutation({})")).toBe("WRITE");
    expect(kind("use(load())")).toBe("UNKNOWN");
  });

  it("supabase: select=READ, insert·update·delete·upsert=WRITE(처음 만나는 것이 정함), rpc·체인 없음=UNKNOWN", () => {
    expect(kind('supabase.from("t").select("*").eq("a", 1)')).toBe("READ");
    expect(["insert", "update", "delete", "upsert"].map((m) => kind(`supabase.from("t").${m}({})`))).toEqual(["WRITE", "WRITE", "WRITE", "WRITE"]);
    expect(kind('supabase.from("t").insert({}).select()')).toBe("WRITE");
    expect(kind('supabase.rpc("f")')).toBe("UNKNOWN");
    expect(kind('supabase.from("t")')).toBe("UNKNOWN");
  });

  it("컴포넌트 요약: 조회+변경은 합쳐 한 가지, 판별 불가만 있으면 UNKNOWN, 요청 없으면 null", () => {
    const u = (body: string) => one("A.tsx", { "A.tsx": `export function A() { ${body} return <i />; }` }).units[0];
    expect(fetchSummary(u('fetch("/a");'))).toBe("READ");
    expect(fetchSummary(u('fetch("/a", { method: "POST" });'))).toBe("WRITE");
    expect(fetchSummary(u('fetch("/a"); fetch("/b", { method: "PUT" });'))).toBe("READ+WRITE");
    expect(fetchSummary(u('fetch("/a", { method });'))).toBe("UNKNOWN");
    expect(fetchSummary(u('fetch("/a", { method }); fetch("/b");'))).toBe("READ");
    expect(fetchSummary(u("const x = 1;"))).toBeNull();
  });
});

// ── 클래스 분류 ─────────────────────────────────────────────────────
describe("클래스 분류: ALWAYS · CONDITIONAL · DYNAMIC · ABSENT", () => {
  const info = (always: string[], conditional: string[] = [], dynamic = false) => ({ always, conditional, dynamic });
  it("항상 > 조건부 > (못 읽은 부분이 있으면) DYNAMIC > ABSENT", () => {
    expect(classState(info(["a"]), "a")).toBe("ALWAYS");
    expect(classState(info([], ["a"]), "a")).toBe("CONDITIONAL");
    expect(classState(info(["b"], [], true), "a")).toBe("DYNAMIC");
    expect(classState(info(["b"], ["c"]), "a")).toBe("ABSENT");
    expect(classState(null, "a")).toBe("ABSENT");
  });
  it("같은 요소에 DYNAMIC이 하나라도 있으면 ABSENT로 확정하지 않는다(cn 변수 인자, styles.x, 템플릿의 ${})", () => {
    const state = (attr: string, cls: string) => {
      const f = one("A.tsx", { "A.tsx": `export function A() { return <div ${attr} />; }` });
      return classState(f.units[0].elements[0].className, cls);
    };
    expect(state('className={cn("flex", extra)}', "gap-4")).toBe("DYNAMIC");
    expect(state("className={styles.root}", "gap-4")).toBe("DYNAMIC");
    expect(state("className={`flex ${x}`}", "gap-4")).toBe("DYNAMIC");
    expect(state('className="flex"', "gap-4")).toBe("ABSENT");
    expect(state("", "gap-4")).toBe("ABSENT");
  });
  it("`{...props}` 전개가 있으면 className을 읽지 못한 것으로 본다(없다고 확정하지 않음)", () => {
    const f = one("A.tsx", { "A.tsx": `export function A(props: object) { return <div className="flex" {...props} />; }` });
    expect(classState(f.units[0].elements[0].className, "gap-4")).toBe("DYNAMIC");
    expect(classState(f.units[0].elements[0].className, "flex")).toBe("ALWAYS");
  });
  it("조건부 클래스는 정보로 보존된다", () => {
    const f = one("A.tsx", { "A.tsx": `export function A() { return <div className={cn("flex", on && "ring-2", big ? "p-6" : "p-2")} />; }` });
    expect(f.units[0].elements[0].className).toEqual({ always: ["flex"], conditional: ["ring-2", "p-6", "p-2"], dynamic: false });
  });
});

// ── 화면 주소 ───────────────────────────────────────────────────────
describe("화면 주소 정규화", () => {
  it("joinRoute: 부모에 붙이고, 절대 경로는 부모를 버리고, 빈 구간은 부모 그대로", () => {
    expect(joinRoute("/", "products")).toBe("/products");
    expect(joinRoute("/products", ":id")).toBe("/products/:id");
    expect(joinRoute("/products", "/admin")).toBe("/admin");
    expect(joinRoute("/products", "")).toBe("/products");
    expect(joinRoute("/products/", "x/")).toBe("/products/x");
    expect(joinRoute("/", undefined)).toBe("/");
  });

  it("Next.js App Router: (그룹)·@슬롯 제거, [id]·[...slug]·[[...slug]] 변환, _비공개 제외, 가로채기는 읽지 못함", () => {
    const r = (p: string) => nextAppRoute(p);
    expect(r("app/page.tsx")).toEqual({ route: "/" });
    expect(r("app/products/[id]/page.tsx")).toEqual({ route: "/products/:id" });
    expect(r("src/app/(shop)/cart/page.tsx")).toEqual({ route: "/cart" });
    expect(r("my-app/src/app/docs/[...slug]/page.tsx")).toEqual({ route: "/docs/*" });
    expect(r("app/docs/[[...slug]]/page.tsx")).toEqual({ route: "/docs/*?" });
    expect(r("app/@modal/login/page.tsx")).toEqual({ route: "/login" });
    expect(r("app/_components/x/page.tsx")).toEqual({ skip: "private" });
    expect(r("app/(.)photo/[id]/page.tsx")).toEqual({ unreadable: "가로채기 라우트((.)photo)" });
    expect(r("app/products/layout.tsx")).toEqual({ skip: "not-a-page" });
    expect(r("components/products/page.tsx")).toEqual({ skip: "not-a-page" });
  });

  it("Next: 페이지 파일의 라우트 사실에 기본 내보내기 컴포넌트 이름이 들어간다", () => {
    const f = one("app/products/[id]/page.tsx", { "app/products/[id]/page.tsx": "export default function Page() { return <div />; }" });
    expect(f.routes).toEqual([{ router: "next-app", path: "/products/:id", raw: "app/products/[id]/page.tsx", component: "Page", layout: false, line: 1 }]);
    const g = model({ "app/(x)/(.)y/page.tsx": "export default function Y() { return <i />; }" });
    expect(g.files[0].routes).toEqual([]);
    expect(g.files[0].unreadable.map((u) => [u.reason, u.target])).toEqual([["router", "가로채기 라우트((.)y)"]]);
  });

  it("React Router 객체 설정: 부모 경로를 합치고, index·경로 없는 레이아웃은 부모 그대로, 절대 경로는 부모를 버린다", () => {
    const f = one("router.tsx", {
      "router.tsx": `export const r = createBrowserRouter([
        { path: "/", element: <Root />, children: [
          { index: true, element: <Home /> },
          { path: "products", children: [{ path: ":id", element: <Detail /> }, { path: "/admin", element: <Admin /> }] },
          { element: <Pathless />, children: [{ path: "about", Component: About }] },
        ] },
      ]);`,
    });
    expect(f.routes.map((r) => [r.path, r.component, r.layout])).toEqual([
      ["/", "Root", true],
      ["/", "Home", false],
      ["/products/:id", "Detail", false],
      ["/admin", "Admin", false],
      ["/", "Pathless", true],
      ["/about", "About", false],
    ]);
  });

  it("React Router <Route>: 중첩 <Route>도 부모 경로를 합친다", () => {
    const f = one("App.tsx", { "App.tsx": `export function App() { return <Routes><Route path="/shop" element={<Shop />}><Route index element={<List />} /><Route path=":id" element={<Item />} /></Route></Routes>; }` });
    const pages = pageRoutes({ files: [f], failedPaths: [], partialFiles: [], configNotes: [] });
    expect(pages.map((r) => [r.path, r.component])).toEqual([["/shop", "List"], ["/shop/:id", "Item"]]);
    expect(f.routes.find((r) => r.component === "Shop")?.layout).toBe(true);
  });

  it("path를 읽지 못하면 라우트로 세지 않고 읽지 못함으로 기록한다. TanStack Router 등은 읽지 못하는 라우터", () => {
    const f = one("r.tsx", { "r.tsx": `const p = "/x"; export const r = createBrowserRouter([{ path: p, element: <X /> }]);` });
    expect(f.routes).toEqual([]);
    expect(f.unreadable.map((u) => u.reason)).toEqual(["router"]);
    const t = one("t.tsx", { "t.tsx": `import { createRoute } from "@tanstack/react-router"; export const a = 1;` });
    expect(t.unreadable.map((u) => [u.reason, u.target])).toEqual([["router", "@tanstack/react-router"]]);
  });
});

// ── 읽지 못한 코드의 영향 범위 ──────────────────────────────────────
describe("읽지 못한 코드의 영향 범위(unreadableScope)", () => {
  it("lazy와 import()에 경로가 적혀 있으면 그 파일만, import(변수)면 경로를 알 수 없음으로 센다", () => {
    const m = model({
      "src/a/X.tsx": "export function X() { return <i />; }",
      "src/P.tsx": `import { lazy } from "react";
const L = lazy(() => import("./a/X"));
const M = lazy(() => import("./a/Missing"));
export const load = () => import("./a/X");
export const loadVar = (n: string) => import(n);
export function P() { return <L />; }`,
    });
    const f = m.files.find((x) => x.path === "src/P.tsx")!;
    expect(f.unreadable.map((u) => [u.reason, u.target, u.resolved])).toEqual([
      ["lazy", "./a/X", "src/a/X.tsx"],
      ["lazy", "./a/Missing", null],
      ["dynamic-import", "./a/X", "src/a/X.tsx"],
      ["dynamic-import", null, null],
    ]);
    const s = unreadableScope(m);
    expect([...s.files]).toEqual(["src/a/X.tsx"]);
    expect([...s.unresolvedTargets]).toEqual(["./a/Missing"]);
    expect(s.unknownTarget).toBe(true);
  });

  it("영향이 없는 코드에서는 범위가 비어 있다", () => {
    const s = unreadableScope(model({ "A.tsx": "export function A() { return <i />; }" }));
    expect(s).toEqual({ files: new Set(), unresolvedTargets: new Set(), unknownTarget: false, unreadableRouters: [], reexports: new Set() });
  });

  it("다시 내보내기와 읽지 못한 라우터는 각자 범위에만 담긴다", () => {
    const s = unreadableScope(model({ "src/index.ts": 'export { A } from "./A";', "src/A.tsx": "export function A() { return <i />; }", "t.tsx": 'import "wouter"; export const x = 1;' }));
    expect([...s.reexports]).toEqual(["src/A.tsx"]);
    expect(s.unreadableRouters).toEqual(["wouter"]);
    expect(s.unknownTarget).toBe(false);
  });
});

describe("기능별 설정", () => {
  const files = { "tsconfig.json": `{"compilerOptions":{"paths":{"~/*":["./src/*"]}}}`, "src/B.tsx": "export function B() { return <i />; }", "src/A.tsx": 'import { B } from "~/B"; export function A() { return <B />; }' };
  it("기본(구현 검사)은 설정 파일을 읽어 별칭을 풀고, off는 풀지 않으며 설정 메모도 남기지 않는다", () => {
    const a = model(files).files.find((f) => f.path === "src/A.tsx")!;
    expect(a.imports[0]).toMatchObject({ kind: "alias", resolved: "src/B.tsx", resolvedBy: "tsconfig", config: "tsconfig.json" });
    expect(a.units[0].rendered[0].path).toBe("src/B.tsx");
    const off = model(files, CLEANUP_OPTIONS);
    expect(off.files.find((f) => f.path === "src/A.tsx")!.imports[0]).toMatchObject({ kind: "alias", resolved: null, resolvedBy: null });
    expect(off.configNotes).toEqual([]);
  });
  it("설정을 읽지 못하면 configNotes에 남는다", () => {
    expect(model({ "tsconfig.json": "{", "A.tsx": "export function A() { return <i />; }" }).configNotes).toEqual([{ path: "tsconfig.json", reason: "invalid-json" }]);
  });
});
