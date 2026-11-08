import { describe, expect, it } from "vitest";
import { readCodeModel } from "../code-model/facts";
import { blueprint } from "../rules/fixture";
import { listCaseDirs, loadBlueprint, loadCode } from "./load-fixture";
import { validateConfirmed } from "./confirmed";
import { checkImplementation } from "./run";

// 사용자가 확정한 짝(confirmed): 반영해서 다시 판정, 없을 때와 완전히 같은 결과, 입력 검증.
// 시험 데이터(fixtures/implementation-check/next)의 노드 id: n-gallery(ProductGallery), n-info(ProductInfo), n-use-cart(useCart) 등.

const GALLERY = { nodeId: "n-gallery", path: "src/entities/product/ui/ItemImages.tsx", name: "ItemImages" };
const model = (name: string) => readCodeModel(loadCode("next", name));
const bpOf = (name: string) => loadBlueprint("next", name);
const show = (r: ReturnType<typeof checkImplementation>) => JSON.stringify({ items: r.items, bans: r.bans, findings: r.findings, summary: r.summary, pairing: { pairs: r.pairing.pairs, reviews: r.pairing.reviews, missing: r.pairing.missing, extraUnits: r.pairing.extraUnits } });

describe("confirmed가 없으면 3b와 완전히 같은 결과", () => {
  it.each(["next", "react"])("%s 묶음의 모든 사례: confirmed를 생략한 것과 빈 목록이 같다", (bundle) => {
    for (const name of ["correct", ...listCaseDirs(bundle)]) {
      const m = readCodeModel(loadCode(bundle, name));
      const bp = loadBlueprint(bundle, name);
      expect(show(checkImplementation(bp, m, [])), name).toBe(show(checkImplementation(bp, m)));
    }
  });
});

describe("확정한 짝을 반영해 다시 판정", () => {
  const m = model("renamed");
  const bp = bpOf("renamed");
  const before = checkImplementation(bp, m);
  const after = checkImplementation(bp, m, [GALLERY]);

  it("확정 전에는 짝 확인 필요(후보 ItemImages) 한 건", () => {
    expect(before.findings.find((f) => f.rule === "IC-01" && f.node === "ProductGallery")).toMatchObject({ certainty: "review", kind: "pair", candidate: "ItemImages" });
    expect(before.pairing.pairOf("n-gallery")).toBeUndefined();
  });

  it("확정 뒤에는 그 노드가 확실한 짝이 되고 근거에 사용자 확정이 적힌다", () => {
    const pair = after.pairing.pairOf("n-gallery")!;
    expect(pair.unit).toMatchObject({ name: "ItemImages", path: GALLERY.path });
    expect(pair.evidence[0].kind).toBe("user-confirmed");
    expect(after.findings.some((f) => f.rule === "IC-01" && f.node === "ProductGallery")).toBe(false);
    expect(after.items.find((i) => i.id === "n-gallery|exists")?.status).toBe("match");
  });

  it("확정한 노드의 세부 항목(위치·props 등)을 이제 판정하고, 확인 필요 개수가 줄어든다", () => {
    const mine = (r: typeof before) => r.items.filter((i) => i.nodeId === "n-gallery");
    expect(mine(before).every((i) => i.status === "review")).toBe(true);
    expect(mine(after).some((i) => i.status !== "review")).toBe(true);
    expect(after.summary.design.review).toBeLessThan(before.summary.design.review);
    expect(after.summary.design.total).toBe(before.summary.design.total);
  });

  it("다른 노드의 판정은 그대로다(useCart·PriceTag의 확인 필요 카드가 남는다)", () => {
    const rest = (r: typeof before) => r.findings.filter((f) => f.node !== "ProductGallery").map((f) => f.id);
    expect(rest(after)).toEqual(rest(before));
  });

  it("같은 이름이 여러 곳이라 특정하지 못한 노드도 확정하면 확실한 짝이 된다", () => {
    const m2 = model("dup-name-ambiguous");
    const bp2 = bpOf("dup-name-ambiguous");
    const r = checkImplementation(bp2, m2, [{ nodeId: "n-gallery", path: "src/shared/ui/ProductGallery.tsx", name: "ProductGallery" }]);
    expect(r.pairing.pairOf("n-gallery")?.unit.path).toBe("src/shared/ui/ProductGallery.tsx");
    expect(r.findings.some((f) => f.rule === "IC-01")).toBe(false);
  });
});

