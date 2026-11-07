import { PROPERTY_CLASS, spanClass, styleClass, tailwindLayout } from "../adapters/styling/prompt";
import type { ComponentNode } from "../schema/blueprint";

// 설계도의 배치·자리·토큰이 Tailwind에서 어떤 클래스가 되는지의 기대값.
// 지시서 생성기(core/adapters/styling/prompt.ts)가 쓰는 변환 함수를 그대로 가져다 쓴다(새 계산 방식을 만들지 않는다).
// 그래서 지시서가 알려 주는 클래스와 구현 검사가 기대하는 클래스는 같은 함수의 결과다.

type Layout = NonNullable<ComponentNode["layout"]>;

const words = (classes: string) => classes.split(" ").filter(Boolean);

/** 부모(컨테이너) 노드의 배치가 만드는 클래스 */
export const expectedLayoutClasses = (l: Layout): string[] => words(tailwindLayout(l));

/** 자식이 그리드 안에서 차지하는 칸의 클래스 */
export const expectedSpanClasses = (parent: Layout, span: number | "full"): string[] => words(spanClass(parent, span));

/** 토큰이 만드는 클래스. 대응이 없는 속성·토큰(max-width, font-size 등)은 null */
export function expectedTokenClass(property: string, token: string): { cls: string; prefix: string } | null {
  const cls = styleClass(property, token);
  return cls ? { cls, prefix: PROPERTY_CLASS[property][0] } : null;
}

/** 노드의 스타일 속성 중 코드로 판정할 수 있는 토큰(클래스 대응이 있는 것) */
export function judgedTokens(node: ComponentNode): { property: string; token: string; cls: string; prefix: string }[] {
  return (node.style?.properties ?? []).flatMap((p) => {
    const e = p.isToken ? expectedTokenClass(p.property, p.value) : null;
    return e ? [{ property: p.property, token: p.value, ...e }] : [];
  });
}
