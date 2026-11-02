import { describe, expect, it } from "vitest";
import { COMPARE_CONFIG, compareDesignSystem, type Finding } from "./compare";
import { extractComponents } from "./extract";
import { inferComponents } from "./infer-spec";
import type { AnalyzedComponent, OfficialComponent } from "./types";

const comp = (name: string, o: Partial<AnalyzedComponent> = {}): AnalyzedComponent => ({
  name,
  path: `src/features/${name}.tsx`,
  props: [],
  variants: [],
  inherits: [],
  inheritsComponents: [],
  unresolved: [],
  exported: true,
  ...o,
});
const props = (...names: string[]) => names.map((name) => ({ name, type: "string", required: false }));
const off = (name: string, ...p: string[]): OfficialComponent => ({ name, variants: [], props: props(...p) });
const rules = <R extends Finding["rule"]>(fs: Finding[], rule: R) => fs.filter((f): f is Extract<Finding, { rule: R }> => f.rule === rule);

describe("C-01 공식 목록에 없음(정보)", () => {
  it("공식 이름과 같지 않은 내보낸 컴포넌트만, 정보 심각도로", () => {
    const r = compareDesignSystem({ official: [off("Button")], analyzed: [comp("Button"), comp("CartPage")] });
    expect(rules(r.findings, "C-01")).toEqual([expect.objectContaining({ severity: "info", component: expect.objectContaining({ name: "CartPage" }) })]);
  });

  it("이름은 대소문자까지 정확히 같아야 같은 것", () => {
    const r = compareDesignSystem({ official: [off("Button")], analyzed: [comp("BUTTON")] });
    expect(rules(r.findings, "C-01")).toHaveLength(1);
  });
});

describe("C-03 나누기 후보", () => {
  it("props가 기준을 넘으면 경고, 기준 개수는 아니다(경계)", () => {
    const many = (n: number) => props(...Array.from({ length: n }, (_, i) => `p${i}`));
    const r = compareDesignSystem({ official: [], analyzed: [comp("Eight", { props: many(COMPARE_CONFIG.MAX_PROPS) }), comp("Nine", { props: many(COMPARE_CONFIG.MAX_PROPS + 1) })] });
    const c03 = rules(r.findings, "C-03");
    expect(c03).toHaveLength(1);
    expect(c03[0]).toMatchObject({ severity: "warning", propCount: 9, component: { name: "Nine" } });
  });
});