describe("진 노드는 후보를 지우는 것만으로 '코드에 없음'이 되지 않는다", () => {
  // Gallery(ProductGallery)는 View(ProductGalleryView)가 1순위, List(ProductGalleryList)는 ProductListBox가 1순위이고 View는 그다음 후보
  const bp = blueprint([
    { id: "a", name: "ProductGallery", location: { dir: "components" } },
    { id: "b", name: "ProductGalleryList", location: { dir: "components" } },
  ]);
  const files = {
    "src/components/ProductGalleryView.tsx": `export function ProductGalleryView() { return <i />; }`,
    "src/components/ProductListBox.tsx": `export function ProductListBox() { return <i />; }`,
  };
  const m = readCodeModel(Object.entries(files).map(([path, content]) => ({ path, content })));

  it("확정 전: 두 노드 모두 짝 확인 필요이고 View는 두 노드가 다툰다", () => {
    const r = checkImplementation(bp, m);
    expect(r.pairing.reviews.map((x) => `${x.nodeName}:${x.candidates.map((c) => c.unit.name).join(",")}`).sort()).toEqual(["ProductGallery:ProductGalleryView", "ProductGalleryList:ProductListBox,ProductGalleryView"]);
    expect(r.pairing.missing.map((x) => x.nodeName)).toEqual(["Root"]); // Root는 코드 파일이 없는 시험용 노드
  });

  it("이긴 쪽(ProductGallery ↔ View)을 확정하면 진 노드는 남은 근거(ProductListBox)로 다시 분류된다", () => {
    const r = checkImplementation(bp, m, [{ nodeId: "a", path: "src/components/ProductGalleryView.tsx", name: "ProductGalleryView" }]);
    expect(r.pairing.pairOf("a")?.unit.name).toBe("ProductGalleryView");
    expect(r.pairing.reviews.map((x) => `${x.nodeName}:${x.reason}:${x.candidates.map((c) => c.unit.name).join(",")}`)).toEqual(["ProductGalleryList:candidate:ProductListBox"]);
    expect(r.pairing.missing.map((x) => x.nodeName)).toEqual(["Root"]); // Root는 코드 파일이 없는 시험용 노드
  });

  it("남은 근거가 전혀 없으면 그때는 코드에 없음으로 분류된다(근거가 있어야만 후보)", () => {
    const only = readCodeModel([{ path: "src/components/ProductGalleryView.tsx", content: files["src/components/ProductGalleryView.tsx"] }]);
    const r = checkImplementation(bp, only, [{ nodeId: "a", path: "src/components/ProductGalleryView.tsx", name: "ProductGalleryView" }]);
    expect(r.pairing.missing.map((x) => x.nodeName)).toEqual(["ProductGalleryList", "Root"]);
  });
});

describe("읽지 못한 경로가 있어도 사용자가 확정한 짝은 낮추지 않는다", () => {
  const bp = blueprint([{ id: "a", name: "Gallery", location: { dir: "components" } }]);
  const m = readCodeModel([
    { path: "src/components/Page.tsx", content: `import { lazy } from "react";\nconst Gallery = lazy(() => import("./Gallery"));\nexport function Page() { return <Gallery />; }` },
    { path: "src/components/GalleryView.tsx", content: `export function GalleryView() { return <i />; }` },
  ]);

  it("확정하지 않으면 경로에 Gallery가 보이는 읽지 못한 파일 때문에 짝 확인 필요", () => {
    const r = checkImplementation(bp, m);
    expect(r.pairing.reviews.find((x) => x.nodeId === "a")?.reason).toBe("unreadable-named-path");
  });

  it("확정하면 그 짝이 그대로 확실한 짝이다", () => {
    const r = checkImplementation(bp, m, [{ nodeId: "a", path: "src/components/GalleryView.tsx", name: "GalleryView" }]);
    expect(r.pairing.pairOf("a")?.unit.name).toBe("GalleryView");
    expect(r.pairing.reviews.some((x) => x.nodeId === "a")).toBe(false);
  });
});

describe("확정한 짝 검증(validateConfirmed)", () => {
  const m = model("renamed");
  const bp = bpOf("renamed");
  const reasons = (c: Parameters<typeof validateConfirmed>[2]) => validateConfirmed(bp, m, c).map((p) => `${p.index}:${p.reason}`);

  it("올바른 확정은 문제가 없다(빈 목록도 같다)", () => {
    expect(reasons([])).toEqual([]);
    expect(reasons([GALLERY])).toEqual([]);
  });

  it("nodeId가 기준 설계도에 없으면 unknown-node", () => {
    expect(reasons([{ ...GALLERY, nodeId: "nope" }])).toEqual(["0:unknown-node"]);
  });

  it("path·name이 올린 코드에 없으면 unknown-code", () => {
    expect(reasons([{ ...GALLERY, name: "Nope" }])).toEqual(["0:unknown-code"]);
    expect(reasons([{ ...GALLERY, path: "src/nope.tsx" }])).toEqual(["0:unknown-code"]);
  });

  it("훅 노드는 컴포넌트 코드로, 컴포넌트 노드는 훅 코드로 확정할 수 없다(kind-mismatch)", () => {
    expect(reasons([{ nodeId: "n-use-cart", path: GALLERY.path, name: GALLERY.name }])).toEqual(["0:kind-mismatch"]);
    expect(reasons([{ nodeId: "n-gallery", path: "src/features/add-to-cart/model/useCart.ts", name: "useCart" }])).toEqual(["0:kind-mismatch"]);
  });

  it("같은 노드를 두 번 확정하면 duplicate-node", () => {
    expect(reasons([GALLERY, GALLERY])).toEqual(["1:duplicate-node"]);
  });

  it("같은 코드를 여러 노드에 확정하면 duplicate-code", () => {
    expect(reasons([GALLERY, { ...GALLERY, nodeId: "n-review" }])).toContain("1:duplicate-code");
  });

  it("이미 확실한 짝이 있는 노드를 다른 코드로 확정하면 already-certain-node, 같은 코드로 확정하는 것은 허용", () => {
    expect(reasons([{ nodeId: "n-info", path: GALLERY.path, name: GALLERY.name }])).toEqual(["0:already-certain-node"]);
    expect(reasons([{ nodeId: "n-info", path: "src/widgets/product-info/ui/ProductInfo.tsx", name: "ProductInfo" }])).toEqual([]);
  });

  it("다른 노드의 확실한 짝인 코드를 확정하면 code-taken", () => {
    expect(reasons([{ nodeId: "n-gallery", path: "src/widgets/product-info/ui/ProductInfo.tsx", name: "ProductInfo" }])).toEqual(["0:code-taken"]);
  });

  it("문제가 있으면 문제 목록에 코드 내용 없이 index·nodeId·이유만 담긴다", () => {
    expect(validateConfirmed(bp, m, [{ ...GALLERY, nodeId: "nope" }])).toEqual([{ index: 0, nodeId: "nope", reason: "unknown-node" }]);
  });
});
