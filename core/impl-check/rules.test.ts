import { describe, expect, it } from "vitest";
import { readCodeModel } from "../code-model/facts";
import { blueprint, type NodeSeed } from "../rules/fixture";
import type { Blueprint } from "../schema/blueprint";
import { checkImplementation } from "./run";

// 규칙별 단위 시험(손으로 만든 코드): 훅 안의 상태 조건, 후보 짝 노드의 연쇄 판정 범위, FSD 계층 방향(shared 포함).

const REACT = { framework: "react", styling: "tailwind", architecture: "type-based" } as const;
const FSD = { framework: "react", styling: "tailwind", architecture: "fsd" } as const;
const code = (files: Record<string, string>) => readCodeModel(Object.entries(files).map(([path, content]) => ({ path, content })));
const check = (bp: Blueprint, files: Record<string, string>) => checkImplementation(bp, code(files));
const comp = (name: string, body = "", imports = "") => `${imports}\nexport function ${name}() { ${body} return <i />; }`;
const open = { state: [{ name: "open", description: "열림" }] };
const item = (r: ReturnType<typeof check>, nodeId: string, key: string) => r.items.find((i) => i.nodeId === nodeId && i.key === key)!;

describe("훅 안의 상태: 세 조건을 모두 지킬 때만 '상태가 있다'", () => {
  const panel = (extra: NodeSeed[] = []) => blueprint([{ id: "panel", name: "Panel", location: { dir: "components" }, ...open }, ...extra], REACT);
  const panelFile = `import { usePanel } from "../hooks/usePanel";\nexport function Panel() { usePanel(); return <i />; }`;

  it("조건 충족(설계에 없는 훅 + 직접 호출 + useState): 일치이고 근거에 훅과 컴포넌트가 적힌다", () => {
    const r = check(panel(), { "src/components/Panel.tsx": panelFile, "src/hooks/usePanel.ts": `export function usePanel() { const [open, setOpen] = useState(false); return open; }` });
    const it1 = item(r, "panel", "state:open");
    expect(it1.status).toBe("match");
    expect(it1.evidence.join(" ")).toMatch(/훅 usePanel 안에서 useState·useReducer로 선언됨/);
    expect(it1.evidence.join(" ")).toMatch(/Panel가 직접 호출함/);
    expect(r.findings.some((f) => f.rule === "IC-05")).toBe(false);
  });

  it("useReducer로 선언한 상태도 같다", () => {
    const r = check(panel(), { "src/components/Panel.tsx": panelFile, "src/hooks/usePanel.ts": `export function usePanel() { const [open, dispatch] = useReducer(reduce, false); return [open, dispatch]; }` });
    expect(item(r, "panel", "state:open").status).toBe("match");
  });

  it("그 훅이 설계 노드이면 '상태가 있다'로 보지 않고 위치 다름 경고", () => {
    const bp = blueprint([{ id: "panel", name: "Panel", location: { dir: "components" }, ...open }, { id: "usepanel", name: "usePanel", kind: "hook", parentId: "panel", location: { dir: "hooks" } }], REACT);
    const r = check(bp, { "src/components/Panel.tsx": panelFile, "src/hooks/usePanel.ts": `export function usePanel() { const [open, setOpen] = useState(false); return open; }` });
    expect(item(r, "panel", "state:open").status).toBe("mismatch");
    expect(r.findings.find((f) => f.rule === "IC-05")).toMatchObject({ certainty: "certain", severity: "warning", node: "Panel" });
  });

  it("컴포넌트가 부르지 않는 다른 코드에 상태가 있으면 위치 다름 경고", () => {
    const r = check(panel(), { "src/components/Panel.tsx": comp("Panel"), "src/components/Other.tsx": comp("Other", "const [open, setOpen] = useState(false);") });
    expect(item(r, "panel", "state:open").status).toBe("mismatch");
    expect(r.findings.find((f) => f.rule === "IC-05")).toMatchObject({ certainty: "certain", node: "Panel" });
  });

  it("훅이 다시 다른 훅을 불러 그 안에 상태가 있으면 확인 필요(두 단계)", () => {
    const r = check(panel(), {
      "src/components/Panel.tsx": `import { useOuter } from "../hooks/useOuter";\nexport function Panel() { useOuter(); return <i />; }`,
      "src/hooks/useOuter.ts": `import { useInner } from "./useInner";\nexport function useOuter() { return useInner(); }`,
      "src/hooks/useInner.ts": `export function useInner() { const [open, setOpen] = useState(false); return open; }`,
    });
    expect(item(r, "panel", "state:open").status).toBe("review");
    const f = r.findings.find((x) => x.rule === "IC-05")!;
    expect(f).toMatchObject({ certainty: "review", kind: "state", design: "open" });
    expect(f.evidence.join(" ")).toMatch(/useInner 안에 있음/);
    expect(f.evidence.join(" ")).toMatch(/두 단계/);
  });

  it.each(["useContext", "useStore", "useSelector", "useAtom", "useRecoilState"])("컴포넌트가 %s를 쓰면 상태가 없다고 확정하지 않고 확인 필요", (hook) => {
    const r = check(panel(), { "src/components/Panel.tsx": comp("Panel", `const v = ${hook}(thing);`) });
    expect(item(r, "panel", "state:open").status).toBe("review");
    expect(r.findings.find((f) => f.rule === "IC-05")).toMatchObject({ certainty: "review", kind: "state", design: "open" });
  });

  it("직접 부르는 훅 안에서 상태 관리 라이브러리 훅을 써도 확인 필요", () => {
    const r = check(panel(), { "src/components/Panel.tsx": panelFile, "src/hooks/usePanel.ts": `export function usePanel() { return useStore((s) => s.open); }` });
    expect(item(r, "panel", "state:open").status).toBe("review");
  });

  it("어디에도 상태가 없고 외부 상태 훅도 쓰지 않으면 누락(확실)", () => {
    const r = check(panel(), { "src/components/Panel.tsx": panelFile, "src/hooks/usePanel.ts": `export function usePanel() { return true; }` });
    expect(item(r, "panel", "state:open").status).toBe("mismatch");
    expect(r.findings.find((f) => f.rule === "IC-05")).toMatchObject({ certainty: "certain", severity: "warning" });
  });
});

