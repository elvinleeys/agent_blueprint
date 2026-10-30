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

const SCOPE: Record<Blueprint["stack"]["styling"], Style["scope"]> = { css: "global", "css-modules": "module", tailwind: "utility" };

/** 스타일이 없는 노드에 처음 속성을 추가할 때 쓰는 빈 스타일. scope는 스택의 스타일 방식에서 정한다 */
export const emptyStyle = (styling: Blueprint["stack"]["styling"]): Style => ({ scope: SCOPE[styling], properties: [], ownsOuterSpacing: false });
