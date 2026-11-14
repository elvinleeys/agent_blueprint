import { at, findingId, type Ctx } from "../../impl-check/context";
import { judgedTokens } from "../../impl-check/tailwind-classes";

// CSS·CSS Modules 구현 검사: CSS 파일을 읽지 않으므로(PostCSS를 쓰지 않음) 배치·자리·토큰을 코드로 판정하지 않고,
// 해당 항목이 있는 노드마다 확인 필요 한 장(IC-09, 종류 style)으로 보낸다. 바깥 여백(금지 규칙)은 확인 불가다.

export function cssRules(ctx: Ctx) {
  for (const node of ctx.nodes) {
    const loc = ctx.located(node.id);
    if (!loc || node.kind === "hook") continue;
    const parent = ctx.parentOf(node);
    const keys = [
      ...(node.layout ? ["layout"] : []),
      ...(node.placement && parent?.layout ? ["placement"] : []),
      ...judgedTokens(node).map((t) => `token:${t.property}`),
    ];
    const where = at(loc.unit.path, loc.unit.line);
    if (keys.length) {
      const id = findingId("IC-09", node.id, "style");
      ctx.add({
        id,
        rule: "IC-09",
        certainty: "review",
        kind: "style",
        node: node.name,
        nodeIds: [node.id],
        itemIds: keys.map((k) => `${node.id}|${k}`),
        message: `${node.name}의 배치·토큰은 CSS 파일을 읽지 않아 코드로 판정하지 않았습니다. 직접 확인이 필요합니다.`,
        evidence: [`${where} 스타일 방식 ${ctx.stack.styling}`],
      });
      for (const k of keys) ctx.mark(node.id, k, "review", [`${where} CSS 파일은 읽지 않음`], id);
    }
    if (node.style) ctx.markBan(node.id, "outer-spacing", "unknown", [`${where} CSS 파일은 읽지 않아 바깥 여백을 확인하지 못함`]);
  }
}
