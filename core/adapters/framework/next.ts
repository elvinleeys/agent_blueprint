import { ancestorsOf, nodeMap } from "../../rules/helpers";
import type { Rule, Violation } from "../../rules/types";

/** NX-01 오류: 상태나 이벤트가 있는 노드가 server */
export const nx01: Rule = (bp) =>
  bp.nodes
    .filter((n) => n.renderMode === "server" && (n.state.length > 0 || n.events.length > 0))
    .map((n) => ({
      ruleId: "NX-01",
      severity: "error",
      nodeIds: [n.id],
      message: `${n.name}은(는) 상태나 이벤트가 있는데 server입니다. client로 바꾸세요.`,
    }));

/** NX-03 오류: 훅의 부모가 server (훅은 client 노드가 불러야 한다) */
export const nx03: Rule = (bp) => {
  const map = nodeMap(bp);
  return bp.nodes.flatMap((n): Violation[] => {
    const parent = n.kind === "hook" && n.parentId !== null ? map.get(n.parentId) : undefined;
    if (parent?.renderMode !== "server") return [];
    return [{ ruleId: "NX-03", severity: "error", nodeIds: [n.id, parent.id], message: `훅 ${n.name}의 부모 ${parent.name}이(가) server입니다. 훅은 client 노드에서만 쓸 수 있습니다.` }];
  });
};

/** NX-04 오류: 조상 중 client가 있는데 자신이 server (client가 불러온 컴포넌트는 server로 남지 않는다) */
export const nx04: Rule = (bp) => {
  const map = nodeMap(bp);
  return bp.nodes.flatMap((n): Violation[] => {
    if (n.renderMode !== "server") return [];
    const client = ancestorsOf(map, n).find((a) => a.renderMode === "client");
    if (!client) return [];
    return [{ ruleId: "NX-04", severity: "error", nodeIds: [n.id], message: `${n.name}은(는) client인 ${client.name}의 하위인데 server입니다. client로 바꾸거나 client 범위를 조정하세요.` }];
  });
};

/**
 * NX-02 경고: client 범위가 필요 이상으로 넓음.
 * 가장 위의 client 노드(client 조상이 없는 것)가 자기 필요(상태·이벤트·훅 자식)가 없으면 경계를 아래로 내릴 수 있다.
 */
export const nx02: Rule = (bp) => {
  const map = nodeMap(bp);
  const hookParents = new Set(bp.nodes.filter((n) => n.kind === "hook" && n.parentId !== null).map((n) => n.parentId));
  return bp.nodes
    .filter((n) => n.renderMode === "client" && !ancestorsOf(map, n).some((a) => a.renderMode === "client"))
    .filter((n) => n.state.length === 0 && n.events.length === 0 && !hookParents.has(n.id))
    .map((n) => ({
      ruleId: "NX-02",
      severity: "warning",
      nodeIds: [n.id],
      message: `${n.name}은(는) 자체로 client가 필요하지 않습니다. client 지정을 필요한 하위 노드로 내릴 수 있는지 확인하세요.`,
    }));
};

export const nextRules: Rule[] = [nx04, nx03, nx01, nx02];
