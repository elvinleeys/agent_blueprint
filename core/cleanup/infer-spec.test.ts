import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DSComponentSchema } from "../schema/design-system";
import { extractComponents } from "./extract";
import { inferComponents, parseSpecJson } from "./infer-spec";

describe("parseSpecJson", () => {
  it("예시 JSON 통과", () => {
    const r = parseSpecJson(readFileSync("core/schema/sample-design-system.json", "utf-8"));
    expect(r.ok).toBe(true);
  });

  it("JSON이 아니면 오류 한 줄", () => {
    expect(parseSpecJson("{ nope")).toEqual({ ok: false, errors: ["JSON 형식이 올바르지 않습니다."] });
  });

  it("스키마 위반은 경로와 이유를 알린다", () => {
    const d = JSON.parse(readFileSync("core/schema/sample-design-system.json", "utf-8"));
    d.components[0].name = "button";
    delete d.tokens.spacing;
    const r = parseSpecJson(JSON.stringify(d));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith("components.0.name:"))).toBe(true);
      expect(r.errors.some((e) => e.startsWith("tokens.spacing:"))).toBe(true);
    }
  });

  it("빈 문자열·배열이 아닌 값도 거부(최상위)", () => {
    expect(parseSpecJson("").ok).toBe(false);
    expect(parseSpecJson("[]").ok).toBe(false);
  });
});

describe("inferComponents (디자인 시스템으로 올린 파일에서 공식 목록 만들기)", () => {
  const run = (files: Record<string, string>) => inferComponents(extractComponents(Object.entries(files).map(([path, content]) => ({ path, content }))).components);

  it("내보낸 컴포넌트만 공식 목록이 되고, 결과가 스키마를 통과한다", () => {
    const r = run({
      "ui/Button.tsx": `type P = { variant?: "primary" | "outline-large"; label: string };
        export const Button = (p: P) => <button/>;
        const Hidden = () => <i/>;`,
    });
    expect(r.components).toEqual([
      {
        name: "Button",
        variants: ["primary", "outline-large"],
        props: [
          { name: "variant", type: '"primary" | "outline-large"', required: false },
          { name: "label", type: "string", required: true },
        ],
      },
    ]);
    expect(r).toMatchObject({ used: 1, internalSkipped: 1, warnings: [] });
    expect(r.official[0]).toMatchObject({ name: "Button", path: "ui/Button.tsx" });
    r.components.forEach((c) => expect(DSComponentSchema.safeParse(c).success).toBe(true));
  });

  it("kebab-case가 아닌 variant는 버리고 경고한다", () => {
    const r = run({ "ui/A.tsx": `export const A = (p: { variant: "Default" | "ok" | "two words" }) => <i/>;` });
    expect(r.components[0].variants).toEqual(["ok"]);
    expect(r.warnings).toEqual([{ kind: "variant-dropped", component: "A", values: ["Default", "two words"] }]);
  });

  it("같은 이름이 여러 파일에 있으면 먼저 나온 것을 쓰고 경고한다", () => {
    const r = run({ "ui/a/Card.tsx": `export const Card = (p: { a: string }) => <i/>;`, "ui/b/Card.tsx": `export const Card = (p: { b: string }) => <i/>;` });
    expect(r.components).toHaveLength(1);
    expect(r.components[0].props[0].name).toBe("a");
    expect(r.warnings).toEqual([{ kind: "duplicate-name", name: "Card", paths: ["ui/a/Card.tsx", "ui/b/Card.tsx"] }]);
  });

  it("내보낸 컴포넌트가 없으면 빈 목록", () => {
    expect(run({ "x/A.tsx": `const A = () => <i/>; export const util = 1;` })).toMatchObject({ components: [], used: 0, internalSkipped: 1 });
  });

  it("이 프로젝트의 components/ui 파일로 만든 스펙이 스키마를 통과한다", () => {
    const names = ["button", "badge", "card", "tabs"];
    const files = names.map((n) => ({ path: `components/ui/${n}.tsx`, content: readFileSync(`components/ui/${n}.tsx`, "utf-8") }));
    const r = inferComponents(extractComponents(files).components);
    expect(r.used).toBeGreaterThan(10);
    expect(r.components.find((c) => c.name === "Button")?.variants).toEqual(["default", "outline", "secondary", "ghost", "destructive", "link"]);
  });
});