describe("C-02 합치기 후보", () => {
  it("이름·props가 비슷한 공식이 아닌 쌍: 정보", () => {
    const r = compareDesignSystem({ official: [], analyzed: [comp("ProductCard", { props: props("title", "image", "price") }), comp("ItemCard", { props: props("title", "image", "price") })] });
    // 이름 단어 {product,card} / {item,card} → 1/3 < 0.5
    expect(rules(r.findings, "C-02")).toEqual([]);

    const r2 = compareDesignSystem({ official: [], analyzed: [comp("UserCard", { props: props("name", "image", "email") }), comp("UserCardLarge", { props: props("name", "image", "email", "bio") })] });
    const c02 = rules(r2.findings, "C-02");
    expect(c02).toHaveLength(1);
    expect(c02[0]).toMatchObject({ severity: "info", members: [{ name: "UserCard" }, { name: "UserCardLarge" }] });
  });

  it("경계: 이름 Jaccard 0.5 이상·props Jaccard 0.5 이상일 때만(둘 다 포함)", () => {
    const pair = (aProps: string[], bProps: string[], aName = "Box", bName = "BoxX") =>
      rules(compareDesignSystem({ official: [], analyzed: [comp(aName, { props: props(...aProps) }), comp(bName, { props: props(...bProps) })] }).findings, "C-02").length;
    // 이름: {box} vs {box,x} = 0.5(통과). props: {a,b} vs {a,b,c,d} = 0.5(통과)
    expect(pair(["a", "b"], ["a", "b", "c", "d"])).toBe(1);
    // props {a} vs {a,b,c} = 0.33(미달)
    expect(pair(["a"], ["a", "b", "c"])).toBe(0);
    // 이름 {box} vs {box,xy,z} = 0.33(미달)
    expect(pair(["a", "b"], ["a", "b"], "Box", "BoxXyZ")).toBe(0);
    // 한쪽 props가 없으면 props 조건 미충족
    expect(pair([], ["a"])).toBe(0);
  });

  it("공식 컴포넌트가 들어간 후보는 경고(공식 이름과 같은 컴포넌트 자체는 후보가 아님)", () => {
    const r = compareDesignSystem({
      official: [off("Button", "label", "onClick", "disabled")],
      analyzed: [comp("Button", { props: props("label", "onClick", "disabled") }), comp("ButtonPrimary", { props: props("label", "onClick") })],
    });
    const c02 = rules(r.findings, "C-02");
    expect(c02).toHaveLength(1);
    expect(c02[0]).toMatchObject({ severity: "warning", members: [{ name: "Button", official: true, path: null }, { name: "ButtonPrimary", official: false }] });
    expect(c02[0].message).toContain("공식 컴포넌트(Button)");
  });

  it("공식끼리는 짝짓지 않는다", () => {
    const r = compareDesignSystem({ official: [off("Button", "a", "b"), off("ButtonGroup", "a", "b")], analyzed: [] });
    expect(rules(r.findings, "C-02")).toEqual([]);
  });

  it("같은 라이브러리 컴포넌트를 상속하면 이름 단어가 하나만 겹쳐도 후보", () => {
    const lib = { inheritsComponents: ["DialogPrimitive.Root"] };
    const r = compareDesignSystem({ official: [], analyzed: [comp("ConfirmDialog", lib), comp("DialogBox", lib), comp("Unrelated", lib)] });
    const c02 = rules(r.findings, "C-02");
    expect(c02).toHaveLength(1);
    expect(c02[0].members.map((m) => m.name)).toEqual(["ConfirmDialog", "DialogBox"]);
    expect(c02[0].evidence.join()).toContain("같은 라이브러리 컴포넌트를 상속: DialogPrimitive.Root");
  });

  it("다른 라이브러리 컴포넌트를 상속하면 이름이 겹쳐도 후보가 아니다", () => {
    const r = compareDesignSystem({ official: [], analyzed: [comp("DialogTitle", { inheritsComponents: ["A.Title"] }), comp("DropdownTitle", { inheritsComponents: ["B.Title"] })] });
    expect(rules(r.findings, "C-02")).toEqual([]);
  });

  it("같은 HTML 요소 상속은 후보 조건이 아니다: 이름만 같은 요소를 감싸면 후보 아님, 이름·props 후보에는 근거로 표시", () => {
    const div = { inherits: ["div"] };
    const none = compareDesignSystem({ official: [], analyzed: [comp("Alpha", div), comp("Beta", div), comp("Gamma", div)] });
    expect(rules(none.findings, "C-02")).toEqual([]);

    const r = compareDesignSystem({ official: [], analyzed: [comp("InfoBox", { ...div, props: props("a") }), comp("InfoBoxWide", { ...div, props: props("a") })] });
    const c02 = rules(r.findings, "C-02");
    expect(c02).toHaveLength(1);
    expect(c02[0].evidence.join()).toContain("같은 HTML 요소를 감쌈: div");

    // 이름 조건 미달이면 HTML 요소가 같아도 근거를 붙이지 않는다(라이브러리 상속으로만 후보가 된 경우)
    const lib = { inheritsComponents: ["P.Root"], inherits: ["div"] };
    const r2 = compareDesignSystem({ official: [], analyzed: [comp("FooPanelBar", lib), comp("PanelQuxZed", lib)] });
    expect(rules(r2.findings, "C-02")[0].evidence.join()).not.toContain("HTML 요소");
  });

  it("이어진 후보는 한 묶음으로 보고한다", () => {
    const p = props("a", "b");
    const r = compareDesignSystem({ official: [], analyzed: [comp("Row", { props: p }), comp("RowX", { props: p }), comp("Row", { props: p, path: "src/other/Row.tsx" })] });
    const c02 = rules(r.findings, "C-02");
    expect(c02).toHaveLength(1);
    expect(c02[0].members).toHaveLength(3);
  });
});

