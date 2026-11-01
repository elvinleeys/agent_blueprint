import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import specFixture from "../../fixtures/wireframes/product-detail/spec.json";
import { buildPreview } from "../preview/preview";
import { blueprint as make } from "../rules/fixture";
import { checkBlueprint } from "../rules/run";
import { BlueprintSchema, type Blueprint } from "../schema/blueprint";
import { normalizeBlueprint } from "../schema/normalize-blueprint";
import { stripOptionalNulls } from "./strict-json-schema";
import { buildExportPrompt, exportFileName, ruleFilePath, type ExportFormat, type ExportSpec } from "./export-prompt";

const spec: ExportSpec = specFixture;

// 입력: 현재 상품 상세 스펙으로 만든 AI 응답 원문(사전 테스트 v2, 2026-10-29). 스펙과 설계도가 같은 화면을 말한다
const raw = stripOptionalNulls(BlueprintSchema, JSON.parse(readFileSync(join(process.cwd(), "tasks/draft-outputs/2026-10-29T09-08-49-165Z/product-detail-text-gpt-6.1-terra-1.json"), "utf8"))) as Record<string, unknown> & { stack: Blueprint["stack"] };
const parse = (input: unknown) => BlueprintSchema.parse(normalizeBlueprint(input).blueprint);
const next = parse(raw); // Next.js + CSS Modules + FSD
const tailwind = parse({ ...raw, stack: { ...raw.stack, styling: "tailwind" } }); // 같은 설계도, 스택만 Tailwind(FSD 유지)
// 같은 설계도를 Next.js + FSD가 아닌 조합으로: React + CSS Modules + 유형 중심(렌더링 방식 없음, 폴더는 종류별)
const react = parse({
  ...raw,
  stack: { framework: "react", styling: "css-modules", architecture: "type-based" },
  // 페이지의 props는 Next.js 전용 params(Promise)를 빼고 없음으로 둔다
  nodes: (raw.nodes as { kind: string }[]).map((n) => ({ ...n, renderMode: null, ...(n.kind === "page" ? { props: [] } : {}), location: { dir: n.kind === "hook" ? "hooks" : n.kind === "page" ? "pages" : "components" } })),
});

const build = (bp: Blueprint, format: ExportFormat, route: string | null = "/products/[id]") =>
  buildExportPrompt({ blueprint: bp, spec, route, violations: checkBlueprint(bp), format });
const rule = (bp: Blueprint, route?: string | null) => build(bp, "claude_md", route);
const task = (bp: Blueprint, route?: string | null) => build(bp, "prompt", route);

/** 기준 파일과 같아야 한다. 파일이 없으면 만들고 실패시킨다(내용을 사람이 검토한 뒤 다시 실행) */
function expectMatchesFixture(name: string, actual: string) {
  const file = join(process.cwd(), "fixtures", "prompts", name);
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, actual, "utf8");
    throw new Error(`기준 파일 ${name}을 새로 만들었습니다. 내용을 검토한 뒤 다시 실행하세요.`);
  }
  expect(actual).toBe(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
}

const run = (bp: Blueprint, format: ExportFormat, o: { spec?: ExportSpec; route?: string | null; violations?: ReturnType<typeof checkBlueprint> } = {}) =>
  buildExportPrompt({ blueprint: bp, spec: o.spec ?? spec, route: o.route === undefined ? "/x" : o.route, violations: o.violations ?? [], format });

describe("기준 파일 비교", () => {
  it("지시서(Next.js·CSS Modules·FSD)", () => expectMatchesFixture("product-detail/prompt.md", task(next)));
  it("화면 규칙 파일(Next.js·CSS Modules·FSD)", () => expectMatchesFixture("product-detail/rule-file.md", rule(next)));
  it("화면 규칙 파일(Next.js·Tailwind·FSD)", () => expectMatchesFixture("product-detail-tailwind/rule-file.md", rule(tailwind)));
  it("화면 규칙 파일(React·CSS Modules·유형 중심)", () => expectMatchesFixture("product-detail-react/rule-file.md", rule(react)));
  it("지시서(React·CSS Modules·유형 중심)", () => expectMatchesFixture("product-detail-react/prompt.md", task(react)));
});

