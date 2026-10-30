import { BlueprintSchema, type Blueprint, type ComponentNode } from "../schema/blueprint";

/** 테스트용 설계도 만들기. 만든 설계도는 스키마를 통과해야 하므로, 틀린 입력은 여기서 바로 드러난다 */
export type NodeSeed = Partial<ComponentNode> & { id: string };
type Stack = Blueprint["stack"];

export const NEXT_TAILWIND: Stack = { framework: "next", styling: "tailwind", architecture: "feature-based" };

export function node(seed: NodeSeed): ComponentNode {
  return {
    name: seed.id.charAt(0).toUpperCase() + seed.id.slice(1),
    parentId: "root",
    order: 0,
    location: { dir: "components" },
    kind: "presentational",
    responsibilities: [],
    state: [],
    props: [],
    events: [],
    dataFetch: false,
    renderMode: "server",
    layout: null,
    placement: null,
    style: null,
    assumed: false,
    ...seed,
  };
}

const COLUMN = { display: "flex", direction: "column", gap: null } as const;

/**
 * 루트(Root, id "root")에 노드를 붙여 설계도를 만든다. 자식이 있는 노드의 layout은 비어 있으면 채운다.
 * 루트는 dataFetch true, 훅·`renderMode`는 스택에 맞게 정리한다.
 */
export function blueprint(seeds: NodeSeed[], stack: Stack = NEXT_TAILWIND, rootSeed: Partial<ComponentNode> = {}): Blueprint {
  const root = node({ id: "root", name: "Root", parentId: null, kind: "page", dataFetch: true, ...rootSeed });
  const all = [root, ...seeds.map(node)].map((n, i, arr) => {
    const hasKids = arr.some((c) => c.parentId === n.id && c.kind !== "hook");
    const renderMode = stack.framework !== "next" || n.kind === "hook" ? null : n.renderMode;
    return { ...n, renderMode, layout: n.layout ?? (hasKids ? COLUMN : null), order: n.parentId === null ? 0 : n.order || i };
  });
  return BlueprintSchema.parse({
    version: "1.2",
    title: "테스트",
    stack,
    route: null,
    source: { hasSpec: true, imageCount: 0 },
    generatedBy: "ai",
    nodes: all,
  });
}
