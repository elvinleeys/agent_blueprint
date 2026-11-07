import { at, findingId, type Ctx } from "../../impl-check/context";
import { designRoute } from "../../impl-check/match";
import type { Finding } from "../../impl-check/result";

// Next.js 구현 검사: 렌더 방식(ICN-01·02·03)과 화면 주소의 page.tsx(ICN-04).
// "use client"는 파일 맨 위 지시문으로 읽는다. 설계의 renderMode가 없는 노드(훅)는 보지 않는다.

const f = (rule: string, severity: "error" | "warning", node: { id: string; name: string }, key: string, message: string, evidence: string[], itemIds: string[]): Finding => ({
  id: findingId(rule, node.id, key),
  rule,
  certainty: "certain",
  severity,
  node: node.name,
  nodeIds: [node.id],
  itemIds,
  message,
  evidence,
});

export function nextRules(ctx: Ctx) {
  // 설계상 server 컴포넌트의 파일 경로 → 노드
  const serverFiles = new Map<string, string>();
  for (const n of ctx.nodes) {
    const loc = ctx.located(n.id);
    if (loc && n.renderMode === "server") serverFiles.set(loc.unit.path, n.name);
  }

  for (const node of ctx.nodes) {
    const loc = ctx.located(node.id);
    if (!loc || !node.renderMode) continue;
    const { unit, file } = loc;
    const where = at(unit.path, unit.line);
    const item = `${node.id}|render`;
    const usesClientFeatures = unit.state.length > 0 || unit.hooks.length > 0 || unit.eventProps.length > 0 || unit.elements.some((e) => e.eventAttrs.length > 0);
    let bad = false;

    if (node.renderMode === "client" && !file.useClient) {
      const withFeatures = usesClientFeatures;
      const ev = [`${where} "use client" 없음 · 상태 ${unit.state.length}개, 훅 ${unit.hooks.length}개, 이벤트 ${unit.eventProps.length + unit.elements.filter((e) => e.eventAttrs.length).length}개`];
      const card = f("ICN-01", withFeatures ? "error" : "warning", node, "render", withFeatures ? `${node.name}는 client 컴포넌트인데 상태·이벤트를 쓰면서 "use client"가 없습니다.` : `${node.name}는 client 컴포넌트로 정했는데 "use client"가 없습니다(상태·이벤트도 없음).`, ev, [item]);
      ctx.add(card);
      ctx.mark(node.id, "render", "mismatch", ev, card.id);
      bad = true;
    } else if (node.renderMode === "server" && file.useClient) {
      const ev = [`${where} server 컴포넌트로 정했는데 파일에 "use client"가 있음`];
      const card = f("ICN-02", "warning", node, "render", `${node.name}는 server 컴포넌트인데 "use client"가 있습니다.`, ev, [item]);
      ctx.add(card);
      ctx.mark(node.id, "render", "mismatch", ev, card.id);
      bad = true;
    }

    // ICN-03: client 파일이 설계상 server 컴포넌트의 파일에서 값을 가져오면 server 컴포넌트가 client로 끌려간다(타입만 가져오는 것은 제외)
    if (file.useClient) {
      const hit = file.imports.find((i) => !i.typeOnly && i.resolved && serverFiles.has(i.resolved) && i.resolved !== unit.path);
      if (hit) {
        const owner = serverFiles.get(hit.resolved!)!;
        const ev = [`${at(file.path, hit.line)} client 파일이 server 컴포넌트 ${owner}의 파일 ${hit.resolved}에서 ${hit.names.join(", ")}을(를) 가져옴`];
        const card = f("ICN-03", "error", node, "render-import", `client 컴포넌트 ${node.name}가 server 컴포넌트 ${owner}의 파일을 가져옵니다.`, ev, [item]);
        ctx.add(card);
        ctx.mark(node.id, "render", "mismatch", ev, card.id);
        bad = true;
      }
    }
    if (!bad) ctx.mark(node.id, "render", "match", [`${where} 설계 ${node.renderMode} ← "use client" ${file.useClient ? "있음" : "없음"}`]);
  }

  // ICN-04: 화면 주소의 app/<주소>/page.tsx가 있고 페이지를 가져와 내보내기만 하는가(로직·JSX를 직접 쓰면 경고)
  const route = designRoute(ctx.bp.route);
  const root = ctx.nodes.find((n) => n.parentId === null);
  if (route && root && ctx.stateOf(root.id) === "certain") {
    const hit = ctx.model.files.flatMap((file) => file.routes.map((r) => ({ r, file }))).find(({ r }) => r.router === "next-app" && r.path === route);
    const item = `${root.id}|route`;
    if (!hit) {
      if (ctx.scope.unreadableRouters.length) {
        const card: Finding = { id: findingId("ICN-04", root.id, "route"), rule: "ICN-04", certainty: "review", kind: "router", node: root.name, nodeIds: [root.id], itemIds: [item], message: `화면 주소 ${route}의 page.tsx를 찾지 못했지만 읽지 못한 라우트가 있습니다.`, evidence: ctx.scope.unreadableRouters };
        ctx.add(card);
        return ctx.mark(root.id, "route", "review", card.evidence, card.id);
      }
      const ev = [`화면 주소 ${route}에 해당하는 app/…/page.tsx가 없음`];
      const card = f("ICN-04", "warning", root, "route", `화면 주소 ${route}의 page.tsx가 없습니다.`, ev, [item]);
      ctx.add(card);
      return ctx.mark(root.id, "route", "mismatch", ev, card.id);
    }
    const pageFile = hit.file;
    if (pageFile.units.length === 0) return ctx.mark(root.id, "route", "match", [`${pageFile.path} 페이지를 가져와 내보내기만 함(기본 내보내기 ${pageFile.defaultExport ?? "재내보내기"})`]);
    const ev = [`${at(pageFile.path, pageFile.units[0].line)} page.tsx가 직접 ${pageFile.units.map((u) => u.name).join(", ")}을(를) 그림`];
    const card = f("ICN-04", "warning", root, "route", `${pageFile.path}는 페이지를 가져와 내보내기만 해야 하는데 직접 화면을 그립니다.`, ev, [item]);
    ctx.add(card);
    ctx.mark(root.id, "route", "mismatch", ev, card.id);
  }
}
