import type { ComponentNode } from "../schema/blueprint";
import { buildTree, type TreeNode } from "../schema/tree";

export type Viewport = "desktop" | "mobile";

export type PreviewBox = {
  id: string;
  name: string;
  display: "block" | "flex" | "grid" | null; // null: 자식 없는 단말 상자
  direction: "row" | "column" | null;
  columns: number | null;
  gap: number; // n × 4px 단계(0~12)
  gapToken: string | null;
  gapEstimated: boolean; // spacing.<정수>가 아니어서 기본 단계로 그린 경우
  align: "start" | "center" | "end" | "stretch" | null;
  justify: "start" | "center" | "end" | "between" | null;
  span: number | "full" | null; // 부모 그리드 안에서 차지하는 칸, 그리드 밖이면 null
  layoutLabel: string; // "grid 3열", "flex 가로"
  placementLabel: string | null; // "2칸", "전체 줄"
  layoutMissing: boolean; // 그려지는 자식이 있는데 layout이 없어 block으로 그린 경우
  children: PreviewBox[];
};

export type HookItem = { id: string; name: string; parentName: string; dataFetch: boolean };
export type Preview = { root: PreviewBox; hooks: HookItem[] };

const MAX_GAP_STEP = 12;
const DEFAULT_GAP_STEP = 4;
// 데스크톱 우선: 데스크톱은 desktop 오버라이드만, 모바일은 tablet → mobile 순서로 덮어쓴다
const CASCADE: Record<Viewport, ("desktop" | "tablet" | "mobile")[]> = {
  desktop: ["desktop"],
  mobile: ["tablet", "mobile"],
};

function resolveLayout(layout: NonNullable<ComponentNode["layout"]>, viewport: Viewport) {
  let direction = layout.direction ?? null;
  let columns = layout.columns ?? null;
  for (const bp of CASCADE[viewport]) {
    const o = layout.responsive?.find((r) => r.breakpoint === bp);
    if (!o) continue;
    if (layout.display === "flex" && o.direction) direction = o.direction;
    if (layout.display === "grid" && o.columns) columns = o.columns;
  }
  return { direction, columns };
}

function gapStep(token: string | null): { step: number; estimated: boolean } {
  if (token === null) return { step: 0, estimated: false };
  const m = /^spacing\.(\d+)$/.exec(token);
  if (!m) return { step: DEFAULT_GAP_STEP, estimated: true };
  return { step: Math.min(Number(m[1]), MAX_GAP_STEP), estimated: false };
}

function layoutLabel(display: PreviewBox["display"], direction: PreviewBox["direction"], columns: number | null) {
  if (display === "grid") return `grid ${columns}열`;
  if (display === "flex") return direction === "column" ? "flex 세로" : "flex 가로";
  return display === "block" ? "block" : "";
}

function toBox(node: TreeNode, parent: PreviewBox | null, viewport: Viewport, hooks: HookItem[]): PreviewBox {
  const drawn = node.children.filter((c) => c.kind !== "hook");
  for (const h of node.children) {
    if (h.kind === "hook") hooks.push({ id: h.id, name: h.name, parentName: node.name, dataFetch: h.dataFetch });
  }

  const layout = node.layout;
  const { direction, columns } = layout ? resolveLayout(layout, viewport) : { direction: null, columns: null };
  const display = layout ? layout.display : drawn.length > 0 ? "block" : null;
  const gap = gapStep(layout?.gap ?? null);

  let span: PreviewBox["span"] = null;
  let placementLabel: string | null = null;
  if (parent?.display === "grid" && node.placement) {
    const s = node.placement.span;
    span = s === "full" ? "full" : Math.min(s, parent.columns ?? s); // 열이 줄어든 보기에서는 열 수까지만
    placementLabel = span === "full" ? "전체 줄" : `${span}칸`;
  }

  const box: PreviewBox = {
    id: node.id,
    name: node.name,
    display,
    direction,
    columns,
    gap: gap.step,
    gapToken: layout?.gap ?? null,
    gapEstimated: gap.estimated,
    align: layout?.align ?? null,
    justify: layout?.justify ?? null,
    span,
    layoutLabel: layoutLabel(display, direction, columns),
    placementLabel,
    layoutMissing: !layout && drawn.length > 0,
    children: [],
  };
  box.children = drawn.map((c) => toBox(c, box, viewport, hooks));
  return box;
}

/** 설계도의 배치 정보를 그대로 상자 트리로 바꾼다(AI 호출 없음). 루트가 하나가 아니면 null */
export function buildPreview(nodes: readonly ComponentNode[], viewport: Viewport): Preview | null {
  const tree = buildTree(nodes);
  if (!tree) return null;
  const hooks: HookItem[] = [];
  const root = toBox(tree, null, viewport, hooks);
  return { root, hooks };
}
