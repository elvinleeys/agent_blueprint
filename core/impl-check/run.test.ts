import { describe, expect, it } from "vitest";
import { readCodeModel } from "../code-model/facts";
import { blueprint } from "../rules/fixture";
import type { Blueprint } from "../schema/blueprint";
import { listCaseDirs, loadBlueprint, loadCode, readExpected, type ExpectedCase } from "./load-fixture";
import { checkImplementation } from "./run";

// 시험 데이터의 기대 결과(expected.json)와 checkImplementation 결과를 정확히 비교한다.
// 확실: 규칙·심각도·노드가 같아야 한다. 확인 필요: 규칙·종류·노드가 같아야 하고, 기대에 적은 후보·설계 쪽 이름·경로도 같아야 한다. 표에 없는 결과가 나오면 실패한다.
// 집계(summary)는 설계 준수(일치 M/N·불일치·확인 필요)와 금지 규칙(위반·확인 불가)을 따로 비교한다.

const certainKey = (x: { rule: string; severity?: string; node: string }) => `${x.rule} · ${x.severity} · ${x.node}`;
const reviewKey = (x: { rule: string; kind?: string; node: string }) => `${x.rule} · ${x.kind} · ${x.node}`;

function run(bundle: string, name: string) {
  const bp = loadBlueprint(bundle, name);
  return { bp, r: checkImplementation(bp, readCodeModel(loadCode(bundle, name))) };
}

describe.each(["next", "react"])("구현 검사: %s 묶음의 기대 결과", (bundle) => {
  const expected = readExpected(bundle);
  const cases = Object.entries(expected.cases);

  it.each(cases)("%s: 확실·확인 필요 카드", (name, c: ExpectedCase) => {
    const { r } = run(bundle, name);
    const certain = r.findings.filter((f) => f.certainty === "certain");
    const review = r.findings.filter((f) => f.certainty === "review");
    expect(certain.map(certainKey).sort(), `${name} 확실`).toEqual(c.certain.map(certainKey).sort());
    expect(review.map(reviewKey).sort(), `${name} 확인 필요`).toEqual(c.needsReview.map(reviewKey).sort());
    for (const want of c.needsReview) {
      const got = review.find((f) => reviewKey(f) === reviewKey(want))!;
      if (want.candidate) expect(got.candidate, `${name} ${reviewKey(want)} 후보`).toBe(want.candidate);
      if (want.design) expect(got.design, `${name} ${reviewKey(want)} 설계 쪽 이름`).toBe(want.design);
      if (want.via) expect(got.via, `${name} ${reviewKey(want)} 경로`).toBe(want.via);
    }
  });

  it.each(cases)("%s: 설계 준수 일치 M/N과 금지 규칙 집계", (name, c: ExpectedCase) => {
    const want = c.facts?.summary;
    expect(want, `${name}에 facts.summary가 있다`).toBeDefined();
    const { r } = run(bundle, name);
    expect(r.summary.design).toEqual(want!.design);
    expect(r.summary.ban).toEqual(want!.ban);
    expect(r.summary.outsideDesign).toBe(want!.outsideDesign);
  });
});

