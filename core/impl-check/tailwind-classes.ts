import { resolveLayout, type Breakpoint } from "../preview/preview";
import type { ComponentNode } from "../schema/blueprint";

// 설계도의 배치·자리·토큰이 Tailwind에서 어떤 클래스가 되는지의 기대값. 지시서 생성기(core/adapters/styling/prompt.ts)와 같은 규칙이며,
// 그쪽 함수는 파일 안에서만 쓰여(기존 어댑터 파일은 수정하지 않는다) 여기에 같은 규칙을 두고 두 결과가 같은지 테스트로 고정한다(tailwind-classes.test.ts).

type Layout = NonNullable<ComponentNode["layout"]>;

export const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();

/** 모바일 우선 클래스: 모바일 값은 접두사 없이, 바뀌는 곳에만 md:·lg: */
function mobileFirst(value: (bp: Breakpoint) => string): string[] {
  const [m, t, d] = [value("mobile"), value("tablet"), value("desktop")];
  return [m, t !== m ? `md:${t}` : "", d !== t ? `lg:${d}` : ""].filter(Boolean);
}

/** spacing.4 → 4, spacing.md → md. 다른 분류의 토큰은 클래스가 없다 */
const gapClass = (gap: string | null) => (gap?.startsWith("spacing.") ? kebab(gap.slice("spacing.".length)) : undefined);

/** 부모(컨테이너) 노드의 배치가 만드는 클래스 */
export function expectedLayoutClasses(l: Layout): string[] {
  const at = (bp: Breakpoint) => resolveLayout(l, bp);
  return [
    l.display,
    ...(l.display === "flex" ? mobileFirst((bp) => `flex-${at(bp).direction === "column" ? "col" : "row"}`) : []),
    ...(l.display === "grid" ? mobileFirst((bp) => `grid-cols-${at(bp).columns}`) : []),
    ...(gapClass(l.gap) ? [`gap-${gapClass(l.gap)}`] : []),
    ...(l.align ? [`items-${l.align}`] : []),
    ...(l.justify ? [`justify-${l.justify}`] : []),
  ];
}

/** 자식이 그리드 안에서 차지하는 칸의 클래스 */
export function expectedSpanClasses(parent: Layout, span: number | "full"): string[] {
  const at = (bp: Breakpoint) => (span === "full" ? "full" : Math.min(span, resolveLayout(parent, bp).columns ?? span));
  return mobileFirst((bp) => `col-span-${at(bp)}`);
}

// 속성 → (클래스 접두사, 토큰 분류). 짝이 맞는 토큰만 클래스로 바꾼다
const PROPERTY_CLASS: Record<string, [prefix: string, category: string]> = {
  color: ["text", "color"],
  "background-color": ["bg", "color"],
  background: ["bg", "color"],
  "border-color": ["border", "color"],
  padding: ["p", "spacing"],
  margin: ["m", "spacing"],
  "border-radius": ["rounded", "radius"],
};

/** 토큰이 만드는 클래스. 대응이 없는 속성·토큰(max-width, font-size 등)은 null */
export function expectedTokenClass(property: string, token: string): { cls: string; prefix: string } | null {
  const [category, ...rest] = token.split(".");
  const rule = PROPERTY_CLASS[property];
  return rule && rule[1] === category ? { cls: `${rule[0]}-${kebab(rest.join("."))}`, prefix: rule[0] } : null;
}

/** 노드의 스타일 속성 중 코드로 판정할 수 있는 토큰(클래스 대응이 있는 것) */
export function judgedTokens(node: ComponentNode): { property: string; token: string; cls: string; prefix: string }[] {
  return (node.style?.properties ?? []).flatMap((p) => {
    const e = p.isToken ? expectedTokenClass(p.property, p.value) : null;
    return e ? [{ property: p.property, token: p.value, ...e }] : [];
  });
}
