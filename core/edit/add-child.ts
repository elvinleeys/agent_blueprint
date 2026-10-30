import type { Blueprint, ComponentNode } from "../schema/blueprint";
import { commitNodes, reject, type EditResult } from "./result";
import { kidsOf } from "./structure-utils";

/**
 * 부모 아래 마지막 자리에 새 노드를 추가하고 selectId로 돌려준다. 훅 아래에는 추가할 수 없다.
 * 기본값: 이름 NewComponent(겹치면 숫자 붙임), presentational, 위치는 부모와 같은 폴더,
 * Next.js면 부모를 포함한 조상 중 client가 있을 때 client 아니면 server(client 파일이 불러온 컴포넌트는 server일 수 없다).
 * 부모의 layout이 없으면 스키마가 요구하므로 block을 채운다.
 */
export function addChild(bp: Blueprint, parentId: string): EditResult {
  const parent = bp.nodes.find((n) => n.id === parentId);
  if (!parent) return reject("부모를 찾을 수 없습니다.");
  if (parent.kind === "hook") return reject("훅에는 자식을 추가할 수 없습니다.", parentId);

  const ids = new Set(bp.nodes.map((n) => n.id));
  let k = bp.nodes.length + 1;
  while (ids.has(`n${k}`)) k++;

  const names = new Set(bp.nodes.map((n) => n.name));
  let name = "NewComponent";
  for (let i = 2; names.has(name); i++) name = `NewComponent${i}`;

  let hasClientAncestor = false;
  for (let cur: ComponentNode | undefined = parent; cur; cur = bp.nodes.find((n) => n.id === cur!.parentId)) {
    if (cur.renderMode === "client") hasClientAncestor = true;
  }

  const child: ComponentNode = {
    id: `n${k}`,
    name,
    parentId,
    order: Math.max(-1, ...kidsOf(bp.nodes, parentId).map((c) => c.order)) + 1,
    location: { dir: parent.location.dir },
    kind: "presentational",
    responsibilities: [],
    state: [],
    props: [],
    events: [],
    dataFetch: false,
    renderMode: bp.stack.framework === "next" ? (hasClientAncestor ? "client" : "server") : null,
    layout: null,
    placement: null,
    style: null,
    assumed: false,
  };
  const nodes = bp.nodes.map((n) => (n.id === parentId && !n.layout ? { ...n, layout: { display: "block" as const, gap: null } } : n));
  const r = commitNodes(bp, [...nodes, child], child.id);
  return r.ok ? { ...r, selectId: child.id } : r;
}