describe.each(["next", "react"])("집계 구조: %s 묶음의 모든 사례", (bundle) => {
  const cases = [...new Set(["correct", ...listCaseDirs(bundle)])];

  it.each(cases)("%s: 항목마다 판정한 규칙과 근거가 있고, id가 겹치지 않으며 카드와 연결된다", (name) => {
    const { bp, r } = run(bundle, name);
    // 설계 준수와 금지 규칙은 따로 센다: 금지 규칙 항목은 설계 준수의 분모·분자에 들어가지 않는다
    expect(r.summary.design.match + r.summary.design.mismatch + r.summary.design.review).toBe(r.summary.design.total);
    expect(r.items.length).toBe(r.summary.design.total);
    expect(r.items.some((i) => i.key === "inline-style" || i.key === "outer-spacing")).toBe(false);
    for (const i of r.items) expect(i.evidence[0], `${i.id} 판정 근거`).not.toBe("판정한 규칙이 없음");
    for (const b of r.bans) expect(b.evidence[0], `${b.id} 판정 근거`).not.toBe("판정한 규칙이 없음");
    // 근거 없이 일치로 세지 않는다
    for (const i of r.items.filter((x) => x.status === "match")) expect(i.evidence.length, `${i.id} 일치의 근거`).toBeGreaterThan(0);
    // 확인 필요·불일치 항목은 결과 카드와 연결된다(5단계 AI 제안이 카드 id로 가리킨다)
    const ids = r.findings.map((f) => f.id);
    expect(new Set(ids).size, `${name} 카드 id가 겹치지 않는다`).toBe(ids.length);
    for (const i of r.items.filter((x) => x.status !== "match")) {
      expect(i.findingIds.length, `${i.id}(${i.status})에 연결된 카드`).toBeGreaterThan(0);
      for (const fid of i.findingIds) expect(ids, `${i.id}가 가리키는 카드`).toContain(fid);
    }
    for (const f of r.findings) for (const it of f.itemIds) expect(r.items.map((x) => x.id), `${f.id}가 가리키는 항목`).toContain(it);
    // 코드에 없는 노드·짝 확인 필요 노드의 금지 규칙은 위반·준수가 아니라 확인 불가
    const notCertain = new Set(bp.nodes.filter((n) => !r.pairing.pairOf(n.id)).map((n) => n.id));
    for (const b of r.bans.filter((x) => notCertain.has(x.nodeId))) expect(b.status, `${b.id}`).toBe("unknown");
    for (const i of r.items.filter((x) => notCertain.has(x.nodeId))) expect(i.status).not.toBe("match");
  });

  it.each(cases)("%s: 파일·노드 순서를 섞어도 결과와 카드 id가 같다", (name) => {
    const bp = loadBlueprint(bundle, name);
    const files = loadCode(bundle, name);
    const show = (fs: typeof files, b: Blueprint) => {
      const r = checkImplementation(b, readCodeModel(fs));
      return JSON.stringify({ findings: r.findings, items: r.items, bans: r.bans, summary: r.summary });
    };
    const base = show(files, bp);
    expect(show([...files].reverse(), { ...bp, nodes: [...bp.nodes].reverse() })).toBe(base);
  });
});

// ── 규칙별 시험(손으로 만든 코드) ───────────────────────────────────────────
const code = (files: Record<string, string>) => readCodeModel(Object.entries(files).map(([path, content]) => ({ path, content })));
const TAILWIND_NEXT = { framework: "react", styling: "tailwind", architecture: "type-based" } as const;
const seedNode = (name: string, extra: object = {}) => ({ id: name.toLowerCase(), name, location: { dir: "components" }, ...extra });

describe("Tailwind 규칙: 클래스는 항상·조건부·읽지 못함·없음으로 나눠 판정한다", () => {
  const withStyle = (props: { property: string; value: string; isToken: boolean }[]) => ({ style: { scope: "utility" as const, properties: props, ownsOuterSpacing: false } });
  const tokenCase = (cls: string) => {
    const bp = blueprint([seedNode("Tag", withStyle([{ property: "color", value: "color.primary", isToken: true }]))], TAILWIND_NEXT);
    return checkImplementation(bp, code({ "src/components/Tag.tsx": `export function Tag() { return <p className=${cls}>x</p>; }` }));
  };
  const tokenItem = (r: ReturnType<typeof tokenCase>) => r.items.find((i) => i.nodeId === "tag" && i.key === "token:color")!;

  it("토큰 클래스가 항상 있으면 일치", () => expect(tokenItem(tokenCase('"text-primary"')).status).toBe("match"));
  it("같은 접두사에 임의값(대괄호)이 있으면 불일치(확실)", () => {
    const r = tokenCase('"text-[#e11d48]"');
    expect(tokenItem(r).status).toBe("mismatch");
    expect(r.findings.find((f) => f.rule === "IC-10")).toMatchObject({ certainty: "certain", severity: "warning" });
  });
  it("기본 색 클래스(text-gray-700)나 클래스 없음은 불일치가 아니라 확인 필요", () => {
    expect(tokenItem(tokenCase('"text-gray-700"')).status).toBe("review");
    expect(tokenItem(tokenCase('"font-bold"')).status).toBe("review");
    expect(tokenCase('"text-gray-700"').findings.find((f) => f.rule === "IC-10")).toMatchObject({ certainty: "review", kind: "style" });
  });
  it("조건부 클래스나 읽지 못한 값(cn 변수)은 확인 필요이고, 없다고 확정하지 않는다", () => {
    expect(tokenItem(tokenCase("{big ? \"text-primary\" : \"text-primary opacity-50\"}")).status).toBe("review");
    expect(tokenItem(tokenCase('{cn("font-bold", extra)}')).status).toBe("review");
  });
  it("바깥 여백(금지 규칙): margin이 항상 있으면 위반, 조건부·읽지 못함이면 확인 불가, 없으면 준수", () => {
    const margin = (cls: string) => {
      const bp = blueprint([seedNode("Tag", { style: { scope: "utility", properties: [], ownsOuterSpacing: false } })], TAILWIND_NEXT);
      return checkImplementation(bp, code({ "src/components/Tag.tsx": `export function Tag() { return <p className=${cls}>x</p>; }` })).bans.find((b) => b.nodeId === "tag" && b.key === "outer-spacing")!.status;
    };
    expect(margin('"mt-4 text-primary"')).toBe("violated");
    expect(margin('"mx-auto"')).toBe("ok"); // 가운데 정렬은 제외
    expect(margin('{on ? "m-2" : "p-2"}')).toBe("unknown");
    expect(margin('{cn("p-2", extra)}')).toBe("unknown");
    expect(margin('"p-2"')).toBe("ok");
  });
});

