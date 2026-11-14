import type { Blueprint, ComponentNode } from "../schema/blueprint";
import type { BanKey, ItemKey } from "./result";
import { judgedTokens } from "./tailwind-classes";

// 설계 준수 항목과 금지 규칙 항목을 설계도에서 뽑는다. 설계도에 적힌 값 하나가 항목 하나다.
//   노드마다: 존재, 위치, 부모-자식(루트 제외), 서버 통신, 렌더 방식(renderMode가 있을 때), 배치(layout), 자리(placement),
//   토큰(클래스로 판정할 수 있는 스타일 속성마다), 상태·props·이벤트(목록 항목마다), 화면 주소(루트 페이지, 설계도에 route가 있을 때)
//   금지 규칙: 인라인 style(훅 제외 노드마다), 바깥 여백(style이 있는 노드마다) — 설계 준수 일치율에는 넣지 않는다.
// 검사 범위 밖(세지 않음): 책임, kind, 설명 글, 스타일 범위·명명 규칙, AI 가정 표시, props 타입, 형제 순서, 클래스로 못 정하는 토큰.

export function nodeItemKeys(bp: Blueprint, n: ComponentNode): ItemKey[] {
  const parent = n.parentId ? bp.nodes.find((x) => x.id === n.parentId) : undefined;
  return [
    "exists",
    "location",
    ...(n.parentId ? ["parent"] : []),
    "fetch",
    ...(n.renderMode ? ["render"] : []),
    ...(n.layout ? ["layout"] : []),
    ...(n.placement && parent?.layout ? ["placement"] : []),
    ...judgedTokens(n).map((t) => `token:${t.property}`),
    ...n.state.map((s) => `state:${s.name}`),
    ...n.props.map((p) => `prop:${p.name}`),
    ...n.events.map((e) => `event:${e}`),
    ...(n.parentId === null && bp.route ? ["route"] : []),
  ];
}

export function nodeBanKeys(n: ComponentNode): BanKey[] {
  return [...(n.kind === "hook" ? [] : (["inline-style"] as const)), ...(n.style ? (["outer-spacing"] as const) : [])];
}
