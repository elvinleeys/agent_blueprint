import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeDemo, DEMO_ROOT, DEMO_SETS } from "../../scripts/build-demo-code";
import { buildDemoBlueprintSql } from "../../scripts/demo-blueprint-sql";
import { readCodeModel } from "../code-model/facts";
import { loadBlueprint } from "./load-fixture";
import { checkImplementation } from "./run";

// 구현 검사 화면 시연 세트(fixtures/demo-implementation-check): 시험 데이터와 같은지, 문서(docs/demo-implementation-check.md)에 적은 결과가 나오는지.
// 폴더 업로드처럼 폴더 이름(correct/·renamed/·warning/)이 경로 앞에 붙은 채로 검사한다. 설계도는 시험 데이터의 예시 설계도(상품 상세)다.

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(`${dir}/${n}`).isDirectory() ? walk(`${dir}/${n}`) : [`${dir}/${n}`]));
const upload = (name: string) => walk(`${DEMO_ROOT}/${name}`).map((p) => ({ path: p.slice(DEMO_ROOT.length + 1), content: readFileSync(p, "utf8") }));
const check = (name: string) => checkImplementation(loadBlueprint("next", "correct"), readCodeModel(upload(name)));
const cards = (name: string) => check(name).findings.map((f) => `${f.rule}:${f.certainty}:${f.node}`);

describe("시연 폴더는 시험 데이터에서 만든 것과 같다(npm run demo:build)", () => {
  it.each(Object.entries(DEMO_SETS))("%s", (name, cases) => {
    const onDisk = new Map(walk(`${DEMO_ROOT}/${name}`).map((p) => [p.slice(`${DEMO_ROOT}/${name}/`.length), readFileSync(p, "utf8")]));
    const composed = composeDemo(cases);
    expect([...onDisk.keys()].sort()).toEqual(composed.map((f) => f.path).sort());
    for (const f of composed) expect(onDisk.get(f.path), f.path).toBe(f.content);
  });

  it("폴더마다 파일은 30개 이하이고 tsconfig.json이 있다(올릴 수 있는 상한 안)", () => {
    for (const name of Object.keys(DEMO_SETS)) {
      const files = upload(name);
      expect(files.length).toBeLessThanOrEqual(30);
      expect(files.some((f) => f.path === `${name}/tsconfig.json`)).toBe(true);
    }
  });
});

describe("예시 설계도를 프로젝트에 넣는 SQL(npm run demo:sql)", () => {
  const ID = "3f2b8c1e-9a4d-4e0b-8d7a-1c2b3a4d5e6f";

  it("프로젝트 id를 넣은 insert 한 문장이고, 설계도(노드 8개·스택·화면 주소)가 그대로 들어 있다", () => {
    const sql = buildDemoBlueprintSql(ID);
    expect(sql).toContain(`values ('${ID}', '1.2', '상품 상세'`);
    expect(sql.match(/insert into public\.blueprints/g)).toHaveLength(1);
    const nodes = /'(\[\{[\s\S]*\}\])'::jsonb\);/.exec(sql);
    expect(JSON.parse(nodes![1])).toHaveLength(8);
    expect(sql).toContain('"framework":"next","styling":"tailwind","architecture":"fsd"');
    expect(sql).toContain("'/products/[id]'");
  });

  it("uuid가 아니면 거부한다(SQL에 아무 문자열이나 넣지 않는다)", () => {
    for (const bad of ["", "abc", "'; drop table projects; --", `${ID}x`]) expect(() => buildDemoBlueprintSql(bad)).toThrow(/uuid/);
  });
});

describe("시연 폴더의 검사 결과(문서에 적은 것과 같다)", () => {
  it("correct: 카드 없음, 설계 항목 65개 모두 일치", () => {
    expect(cards("correct")).toEqual([]);
    expect(check("correct").summary.design).toEqual({ total: 65, match: 65, mismatch: 0, review: 0 });
    expect(check("correct").summary.ban).toEqual({ violated: 0, unknown: 0 });
  });

  it("renamed: 확인 필요 카드 3장(짝 확인 필요 ProductGallery ↔ ItemImages, 상태 useCart, props PriceTag), 일치 56개·확인 필요 9개", () => {
    expect(cards("renamed").sort()).toEqual(["IC-01:review:ProductGallery", "IC-05:review:useCart", "IC-06:review:PriceTag"]);
    const r = check("renamed");
    expect(r.summary.design).toEqual({ total: 65, match: 56, mismatch: 0, review: 9 });
    expect(r.findings.find((f) => f.rule === "IC-01")).toMatchObject({ kind: "pair", candidate: "ItemImages" });
    expect(r.pairing.reviews.find((p) => p.nodeName === "ProductGallery")?.candidates[0].unit.path).toBe("renamed/src/entities/product/ui/ItemImages.tsx");
  });

  it("renamed: 짝짓기 버튼으로 확정하면 그 노드가 확실한 짝이 되어 확인 필요가 줄어든다", () => {
    const bp = loadBlueprint("next", "correct");
    const model = readCodeModel(upload("renamed"));
    const r = checkImplementation(bp, model, [{ nodeId: "n-gallery", path: "renamed/src/entities/product/ui/ItemImages.tsx", name: "ItemImages" }]);
    expect(r.findings.some((f) => f.rule === "IC-01")).toBe(false);
    expect(r.summary.design.review).toBeLessThan(9);
  });

  it("warning: 확실한 경고 3건(IC-03 위치, IC-11 바깥 여백, IC-12 인라인 style), 확인 필요 없음", () => {
    expect(cards("warning").sort()).toEqual(["IC-03:certain:AddToCartButton", "IC-11:certain:PriceTag", "IC-12:certain:ProductGallery"]);
    const r = check("warning");
    expect(r.findings.every((f) => f.certainty === "certain" && f.severity === "warning")).toBe(true);
    expect(r.summary.design).toEqual({ total: 65, match: 64, mismatch: 1, review: 0 });
    expect(r.summary.ban).toEqual({ violated: 2, unknown: 0 });
  });
});