describe("공통 규칙의 경계", () => {
  it("상태를 훅으로 뽑아낸 구현은 그 훅이 호출되고 있으면 상태가 있는 것으로 본다(위치 다름이 아님)", () => {
    const bp = blueprint([seedNode("Panel", { state: [{ name: "open", description: "열림" }] })], TAILWIND_NEXT);
    const r = checkImplementation(bp, code({ "src/components/Panel.tsx": `import { usePanel } from "../hooks/usePanel";\nexport function Panel() { usePanel(); return <i />; }`, "src/hooks/usePanel.ts": `export function usePanel() { const [open, setOpen] = useState(false); return open; }` }));
    expect(r.items.find((i) => i.key === "state:open")!.status).toBe("match");
    expect(r.findings.some((f) => f.rule === "IC-05")).toBe(false);
  });

  it("부모 코드가 import를 풀지 못해 렌더링 여부를 알 수 없으면 확인 필요(import)", () => {
    const bp = blueprint([seedNode("Child")], TAILWIND_NEXT);
    const r = checkImplementation(bp, code({ "src/components/Child.tsx": `export function Child() { return <i />; }`, "src/pages/Root.tsx": `import { Child } from "~/components/Child";\nexport function Root() { return <Child />; }` }));
    // 루트(Root 노드)는 이름이 같은 코드가 없어 짝이 없으므로, 부모가 확실한 설계로 다시 시험한다
    const bp2 = blueprint([seedNode("Child")], TAILWIND_NEXT, { name: "Root", location: { dir: "pages" } });
    const r2 = checkImplementation(bp2, code({ "src/components/Child.tsx": `export function Child() { return <i />; }`, "src/pages/Root.tsx": `import { Child } from "~/components/Child";\nexport function Root() { return <Child />; }` }));
    expect(r2.findings.find((f) => f.rule === "IC-04")).toMatchObject({ certainty: "review", kind: "import", via: "~/components/Child" });
    expect(r.items.length).toBeGreaterThan(0);
  });

  it("후보에는 세부 검사를 하지 않는다: 짝 확인 필요 노드의 항목은 일치로 세지 않는다", () => {
    const bp = blueprint([seedNode("ProductCard", { props: [{ name: "price", type: "number", required: true }] })], TAILWIND_NEXT);
    const r = checkImplementation(bp, code({ "src/components/ProductCardList.tsx": `export function ProductCardList({ price }: { price: number }) { return <i>{price}</i>; }` }));
    const items = r.items.filter((i) => i.nodeId === "productcard");
    expect(items.every((i) => i.status === "review")).toBe(true);
    expect(r.findings.filter((f) => f.nodeIds.includes("productcard"))).toHaveLength(1); // 카드는 한 장
    expect(r.findings.some((f) => f.rule === "IC-06" || f.rule === "IC-03")).toBe(false);
  });
});