describe("Next.js + FSD가 아닌 조합(React·CSS Modules·유형 중심)", () => {
  const md = rule(react);
  const prompt = task(react);

  it("Next.js·FSD 전용 내용이 없다", () => {
    for (const s of ["Client Component", "use client", "src/", "빈 `pages/`", "라우팅 파일", "FSD", "app/products", "렌더링:"]) {
      expect(md).not.toContain(s);
      expect(prompt).not.toContain(s);
    }
  });

  it("paths는 폴더(**)가 아니라 설계도 노드의 파일 경로를 하나씩 적는다(공용 폴더를 통째로 적지 않는다)", () => {
    const paths = md.split("---\n")[1];
    expect(paths).toBe(
      [
        "paths:",
        ...["components/FulfillmentInfo.tsx", "components/PaymentMethods.tsx", "components/ProductGallery.tsx", "components/ProductHeading.tsx", "components/ProductInfo.tsx", "components/ProductTabs.tsx", "components/PurchaseActions.tsx", "hooks/useCart.ts", "pages/ProductDetailPage.tsx"].map((p) => `  - "${p}"`),
        "",
      ].join("\n"),
    );
    expect(paths).not.toContain("**");
    expect(md).toContain("- ProductHeading: `components/ProductHeading.tsx`");
    expect(md).toContain("- useCart: `hooks/useCart.ts`");
  });

  it("화면 주소를 라우터 형식(/products/:id)으로 적고, 라우팅 규칙에 페이지 이름과 변환한 주소를 넣는다", () => {
    expect(md).toContain("- 화면 주소: /products/:id\n");
    expect(md).toContain("### 라우팅\n기존 프로젝트의 라우팅 라이브러리와 설정 방식을 따른다. `ProductDetailPage`을(를) `/products/:id` 경로에 연결한다. 기존 라우터가 없다면 임의로 라이브러리를 설치하거나 선택하지 않고 보고한다.");
    expect(md).not.toContain("/products/[id]\n");
  });

  it("화면 주소가 비어 있으면 연결할 경로를 정할 수 없다고 적는다", () => {
    const o = run(react, "claude_md", { route: null });
    expect(o).toContain("화면 주소가 비어 있어 연결할 경로를 정할 수 없다. 화면 주소를 정한 뒤 연결한다.");
    expect(o).not.toContain("경로에 연결한다");
  });

  it("데이터 로딩 규칙과 '모든 컴포넌트는 브라우저에서 실행된다'를 넣고 렌더링 방식 표기는 넣지 않는다", () => {
    expect(md).toContain("### 데이터 로딩\n페이지의 데이터 조회는 기존 프로젝트의 데이터 로딩 방식(라우터 loader, 데이터 조회 라이브러리 등)을 따른다. 기존 방식이 없으면 임의로 정하지 않고 보고한다.");
    expect(md).toContain("- 모든 컴포넌트는 브라우저에서 실행된다.");
    expect(md).not.toContain("렌더링:");
    // 서버 통신 노드가 없으면 데이터 로딩 규칙도 없다
    expect(run(make([{ id: "a" }], { framework: "react", styling: "css", architecture: "type-based" }, { dataFetch: false }), "claude_md")).not.toContain("### 데이터 로딩");
  });

  it("Next.js에는 라우팅·데이터 로딩 규칙이 없다(라우팅 파일이 대신한다)", () => {
    for (const s of ["### 라우팅", "### 데이터 로딩", "브라우저에서 실행된다", "/products/:id"]) expect(rule(next)).not.toContain(s);
  });

  it("페이지의 props가 없으면 'props: 없음'이다(Next.js 전용 params를 쓰지 않는다)", () => {
    const page = md.split("- **ProductDetailPage** (페이지)")[1].split("\n  - **")[0];
    expect(page).toContain("  - props: 없음");
    expect(md).not.toContain("params");
    expect(rule(next)).toContain("params: Promise<{ id: string }>"); // Next.js 입력은 그대로
  });

  it("훅 사용 위치에 렌더링 방식이 붙지 않고, 서버 통신 규칙·스타일(모듈)은 스택대로다", () => {
    expect(md).toContain("- 사용 위치: ProductInfo\n");
    expect(md).toContain("### 서버 통신");
    expect(md).toContain("**ProductHeading** (모듈 스타일)");
  });

  it("지시서: React 버전을 확인하고, 구현 순서는 말단부터 부모 순서이며 끝에 '라우터에 페이지 연결'이 있다", () => {
    expect(prompt).toContain("React 버전");
    const lines = prompt.split("## 구현 순서")[1].split("## 구현 원칙")[0].split("\n").filter((l) => /^\d+\. /.test(l));
    expect(lines.slice(0, 9).map((l) => l.split("`")[1])).toEqual(["ProductHeading", "ProductTabs", "ProductGallery", "useCart", "PurchaseActions", "FulfillmentInfo", "PaymentMethods", "ProductInfo", "ProductDetailPage"]);
    expect(lines[8]).toContain("`pages/ProductDetailPage.tsx`");
    expect(lines).toHaveLength(10);
    expect(lines[9]).toBe("10. 라우터에 페이지 연결 — `/products/:id`");
    expect(run(react, "prompt", { route: null }).split("## 구현 순서")[1]).toContain("10. 라우터에 페이지 연결 — 화면 주소가 정해진 뒤 연결한다");
  });

  it("html은 라우터 연결 단계가 없다", () => {
    const bp = make([{ id: "a" }], { framework: "html", styling: "css", architecture: "type-based" });
    expect(run(bp, "prompt").split("## 구현 순서")[1]).not.toContain("라우터에 페이지 연결");
  });
});

describe("같은 입력이면 같은 출력", () => {
  it.each<ExportFormat>(["prompt", "claude_md"])("%s: 두 번 만들어도, 노드 배열 순서를 뒤집어도 같다", (format) => {
    const once = build(next, format);
    expect(build(next, format)).toBe(once);
    expect(build({ ...next, nodes: [...next.nodes].reverse() }, format)).toBe(once);
  });
});

describe("Tailwind 변형 입력", () => {
  it("스택이 Tailwind면 module 범위가 utility로 보정돼 있다(자동 보정)", () => {
    expect(next.nodes.some((n) => n.style?.scope === "module")).toBe(true);
    expect(tailwind.nodes.some((n) => n.style?.scope === "module")).toBe(false);
  });
});

