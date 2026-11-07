import { describe, expect, it } from "vitest";
import { layoutLines, styleLines } from "../adapters/styling/prompt";
import { buildTree } from "../schema/tree";
import { loadBlueprint } from "./load-fixture";
import { expectedLayoutClasses, expectedSpanClasses, expectedTokenClass, judgedTokens } from "./tailwind-classes";

// 구현 검사가 기대하는 Tailwind 클래스는 지시서 생성기(core/adapters/styling/prompt.ts)가 사람·에이전트에게 알려 주는 클래스와 같아야 한다.
// 두 규칙이 어긋나면(한쪽만 고치면) 이 테스트가 실패한다. 지시서 쪽 함수는 파일 안에서만 쓰여 문장에 적힌 클래스(백틱)를 읽어 비교한다.

const ticks = (line: string) => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

describe.each([["next"], ["react"]])("지시서의 Tailwind 클래스와 구현 검사의 기대 클래스: %s 묶음", (bundle) => {
  const bp = loadBlueprint(bundle, "correct");
  const root = buildTree(bp.nodes)!;
  const walk = (n: NonNullable<ReturnType<typeof buildTree>>): (typeof n)[] => [n, ...n.children.flatMap(walk)];
  const all = walk(root);

  it("자식을 놓는 배치 클래스가 같다", () => {
    for (const parent of all.filter((n) => n.layout)) {
      const text = layoutLines("tailwind", parent).find((l) => l.startsWith("- **"));
      if (!text) continue; // 훅만 자식인 노드는 지시서에 배치 문장이 없다
      expect(ticks(text).pop()?.split(" ").sort(), parent.name).toEqual(expectedLayoutClasses(parent.layout!).sort());
    }
  });

  it("그리드 안에서 자식이 차지하는 칸 클래스가 같다", () => {
    for (const parent of all.filter((n) => n.layout)) {
      for (const child of parent.children.filter((c) => c.placement)) {
        const line = layoutLines("tailwind", parent).find((l) => l.includes(`- ${child.name}:`));
        expect(ticks(line!).pop()?.split(" ").sort(), child.name).toEqual(expectedSpanClasses(parent.layout!, child.placement!.span).sort());
      }
    }
  });

  it("스타일 토큰이 만드는 클래스가 같다(클래스로 못 바꾸는 토큰은 구현 검사도 판정하지 않는다)", () => {
    const lines = styleLines("tailwind", root);
    for (const n of all.filter((x) => x.style?.properties.length)) {
      const line = lines.find((l) => l.startsWith(`- **${n.name}**`));
      const inPrompt = line ? ticks(line)[0]?.split(" ").sort() ?? [] : [];
      expect(judgedTokens(n).map((t) => t.cls).sort(), n.name).toEqual(inPrompt);
    }
  });

  it("속성-접두사 대응", () => {
    expect(expectedTokenClass("color", "color.onPrimary")).toEqual({ cls: "text-on-primary", prefix: "text" });
    expect(expectedTokenClass("background-color", "color.primary")).toEqual({ cls: "bg-primary", prefix: "bg" });
    expect(expectedTokenClass("padding", "spacing.6")).toEqual({ cls: "p-6", prefix: "p" });
    expect(expectedTokenClass("border-radius", "radius.md")).toEqual({ cls: "rounded-md", prefix: "rounded" });
    expect(expectedTokenClass("font-size", "font.title")).toBeNull();
    expect(expectedTokenClass("max-width", "layout.maxWidth")).toBeNull();
    expect(expectedTokenClass("color", "spacing.4")).toBeNull(); // 분류가 안 맞는 토큰은 클래스가 없다
  });
});