describe("C-05 공식과 같은 이름의 별도 구현(경고)", () => {
  // 공식은 디자인 시스템으로 올린 파일에서 만들었고(path 있음), 코드에는 디자인 시스템 파일이 들어 있지 않다
  const official = [{ ...off("Button", "label"), path: "design-system/Button.tsx" }];
  const code = [comp("Button", { path: "app/Button.tsx" }), comp("Page", { path: "app/Page.tsx" })];

  it("디자인 시스템 파일로 만든 공식 목록: 코드의 같은 이름은 경고", () => {
    const r = compareDesignSystem({ official, analyzed: code, officialFromFiles: true });
    const c05 = rules(r.findings, "C-05");
    expect(c05).toHaveLength(1);
    expect(c05[0]).toMatchObject({ severity: "warning", officialPath: "design-system/Button.tsx", component: { name: "Button", path: "app/Button.tsx" } });
    expect(c05[0].message).toContain("같은 이름의 별도 구현입니다(공식: design-system/Button.tsx)");
    // 공식 이름이라 C-01(공식 목록에 없음)에는 오르지 않는다
    expect(rules(r.findings, "C-01").map((f) => f.component.name)).toEqual(["Page"]);
  });

  it("JSON 스펙(파일 없음): 같은 이름은 공식 구현으로 보고 경고하지 않는다", () => {
    const r = compareDesignSystem({ official: [off("Button", "label")], analyzed: code });
    expect(rules(r.findings, "C-05")).toEqual([]);
    expect(rules(r.findings, "C-01").map((f) => f.component.name)).toEqual(["Page"]);
  });

  it("내부용(내보내지 않음)인 같은 이름은 경고하지 않고, 경고는 정보보다 앞에 놓인다", () => {
    const r = compareDesignSystem({ official, analyzed: [comp("Button", { path: "app/B.tsx", exported: false }), ...code], officialFromFiles: true });
    expect(rules(r.findings, "C-05")).toHaveLength(1);
    expect(r.findings.map((f) => f.rule)).toEqual(["C-05", "C-01"]);
  });
});

describe("비교 대상 정하기와 요약", () => {
  it("내부용은 비교하지 않고 개수만 센다", () => {
    const r = compareDesignSystem({ official: [], analyzed: [comp("Used"), comp("Hidden", { exported: false })] });
    expect(r.findings.map((f) => ("component" in f ? f.component.name : ""))).toEqual(["Used"]);
    expect(r.summary).toMatchObject({ comparedCount: 1, internalCount: 1 });
  });

  it("못 읽은 것은 요약 개수로만 알린다(결과 목록에 올리지 않음)", () => {
    const r = compareDesignSystem({ official: [off("A"), off("B"), off("C")], analyzed: [comp("A", { unresolved: ["X"] }), comp("B"), comp("C", { unresolved: ["Y"] })] });
    expect(r.summary.unresolvedCount).toBe(2);
    expect(r.findings).toEqual([]);
  });

  it("정렬: 경고가 정보보다 앞, 같은 심각도 안에서는 규칙 id와 이름 순. 같은 입력이면 같은 결과", () => {
    const input = {
      official: [off("Button", "a", "b")],
      analyzed: [comp("Zeta"), comp("ButtonX", { props: props("a", "b") }), comp("Alpha")],
    };
    const r = compareDesignSystem(input);
    expect(r.findings.map((f) => `${f.severity}:${f.rule}`)).toEqual(["warning:C-02", "info:C-01", "info:C-01", "info:C-01"]);
    expect(compareDesignSystem(input)).toEqual(r);
  });
});

describe("파이프라인: 코드 → 분석 → 스펙 생성 → 비교", () => {
  it("디자인 시스템 파일로 만든 공식 목록과 코드를 비교한다(상속 정보가 합치기 판단에 쓰임)", () => {
    const toFiles = (files: Record<string, string>) => Object.entries(files).map(([path, content]) => ({ path, content }));
    const designSystem = extractComponents(
      toFiles({
        "ds/Dialog.tsx": `import * as P from "@x/dialog";
          export function Dialog(p: React.ComponentProps<typeof P.Root>) { return <div/>; }`,
      }),
    ).components;
    const analyzed = extractComponents(
      toFiles({
        "app/ConfirmDialog.tsx": `import * as P from "@x/dialog";
          export const ConfirmDialog = (p: React.ComponentProps<typeof P.Root> & { message: string }) => <div/>;`,
        "app/Cart.tsx": `export const Cart = () => <div/>;`,
      }),
    ).components;
    const inferred = inferComponents(designSystem);
    const r = compareDesignSystem({ official: inferred.official, analyzed, officialFromFiles: true });
    const c02 = rules(r.findings, "C-02");
    expect(c02).toHaveLength(1);
    expect(c02[0]).toMatchObject({ severity: "warning", members: [{ name: "Dialog", official: true }, { name: "ConfirmDialog" }] });
    expect(rules(r.findings, "C-01").map((f) => f.component.name)).toEqual(["Cart", "ConfirmDialog"]);
  });
});