describe("화면 규칙 파일: 무엇을", () => {
  const out = rule(next);

  it("우선순위를 맨 앞(화면 개요보다 앞)에 둔다", () => {
    expect(out.indexOf("## 우선순위")).toBeGreaterThan(0);
    expect(out.indexOf("## 우선순위")).toBeLessThan(out.indexOf("## 화면과 스택"));
    expect(out).toContain("디자인 토큰·디렉토리 구조·코드 작성 방식·공통 컴포넌트는 기존 프로젝트를 따른다");
    expect(out).toContain("정면으로 충돌하면 임의로 고치지 말고 먼저 보고한다");
    expect(out).toContain("컴포넌트 구조와 화면 개요가 어긋나면 컴포넌트 구조가 우선이다");
    expect(out).toContain("컴포넌트 구조에 없는 요구사항은 구현 전에 보고한다");
  });

  it("화면 개요·규칙·금지 사항·상태 소유 요약·구조·파일 위치·배치·스타일을 담고, 스펙 항목을 그대로 옮긴다", () => {
    for (const h of ["## 화면과 스택", "## 규칙", "## 금지 사항", "## 상태 소유 요약", "## 컴포넌트 구조", "## 파일 위치", "## 배치", "## 스타일"]) expect(out).toContain(h);
    for (const s of [spec.overview, spec.tokens, spec.layout, spec.componentRules, spec.stateData, spec.accessibility, spec.constraints]) expect(out).toContain(s);
    expect(out).toContain("Next.js · CSS Modules · FSD");
  });

  it("지시서의 내용(구현 순서·검증·완료 보고)은 들어 있지 않다", () => {
    for (const h of ["## 구현 순서", "## 검증", "## 완료 보고", "## 구현 전 확인", "## 작업 목표"]) expect(out).not.toContain(h);
  });

  it("상태 소유 요약: 상태 필드로 노드 → 상태를 자동으로 만들고, 상태가 없으면 섹션을 생략한다", () => {
    expect(out).toContain("- ProductTabs: selectedTab");
    expect(out).toContain("- ProductInfo: selectedColor, selectedSize, quantity, isWishlisted");
    expect(out).toContain("- useCart: cartCount");
    expect(out.split("## 상태 소유 요약")[1].split("## 컴포넌트 구조")[0]).not.toContain("- ProductHeading:"); // 상태가 없는 노드는 제외
    expect(run(make([{ id: "a" }]), "claude_md")).not.toContain("## 상태 소유 요약");
  });

  it("노드마다 종류·책임·상태·props·이벤트·서버 통신·렌더링 방식을 적는다('데이터 조회' 표기는 쓰지 않는다)", () => {
    const bp = make([{ id: "a", name: "Box", kind: "container", responsibilities: ["표시"], state: [{ name: "open", description: "열림" }], props: [{ name: "title", type: "string" }], events: ["onClose"], renderMode: "client", dataFetch: true }]);
    const o = run(bp, "claude_md");
    for (const s of ["**Box** (컨테이너)", "책임: 표시", "상태: open(열림)", "props: title: string", "이벤트: onClose", "서버 통신(조회·요청): 예", "렌더링: Client Component"]) expect(o).toContain(s);
    expect(o).not.toContain("데이터 조회");
    expect(o).toContain("구체적인 내용은 책임에 적혀 있다");
  });

  it("빈 항목의 섹션은 생략한다", () => {
    const o = run(make([{ id: "a" }]), "claude_md", { spec: { overview: "x" } });
    for (const h of ["## 금지 사항", "## 확인이 필요한 값", "## 상태 소유 요약"]) expect(o).not.toContain(h);
  });

  it("책임이 둘 이상이면 줄을 나눈 목록으로, 하나면 한 줄로 쓴다", () => {
    const bp = make([{ id: "a", name: "Box", responsibilities: ["가격 표시", "할인율 표시"] }, { id: "b", name: "Solo", order: 2, responsibilities: ["하나만"] }]);
    const o = run(bp, "claude_md");
    expect(o).toContain("\n    - 책임:\n      - 가격 표시\n      - 할인율 표시\n");
    expect(o).toContain("\n    - 책임: 하나만\n");
    expect(o).not.toContain("가격 표시; 할인율 표시");
  });

  it("훅을 가진 노드에는 '사용하는 훅', 훅에는 '사용 위치(부모의 렌더링 방식)'를 설계도에서 끌어내 적는다", () => {
    const structure = out.split("## 컴포넌트 구조")[1].split("## 파일 위치")[0];
    expect(structure).toContain("- 사용하는 훅: useCart");
    expect(structure).toContain("- 사용 위치: ProductInfo (Client Component)");
    expect(structure.match(/사용하는 훅/g)).toHaveLength(1);
    expect(structure.match(/사용 위치/g)).toHaveLength(1);
    // Next.js가 아니면 부모의 렌더링 방식 없이 이름만
    const bp = make([{ id: "p", name: "Box" }, { id: "useX", name: "useX", kind: "hook", parentId: "p" }], { framework: "react", styling: "css", architecture: "type-based" });
    expect(run(bp, "claude_md")).toContain("- 사용 위치: Box\n");
  });

  it("서버 통신 노드가 페이지 하나뿐이면 하위 컴포넌트의 중복 조회를 막는 규칙을 넣는다. 설계도의 값은 바꾸지 않는다", () => {
    expect(out).toContain("### 서버 통신\n같은 데이터는 페이지에서 조회한 값을 전달한다. 하위 컴포넌트가 같은 데이터를 다시 조회하지 않는다.");
    const hookFetch = make([{ id: "p", name: "Box", renderMode: "client" }, { id: "useX", name: "useX", kind: "hook", parentId: "p", dataFetch: true }]);
    const o = run(hookFetch, "claude_md");
    expect(o).toContain("- **useX** (훅)"); // 훅의 서버 통신 값을 생성기가 바꾸지 않는다
    expect(o.split("**useX** (훅)")[1].split("\n")[1]).toContain("서버 통신(조회·요청): 예");
    expect(o).not.toContain("### 서버 통신"); // 서버 통신 노드가 페이지와 훅 둘이라 규칙을 넣지 않는다
    expect(run(make([{ id: "a" }], undefined, { dataFetch: false }), "claude_md")).not.toContain("### 서버 통신");
  });

  it("Server·Client 규칙을 구체적으로 적고, 검사 규칙(NX-04)과 모순되지 않게 설계도 해석을 함께 적는다", () => {
    for (const s of [
      "상태·이벤트·브라우저 API·훅을 쓰면 Client Component",
      "Client 파일이 직접 가져오는 컴포넌트는 Client 모듈에 포함된다",
      "Server Component를 Client 파일 안에서 직접 가져오지 않는다",
      "`children` 같은 props로 넘기는 것은 허용한다",
      "서버에서 조회한 데이터는 필요한 Client Component에 props로 전달한다",
      "설계도에서 client 노드 아래 노드는 그 client 파일이 가져오는 컴포넌트다. Server로 유지할 UI는 설계도에서 server 부모 아래 두고, 구현할 때 `children`으로 넘긴다",
    ])
      expect(out).toContain(s);
    expect(run(make([{ id: "a" }], { framework: "react", styling: "css", architecture: "type-based" }), "claude_md")).not.toContain("Client Component");
  });

  it("정의가 필요한 토큰: 설계도에서 쓰였지만 스펙 디자인 토큰에 없는 것만 모은다", () => {
    const bp = make([{ id: "a", style: { scope: "module", ownsOuterSpacing: false, properties: [{ property: "color", value: "color.accent", isToken: true }, { property: "padding", value: "spacing.4", isToken: true }] } }]);
    const o = run(bp, "claude_md", { spec: { tokens: "spacing.4" } });
    expect(o).toContain("### 정의가 필요한 토큰");
    expect(o).toContain("- `color.accent`");
    expect(o).not.toContain("- `spacing.4`");
    expect(out).not.toContain("### 정의가 필요한 토큰"); // 상품 상세는 스펙 토큰으로 모두 설명된다
  });

  it("확인이 필요한 값: 가정한 필드를 화면에 쓰는 한국어 이름으로 적는다", () => {
    const bp = make([{ id: "a", name: "Box", assumed: true, assumedFields: ["layout.gap", "responsibilities[0]", "renderMode", "mystery"] }, { id: "b", name: "Other", order: 2, assumed: true }]);
    const o = run(bp, "claude_md");
    expect(o).toContain("## 확인이 필요한 값");
    expect(o).toContain("- Box: 배치 gap, 책임 1번째, 렌더링 방식, mystery");
    expect(o).toContain("- Other: (필드 지정 없음)");
    expect(o).not.toContain("layout.gap");
  });

  it("미해결 위반은 화면 규칙 파일에 넣지 않는다(지시서가 맡는다)", () => {
    const violations = [{ ruleId: "R-02", severity: "error" as const, nodeIds: ["root"], message: "m" }];
    expect(run(make([{ id: "a" }]), "claude_md", { violations })).not.toContain("R-02");
  });
});