describe("후보 짝 노드의 연쇄: 직계 자식의 부모-자식 항목만 확인 필요", () => {
  // Root → Panel(후보 짝: PanelList) → Leaf → Leaf2
  const bp = blueprint(
    [
      { id: "panel", name: "Panel", location: { dir: "components" } },
      { id: "leaf", name: "Leaf", parentId: "panel", location: { dir: "components" } },
      { id: "leaf2", name: "Leaf2", parentId: "leaf", location: { dir: "components" } },
    ],
    REACT,
    { name: "Root", location: { dir: "pages" } },
  );
  const files = {
    "src/pages/Root.tsx": `import { PanelList } from "../components/PanelList";\nexport function Root() { return <PanelList />; }`,
    "src/components/PanelList.tsx": `import { Leaf } from "./Leaf";\nexport function PanelList() { return <Leaf />; }`,
    "src/components/Leaf.tsx": `import { Leaf2 } from "./Leaf2";\nexport function Leaf() { return <Leaf2 />; }`,
    "src/components/Leaf2.tsx": comp("Leaf2"),
  };
  const r = check(bp, files);

  it("자식이 있는 노드가 후보 짝이면 그 노드의 항목은 전부 확인 필요이고 결과 카드는 한 장", () => {
    expect(r.pairing.reviews.map((x) => x.nodeName)).toEqual(["Panel"]);
    expect(r.items.filter((i) => i.nodeId === "panel").every((i) => i.status === "review")).toBe(true);
    expect(r.findings.filter((f) => f.certainty === "review").map((f) => `${f.rule}:${f.node}`)).toEqual(["IC-01:Panel"]);
  });

  it("직계 자식(Leaf)은 부모-자식 항목만 확인 필요이고, 부모 카드에 묶인다", () => {
    const parent = item(r, "leaf", "parent");
    expect(parent.status).toBe("review");
    expect(parent.findingIds).toEqual(["IC-01|panel|pair"]);
  });

  it("직계 자식의 다른 항목(존재·위치·서버 통신 등)은 영향받지 않는다", () => {
    for (const key of ["exists", "location", "fetch"]) expect(item(r, "leaf", key).status, key).toBe("match");
  });

  it("손자 노드(Leaf2)는 영향받지 않는다: 부모 Leaf가 확실한 짝이라 부모-자식도 일치", () => {
    expect(r.items.filter((i) => i.nodeId === "leaf2").every((i) => i.status === "match")).toBe(true);
  });

  it("후보의 부모인 노드(Root)와 그 밖의 항목도 영향받지 않는다", () => {
    expect(r.items.filter((i) => i.nodeId === "root").every((i) => i.status === "match" || i.status === "mismatch" || i.status === "review")).toBe(true);
    expect(item(r, "root", "exists").status).toBe("match");
  });
});

