import type { Blueprint, ComponentNode } from "../schema/blueprint";
import { reject, type EditResult } from "./result";
import { updateNode } from "./update-node";

type Layout = NonNullable<ComponentNode["layout"]>;
type Style = NonNullable<ComponentNode["style"]>;

/**
 * 배치 방식(block·flex·grid)을 바꾼다. 새 방식에 맞는 direction(기본 row)·columns(기본 2)를 채우고 맞지 않는 값과 반응형 값은 버린다.
 * 간격·정렬은 유지한다. grid에서 벗어나면 자식들의 차지 칸이 비워진다(updateNode).
 */
export function changeDisplay(bp: Blueprint, id: string, display: Layout["display"]): EditResult {
  const node = bp.nodes.find((n) => n.id === id);
  if (!node) return reject("노드를 찾을 수 없습니다.");
  const prev = node.layout;
  if (prev?.display === display) return { ok: true, blueprint: bp };

  const layout: Layout = { display, gap: prev?.gap ?? null };
  if (prev?.align) layout.align = prev.align;
  if (prev?.justify) layout.justify = prev.justify;
  if (display === "flex") layout.direction = prev?.direction ?? "row";
  if (display === "grid") layout.columns = prev?.columns ?? 2;
  return updateNode(bp, id, { layout });
}

/**
 * display를 바꾸면 사라지는 값의 양. 화면이 변경 전 확인("자식 N개의 차지 칸과 반응형 설정이 초기화됩니다")을 보여 줄지 정하는 데 쓴다.
 * 같은 display이거나 노드가 없으면 null.
 */
export function displayChangeImpact(bp: Blueprint, id: string, display: Layout["display"] | null): { placements: number; responsive: boolean } | null {
  const node = bp.nodes.find((n) => n.id === id);
  if (!node || (node.layout?.display ?? null) === display) return null; // display가 null이면 배치 정보를 없애는 변경이다
  const leavingGrid = node.layout?.display === "grid";
  return {
    placements: leavingGrid ? bp.nodes.filter((n) => n.parentId === id && n.placement !== null).length : 0,
    responsive: (node.layout?.responsive?.length ?? 0) > 0,
  };
}

type Responsive = NonNullable<Layout["responsive"]>[number];

/**
 * 반응형 한 줄(태블릿 또는 모바일)을 바꾼 새 layout을 돌려준다. value가 null이거나 값이 없으면 그 줄을 지운다.
 * 다른 breakpoint의 줄은 그대로 두고, 줄이 하나도 없으면 responsive 필드 자체를 없앤다.
 * 값이 display에 맞는지(flex는 direction만, grid는 columns만)는 스키마가 검증한다.
 */
export function withResponsive(layout: Layout, breakpoint: Responsive["breakpoint"], value: { direction?: Responsive["direction"]; columns?: number } | null): Layout {
  const others = (layout.responsive ?? []).filter((r) => r.breakpoint !== breakpoint);
  const line: Responsive | null = value && (value.direction !== undefined || value.columns !== undefined) ? { breakpoint, ...value } : null;
  const responsive = line ? [...others, line] : others;
  const next: Layout = { ...layout };
  delete next.responsive;
  return responsive.length > 0 ? { ...next, responsive } : next;
}

const SCOPE: Record<Blueprint["stack"]["styling"], Style["scope"]> = { css: "global", "css-modules": "module", tailwind: "utility" };

/** 스타일이 없는 노드에 처음 속성을 추가할 때 쓰는 빈 스타일. scope는 스택의 스타일 방식에서 정한다 */
export const emptyStyle = (styling: Blueprint["stack"]["styling"]): Style => ({ scope: SCOPE[styling], properties: [], ownsOuterSpacing: false });