describe("화면 규칙 파일의 paths 머리말", () => {
  const head = (md: string) => md.split("---\n")[1].trim().split("\n").slice(1).map((l) => l.replace(/^ {2}- "(.*)"$/, "$1"));

  it("맨 위가 머리말이다", () => expect(rule(next).startsWith("---\npaths:\n")).toBe(true));

  it("Next.js + FSD: src/ 기준 폴더와 라우팅 파일을 정렬해 한 번씩만 넣는다", () => {
    expect(head(rule(next))).toEqual([
      "app/products/*/page.tsx",
      "src/pages/product-detail/ui/**",
      "src/widgets/product-gallery/ui/**",
      "src/widgets/product-heading/ui/**",
      "src/widgets/product-info/model/**",
      "src/widgets/product-info/ui/**",
      "src/widgets/product-tabs/ui/**",
    ]);
  });

  it("노드 순서를 뒤집어도 같다(같은 폴더의 노드가 여럿이어도 한 번)", () => {
    const paths = head(rule({ ...next, nodes: [...next.nodes].reverse() }));
    expect(paths.filter((p) => p === "src/widgets/product-info/ui/**")).toHaveLength(1);
    expect(paths).toEqual(head(rule(next)));
  });

  it("화면 주소가 없으면 라우팅 파일은 넣지 않고, Next.js가 아니면 src/도 붙이지 않는다", () => {
    expect(head(rule(next, null)).some((p) => p.startsWith("app/"))).toBe(false);
    const bp = make([{ id: "a", location: { dir: "components/box" } }], { framework: "react", styling: "css", architecture: "type-based" });
    expect(head(run(bp, "claude_md"))).toEqual(["components/Root.tsx", "components/box/A.tsx"]);
  });

  it("유형·기능 중심은 폴더가 아니라 노드의 파일 경로를 하나씩 적고, FSD만 슬라이스 폴더 단위다", () => {
    const seeds = [{ id: "a", location: { dir: "components/box" } }, { id: "h", name: "useBox", kind: "hook" as const, parentId: "a", location: { dir: "hooks" } }];
    for (const architecture of ["type-based", "feature-based"] as const) {
      const bp = make(seeds, { framework: "next", styling: "css", architecture });
      const paths = head(run(bp, "claude_md", { route: "/x" }));
      expect(paths).toEqual(["app/x/page.tsx", "components/Root.tsx", "components/box/A.tsx", "hooks/useBox.ts"]);
      expect(paths.some((p) => p.includes("**"))).toBe(false);
    }
    expect(head(rule(next)).filter((p) => p.endsWith("/**")).length).toBe(6); // FSD: 슬라이스 폴더 6개
    expect(head(rule(next)).some((p) => p.endsWith(".tsx") && p.startsWith("src/"))).toBe(false);
  });
});