describe("FSD 계층 방향: shared도 위 계층을 가져오면 위반(슬라이스 검사에서만 빠진다)", () => {
  const node = (name: string, dir: string, parentId = "root"): NodeSeed => ({ id: name.toLowerCase(), name, parentId, location: { dir } });
  const fsd = (seeds: NodeSeed[]) => blueprint(seeds, FSD, { name: "Home", location: { dir: "pages/home/ui" } });
  const violations = (r: ReturnType<typeof check>) => r.findings.filter((f) => f.rule === "ICF-01").map((f) => `${f.node}: ${f.message}`);

  it("shared가 위 계층(entities)을 가져오면 위반", () => {
    const r = check(fsd([node("Button", "shared/ui"), node("ProductCard", "entities/product/ui")]), {
      "src/shared/ui/Button.tsx": `import { ProductCard } from "@/entities/product/ui/ProductCard";\nexport function Button() { return <ProductCard />; }`,
      "src/entities/product/ui/ProductCard.tsx": comp("ProductCard"),
    });
    expect(violations(r)).toEqual(["Button: Button가 위 계층(entities)을 가져옵니다."]);
    expect(r.findings.find((f) => f.rule === "ICF-01")).toMatchObject({ certainty: "certain", severity: "error" });
  });

  it("shared가 shared 안의 다른 폴더를 가져오는 것, 아래 계층이 shared를 가져오는 것은 위반이 아니다", () => {
    const r = check(fsd([node("Button", "shared/ui"), node("Icon", "shared/lib"), node("ProductCard", "entities/product/ui")]), {
      "src/shared/ui/Button.tsx": `import { Icon } from "@/shared/lib/Icon";\nexport function Button() { return <Icon />; }`,
      "src/shared/lib/Icon.tsx": comp("Icon"),
      "src/entities/product/ui/ProductCard.tsx": `import { Button } from "@/shared/ui/Button";\nexport function ProductCard() { return <Button />; }`,
    });
    expect(violations(r)).toEqual([]);
  });

  it("같은 계층의 다른 슬라이스는 위반(entities끼리), 같은 슬라이스 안은 아님", () => {
    const r = check(fsd([node("ProductCard", "entities/product/ui"), node("ReviewStars", "entities/review/ui"), node("ProductPrice", "entities/product/model")]), {
      "src/entities/product/ui/ProductCard.tsx": `import { ReviewStars } from "@/entities/review/ui/ReviewStars";\nimport { ProductPrice } from "@/entities/product/model/ProductPrice";\nexport function ProductCard() { return <ReviewStars />; }`,
      "src/entities/review/ui/ReviewStars.tsx": comp("ReviewStars"),
      "src/entities/product/model/ProductPrice.tsx": comp("ProductPrice"),
    });
    expect(violations(r)).toEqual(["ProductCard: ProductCard가 같은 계층(entities)의 다른 슬라이스(review)를 가져옵니다."]);
  });

  it("타입만 가져오는 import는 위반이 아니다", () => {
    const r = check(fsd([node("Button", "shared/ui"), node("ProductCard", "entities/product/ui")]), {
      "src/shared/ui/Button.tsx": `import type { Props } from "@/entities/product/ui/ProductCard";\nexport function Button(_: Props) { return <i />; }`,
      "src/entities/product/ui/ProductCard.tsx": `export type Props = { a: number };\n${comp("ProductCard")}`,
    });
    expect(violations(r)).toEqual([]);
  });
});
