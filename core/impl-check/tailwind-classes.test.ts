import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROPERTY_CLASS, layoutLines, spanClass, styleClass, styleLines, tailwindLayout } from "../adapters/styling/prompt";
import { buildTree } from "../schema/tree";
import { loadBlueprint } from "./load-fixture";
import { expectedLayoutClasses, expectedSpanClasses, expectedTokenClass, judgedTokens } from "./tailwind-classes";

// 구현 검사와 지시서 생성기가 같은 변환 함수를 쓰는지 확인한다(복사본이 아니라 같은 함수).
// 1) tailwind-classes.ts가 변환 함수를 직접 만들지 않고 prompt.ts에서 가져온다(소스 확인)
// 2) 같은 입력에 두 쪽 결과가 같다(함수 결과 + 지시서 문장에 적힌 클래스)

const ticks = (line: string) => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

describe("같은 함수를 쓴다", () => {
  const source = readFileSync("core/impl-check/tailwind-classes.ts", "utf8");
  it("변환 함수를 새로 정의하지 않고 지시서 생성기(prompt.ts)에서 가져온다", () => {
    expect(source).toMatch(/from "\.\.\/adapters\/styling\/prompt"/);
    for (const own of ["function mobileFirst", "const mobileFirst", "const kebab", "function kebab", "const gapClass", "const PROPERTY_CLASS", "function resolveLayout"]) expect(source, own).not.toContain(own);
  });
});

describe.each([["next"], ["react"]])("지시서의 Tailwind 클래스와 구현 검사의 기대 클래스: %s 묶음", (bundle) => {
  const bp = loadBlueprint(bundle, "correct");
  const root = buildTree(bp.nodes)!;
  const walk = (n: NonNullable<ReturnType<typeof buildTree>>): (typeof n)[] => [n, ...n.children.flatMap(walk)];
  const all = walk(root);

  it("배치: 구현 검사의 기대 클래스는 지시서 변환 함수의 결과 그대로이고, 지시서 문장에도 같은 클래스가 적힌다", () => {
    for (const parent of all.filter((n) => n.layout)) {
      expect(expectedLayoutClasses(parent.layout!).join(" "), parent.name).toBe(tailwindLayout(parent.layout!));
      const text = layoutLines("tailwind", parent).find((l) => l.startsWith("- **"));
      if (text) expect(ticks(text).pop(), parent.name).toBe(tailwindLayout(parent.layout!)); // 훅만 자식인 노드는 지시서에 배치 문장이 없다
    }
  });

  it("자리: 그리드 안에서 자식이 차지하는 칸 클래스도 같다", () => {
    for (const parent of all.filter((n) => n.layout)) {
      for (const child of parent.children.filter((c) => c.placement)) {
        expect(expectedSpanClasses(parent.layout!, child.placement!.span).join(" "), child.name).toBe(spanClass(parent.layout!, child.placement!.span));
        const line = layoutLines("tailwind", parent).find((l) => l.includes(`- ${child.name}:`));
        expect(ticks(line!).pop(), child.name).toBe(spanClass(parent.layout!, child.placement!.span));
      }
    }
  });

  it("토큰: 구현 검사가 판정하는 토큰의 클래스는 지시서 변환 함수(styleClass)와 같고, 클래스로 못 바꾸는 토큰은 판정하지 않는다", () => {
    const lines = styleLines("tailwind", root);
    for (const n of all.filter((x) => x.style?.properties.length)) {
      const line = lines.find((l) => l.startsWith(`- **${n.name}**`));
      const inPrompt = line ? (ticks(line)[0]?.split(" ").sort() ?? []) : [];
      expect(judgedTokens(n).map((t) => t.cls).sort(), n.name).toEqual(inPrompt);
      for (const t of judgedTokens(n)) expect(t.cls).toBe(styleClass(t.property, t.token));
    }
  });
});

describe("속성-접두사 대응", () => {
  it("대응표 값은 prompt.ts의 PROPERTY_CLASS 그대로", () => {
    expect(expectedTokenClass("color", "color.onPrimary")).toEqual({ cls: "text-on-primary", prefix: PROPERTY_CLASS.color[0] });
    expect(expectedTokenClass("background-color", "color.primary")).toEqual({ cls: "bg-primary", prefix: "bg" });
    expect(expectedTokenClass("padding", "spacing.6")).toEqual({ cls: "p-6", prefix: "p" });
    expect(expectedTokenClass("border-radius", "radius.md")).toEqual({ cls: "rounded-md", prefix: "rounded" });
    expect(expectedTokenClass("font-size", "font.title")).toBeNull();
    expect(expectedTokenClass("max-width", "layout.maxWidth")).toBeNull();
    expect(expectedTokenClass("color", "spacing.4")).toBeNull(); // 분류가 안 맞는 토큰은 클래스가 없다
  });
});