describe("지시서: 어떻게", () => {
  const out = task(next);

  it("작업 목표·참조할 규칙 파일·구현 전 확인·구현 순서·구현 원칙·검증·완료 보고를 이 순서로 담는다", () => {
    const heads = ["## 작업 목표", "## 참조할 규칙 파일", "## 구현 전 확인", "## 구현 순서", "## 구현 원칙", "## 검증", "## 완료 보고"];
    const at = heads.map((h) => out.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("참조할 규칙 파일의 경로와 내려받기 파일 이름은 같은 이름에서 나온다", () => {
    expect(ruleFilePath(next)).toBe(".claude/rules/product-detail.md");
    expect(out).toContain("`.claude/rules/product-detail.md`");
    expect(exportFileName(next, "claude_md")).toBe("product-detail.md");
    expect(exportFileName(next, "prompt")).toBe("product-detail-prompt.md");
    // 지시서가 가리키는 경로의 파일 이름 = 규칙 파일을 내려받을 때의 파일 이름(어떤 설계도든)
    for (const bp of [next, tailwind, make([{ id: "a" }]), make([{ id: "a" }], undefined, { name: "OrderListPage" }), make([{ id: "a" }], undefined, { name: "Page" })])
      expect(ruleFilePath(bp).split("/").at(-1)).toBe(exportFileName(bp, "claude_md"));
  });

  it("파일 이름은 한국어 화면 이름이 아니라 루트 노드 이름(영문 PascalCase)에서 만들고, 만들 수 없으면 screen이다", () => {
    expect(exportFileName({ ...next, title: "상품 상세" }, "claude_md")).toBe("product-detail.md");
    expect(exportFileName(make([{ id: "a" }], undefined, { name: "OrderListPage" }), "claude_md")).toBe("order-list.md");
    expect(exportFileName(make([{ id: "a" }], undefined, { name: "Page" }), "claude_md")).toBe("screen.md");
    expect(exportFileName(make([{ id: "a" }], undefined, { name: "Home" }), "prompt")).toBe("home-prompt.md");
  });

  it("첫 문장은 조사가 필요 없는 '구현 대상: <화면 이름>'이다", () => {
    expect(out).toContain("## 작업 목표\n\n구현 대상: 상품 상세 화면\n");
  });

  it("화면 규칙 파일과 겹치는 내용은 넣지 않는다", () => {
    for (const s of [spec.overview, spec.tokens, spec.layout, spec.componentRules, spec.stateData, spec.accessibility, spec.constraints]) expect(out).not.toContain(s);
    for (const h of ["## 화면과 스택", "## 규칙", "## 금지 사항", "## 상태 소유 요약", "## 컴포넌트 구조", "## 파일 위치", "## 배치", "## 스타일", "스택 규칙"]) expect(out).not.toContain(h);
    expect(out).not.toContain("paths:");
  });

  it("구현 전 확인: 프레임워크 버전·라우터, 의존성·스크립트, 디렉토리, 공통 컴포넌트·토큰, API·상태 관리, 규칙 파일과의 차이, 충돌 시 보고", () => {
    for (const s of ["Next.js 버전과 라우터 구성(App Router 여부, 기존 `pages/` 폴더)", "의존성과 package.json의 스크립트", "기존 디렉토리 구조", "기존 공통 컴포넌트와 디자인 토큰", "API·타입·상태 관리 방식", "규칙 파일과 실제 프로젝트 구조의 차이", "임의로 고치지 말고, 내용과 영향 범위를 먼저 보고한다"]) expect(out).toContain(s);
    const react = make([{ id: "a" }], { framework: "react", styling: "css", architecture: "type-based" });
    expect(task(react)).toContain("React 버전");
    expect(task(react)).not.toContain("라우터 구성");
  });

  it("구현 순서(FSD): 아래 계층부터 entities → features → widgets → pages → 라우팅 파일, 계층 안에서는 말단부터", () => {
    const fsd = { framework: "next", styling: "tailwind", architecture: "fsd" } as const;
    const bp = make(
      [
        { id: "w", name: "Wid", parentId: "root", location: { dir: "widgets/w/ui" } },
        { id: "e", name: "Ent", parentId: "w", location: { dir: "entities/e/ui" } },
        { id: "f", name: "Feat", parentId: "root", order: 2, location: { dir: "features/f/ui" } },
      ],
      fsd,
      { location: { dir: "pages/home/ui" } },
    );
    const steps = run(bp, "prompt", { route: "/home" }).split("## 구현 순서")[1].split("## 구현 원칙")[0];
    const lines = steps.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(lines).toEqual([
      "1. `Ent` — `src/entities/e/ui/Ent.tsx`",
      "2. `Feat` — `src/features/f/ui/Feat.tsx`",
      "3. `Wid` — `src/widgets/w/ui/Wid.tsx`",
      "4. `Root` — `src/pages/home/ui/Root.tsx`",
      "5. 라우팅 파일 — `app/home/page.tsx`",
    ]);
  });

  it("구현 순서(FSD가 아님): 트리의 말단부터 부모 순서", () => {
    const bp = make([{ id: "a", name: "A" }, { id: "b", name: "B", parentId: "a" }, { id: "c", name: "C", order: 2 }]);
    const steps = run(bp, "prompt", { route: null }).split("## 구현 순서")[1].split("## 구현 원칙")[0];
    const lines = steps.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(lines.slice(0, 4).map((l) => l.split("`")[1])).toEqual(["B", "A", "C", "Root"]);
    expect(steps).toContain("5. 라우팅 파일 — 화면 주소가 정해진 뒤 만든다");
  });

  it("구현 순서(실제 설계도): 위젯이 먼저, 페이지가 나중, 마지막이 라우팅 파일", () => {
    const lines = out.split("## 구현 순서")[1].split("## 구현 원칙")[0].split("\n").filter((l) => /^\d+\. /.test(l));
    expect(lines[0]).toBe("1. `ProductHeading` — `src/widgets/product-heading/ui/ProductHeading.tsx`");
    expect(lines.at(-2)).toBe("9. `ProductDetailPage` — `src/pages/product-detail/ui/ProductDetailPage.tsx`");
    expect(lines.at(-1)).toBe("10. 라우팅 파일 — `app/products/[id]/page.tsx`");
  });

  it("구현 순서 문장: 하위부터 구현하고, 단계마다 타입·import를 확인하며, 끝나면 프로젝트의 타입 검사 스크립트를 실행한다", () => {
    expect(out).toContain("아래 순서에 따라 컴포넌트와 훅을 구현한다. 하위 컴포넌트와 훅을 먼저 구현하고, 이를 사용하는 상위 컴포넌트를 나중에 구현한다.");
    expect(out).toContain("각 단계가 끝나면 구현한 파일의 타입과 import 관계를 확인하고, 전체 구현이 끝나면 프로젝트의 타입 검사 스크립트를 실행한다.");
    expect(out).not.toContain("가져다 쓴다");
  });

  it("구현 원칙: 예외 상태는 기존 공통 처리를 쓰고, 없으면 임의로 정하지 않고 완료 보고에 기록한다", () => {
    expect(out).toContain("설계에 정의되지 않은 컴포넌트·상태·스타일을 임의로 추가하지 않는다.");
    expect(out).toContain("로딩·오류 같은 예외 상태는 기존 프로젝트에 공통 컴포넌트나 처리 방식이 있으면 그것을 사용한다. 기존 방식이 없으면 임의로 UI나 동작을 정하지 않고, 필요한 예외 상태를 완료 보고에 기록한다.");
    expect(out).not.toContain("이 금지의 예외로 허용한다");
  });

  it("검증: 화면 개요 구현, 책임·상태 위치, 반응형, 인터랙션, 접근성, tsc·린트·빌드, 정의된 인터랙션·예외 기준", () => {
    for (const s of ["화면 개요의 모든 요소가 구현됐다", "책임과 상태 위치가 규칙 파일의 컴포넌트 구조·상태 소유 요약과 같다", "반응형", "인터랙션", "접근성", "`tsc`·린트·빌드를 실행해 오류가 없다", "규칙 파일에 인터랙션·예외 기준이 정의돼 있으면 그 기준을 따른다. 정의되지 않은 인터랙션이나 예외 처리는 임의로 구현하지 않고 확인 사항에 기록한다."]) expect(out).toContain(s);
    expect(out).not.toContain("공통 예외 상태를 처리했다");
  });

  it("완료 보고: 만든 파일, 완료 항목, 검증 명령과 결과, 설계와 다르게 한 것과 이유, 확인이 필요한 것", () => {
    const tail = out.split("## 완료 보고")[1];
    for (const s of ["만든 파일", "완료한 항목", "실행한 검증 명령과 결과", "설계와 다르게 한 것과 그 이유", "확인이 필요한 것"]) expect(tail).toContain(s);
  });

  it("미해결 위반은 오류·경고만 규칙 id·노드 이름·메시지로 '구현 전 확인'에 적고 정보는 뺀다. 없으면 섹션이 없다", () => {
    const bp = make([{ id: "a", name: "Box" }]);
    const violations = [
      { ruleId: "R-05", severity: "info" as const, nodeIds: ["a"], message: "정보 메시지" },
      { ruleId: "R-01", severity: "warning" as const, nodeIds: ["a"], message: "경고 메시지" },
      { ruleId: "R-02", severity: "error" as const, nodeIds: ["a", "root"], message: "오류 메시지" },
    ];
    const o = run(bp, "prompt", { violations });
    expect(o).toContain("### 설계에 남은 위반");
    expect(o).toContain("- [오류] R-02 — Box, Root: 오류 메시지");
    expect(o).toContain("- [경고] R-01 — Box: 경고 메시지");
    expect(o).not.toContain("정보 메시지");
    expect(o.indexOf("R-02")).toBeLessThan(o.indexOf("R-01"));
    expect(o.indexOf("### 설계에 남은 위반")).toBeLessThan(o.indexOf("## 구현 순서"));
    expect(run(bp, "prompt")).not.toContain("설계에 남은 위반");
  });
});

describe("Tailwind 스택", () => {
  const out = rule(tailwind);

  it("스타일 규칙: 유틸리티 클래스만, CSS Modules 미사용, 버전 확인, 토큰은 있으면 사용·없으면 보고·확정 시에만 정의(스택에 버전을 두지 않는다)", () => {
    for (const s of [
      "유틸리티 클래스로만 쓴다. CSS Modules(`*.module.css`)와 인라인 스타일은 쓰지 않고",
      "프로젝트의 Tailwind 버전을 확인한다. 4면 CSS의 `@theme`에, 3이면 `tailwind.config`의 `theme.extend`에 디자인 토큰을 정의한다.",
      "디자인 토큰이 기존 테마(또는 CSS 변수)에 있는지 확인하고, 있으면 그대로 사용한다. 없으면 임의의 값을 만들지 않고 확인이 필요한 항목으로 보고한다. 사용자가 값을 확정한 경우에만 정의한다(Tailwind 4는 `@theme`, 3은 `tailwind.config`의 `theme.extend`).",
    ])
      expect(out).toContain(s);
    expect(rule(next)).not.toContain("@theme");
  });

  it("CSS Modules도 같은 토큰 규칙을 따르되 정의 위치는 기존 전역 변수 파일이다", () => {
    expect(rule(next)).toContain("사용자가 값을 확정한 경우에만 정의한다(CSS Modules는 기존 전역 변수 파일).");
    expect(rule(next)).not.toContain("Tailwind 4는");
  });

  it("스타일: 색·모서리 같은 시각 클래스만 노드마다 한 줄로 적고 '모듈 스타일' 표기는 쓰지 않는다", () => {
    const styles = out.split("## 스타일")[1];
    expect(styles).toContain("- **ProductDetailPage**: 대응 클래스 없는 토큰 max-width: layout.maxWidth");
    expect(styles).toContain("- **ProductHeading**: `text-text`");
    expect(styles).toContain("- **ProductGallery**: `rounded-md`");
    expect(styles).toContain("- **ProductInfo**: `text-text`");
    expect(styles).not.toContain("모듈 스타일");
    expect(styles).not.toContain("스타일)");
    expect(rule(next)).toContain("**ProductHeading** (모듈 스타일)");
  });

  it("배치 클래스(grid·flex·간격·정렬·반응형·차지 칸)는 배치 섹션에만 있고 스타일 섹션에 반복되지 않는다", () => {
    const [layout, styles] = [out.split("## 배치")[1].split("## 스타일")[0], out.split("## 스타일")[1]];
    for (const cls of ["grid-cols-", "flex-col", "gap-", "items-", "col-span-", "md:"]) {
      expect(layout).toContain(cls);
      expect(styles).not.toContain(cls);
    }
    for (const cls of ["text-text", "rounded-md"]) {
      expect(styles).toContain(cls);
      expect(layout).not.toContain(cls);
    }
  });

  it("클래스로 바꿀 수 없는 값은 따로 적는다(토큰이 아닌 값, 속성과 짝이 안 맞는 토큰)", () => {
    const bp = make([{ id: "a", name: "Box", style: { scope: "utility", ownsOuterSpacing: true, properties: [{ property: "padding", value: "13px", isToken: false }, { property: "color", value: "spacing.4", isToken: true }, { property: "margin", value: "spacing.2", isToken: true }] } }]);
    expect(run(bp, "claude_md")).toContain("- **Box**: `m-2` / 토큰이 아닌 값 padding: 13px / 대응 클래스 없는 토큰 color: spacing.4 / 바깥 여백을 직접 가짐");
  });

  it("스펙과 설계도의 토큰을 클래스 대응표로 바꾸고, 클래스가 없는 토큰은 문장으로 적는다", () => {
    expect(out).toContain("### 토큰 → Tailwind 클래스");
    expect(out).toContain("| `color.primary` | `bg-primary`·`text-primary`·`border-primary` |");
    expect(out).toContain("| `spacing.4` | `p-4`·`m-4`·`gap-4` |");
    expect(out).toContain("| `radius.md` | `rounded-md` |");
    expect(out).not.toContain("| `layout.maxWidth` |");
    expect(out).toContain("- `layout.maxWidth`은(는) 프로젝트 테마에 정의된 최대 너비 토큰을 사용한다. 해당 토큰이 없으면 임의의 클래스를 만들지 않고 확인이 필요한 항목으로 보고한다.");
    expect(out).toContain("기본 간격 단위(4px)를 가정해");
    expect(out).toContain("프로젝트가 간격을 따로 정의했다면 그 값에 맞춘다");
    expect(rule(next)).not.toContain("| 토큰 |");
  });

  it("기본이 모바일, 큰 화면은 md·lg 접두사다(배치 섹션)", () => {
    expect(out.split("## 배치")[1]).toContain("Tailwind 클래스: `grid grid-cols-1 md:grid-cols-2 gap-6 items-start`");
    const bp = make([{ id: "row", layout: { display: "flex", direction: "row", gap: "spacing.2", responsive: [{ breakpoint: "mobile", direction: "column" }] } }, { id: "c", parentId: "row" }]);
    expect(run(bp, "claude_md")).toContain("`flex flex-col md:flex-row gap-2`");
  });

  it("그리드 자리는 열 수를 넘지 않게 단계별로 계산한다", () => {
    const bp = make(
      [{ id: "a", placement: { span: 2 } }, { id: "b", order: 2, placement: { span: "full" } }],
      undefined,
      { layout: { display: "grid", columns: 3, gap: null, responsive: [{ breakpoint: "tablet", columns: 2 }, { breakpoint: "mobile", columns: 1 }] } },
    );
    const o = run(bp, "claude_md");
    expect(o).toContain("A: 2칸(모바일 1칸) 차지. 클래스: `col-span-1 md:col-span-2`");
    expect(o).toContain("B: 한 줄 전체 차지. 클래스: `col-span-full`");
  });

  it("미리보기의 모바일 열 수와 규칙 파일의 모바일 기본 클래스가 같다", () => {
    expect(out).toContain(`grid-cols-${buildPreview(tailwind.nodes, "mobile")!.root.columns}`);
  });

  it("Tailwind가 아니면 클래스 대신 데스크톱 기준 문장과 괄호 안의 변경값을 쓴다", () => {
    const css = rule(next);
    expect(css).toContain("자식을 grid 2열(모바일 grid 1열) 배치로 놓는다");
    expect(css).not.toContain("Tailwind 클래스");
  });
});

describe("파일 위치", () => {
  const out = rule(next);

  it("Next.js + FSD: app은 루트, FSD 계층은 src 아래, 루트에 빈 pages, 라우팅 파일은 내보내기만, 별칭", () => {
    expect(out).toContain("라우팅용 `app/` 폴더는 프로젝트 루트에 둔다.");
    expect(out).toContain("`src/` 아래에 둔다");
    expect(out).toContain("프로젝트 루트에 빈 `pages/` 폴더를 둔다");
    expect(out).toContain("`app/products/[id]/page.tsx`은 FSD 페이지(`src/pages/product-detail`의 ProductDetailPage)를 가져와 내보내기만 한다");
    expect(out).toContain("`@/*` → `./src/*`");
    expect(out).toContain("- ProductHeading: `src/widgets/product-heading/ui/ProductHeading.tsx`");
    expect(out).toContain("- useCart: `src/widgets/product-info/model/useCart.ts`");
  });

  it("빈 pages 폴더는 기존 프로젝트의 라우터 구성을 먼저 확인하고, 충돌하면 보고하며, views 대안을 적는다", () => {
    expect(out).toContain("기존 프로젝트면 먼저 라우터 구성(App Router 여부, 기존 `pages/` 폴더)을 확인하고, 충돌하면 임의로 고치지 말고 보고한다");
    expect(out).toContain("FSD의 pages 계층 이름을 `views`로 바꾸는 방법이 있다(보고 후 결정한다)");
  });

  it("화면 주소가 '/'면 app/page.tsx다", () => {
    expect(rule(next, "/")).toContain("`app/page.tsx`");
  });

  it.each([null, "", "  "])("화면 주소가 비어 있으면(%j) 페이지 파일 위치를 정할 수 없다고 안내하고 라우팅 파일은 적지 않는다", (route) => {
    const o = rule(next, route);
    expect(o).toContain("화면 주소가 비어 있어 라우팅 파일(`app/…/page.tsx`)의 위치를 정할 수 없다");
    expect(o).not.toContain("가져와 내보내기만 한다");
    expect(o).toContain("화면 주소: 없음");
  });

  it("FSD가 아니면 src·빈 pages 규칙이 없다", () => {
    const bp = make([{ id: "a", name: "Box", location: { dir: "components/box" } }], { framework: "next", styling: "css", architecture: "feature-based" });
    const o = run(bp, "claude_md", { route: "/products" });
    expect(o).not.toContain("빈 `pages/` 폴더");
    expect(o).toContain("`app/products/page.tsx`이 Root을 렌더링한다");
    expect(o).toContain("- Box: `components/box/Box.tsx`");
  });

  it("Next.js가 아니면 화면 주소와 상관없이 라우팅 안내를 넣지 않는다", () => {
    const bp = make([{ id: "a" }], { framework: "react", styling: "css", architecture: "type-based" });
    expect(run(bp, "claude_md", { route: null })).not.toContain("라우팅 파일");
  });
});
