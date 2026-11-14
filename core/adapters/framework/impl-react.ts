import { at, findingId, type Ctx } from "../../impl-check/context";
import { designRoute } from "../../impl-check/match";
import type { Finding } from "../../impl-check/result";

// React 구현 검사: 라우터 설정에 화면 주소와 페이지가 연결돼 있는가(ICR-01). 라우터 설정을 못 찾거나 읽지 못하면 경고가 아니라 확인 필요다.

export function reactRules(ctx: Ctx) {
  const route = designRoute(ctx.bp.route);
  const root = ctx.nodes.find((n) => n.parentId === null);
  if (!route || !root) return;
  const loc = ctx.located(root.id);
  if (!loc) return;
  const item = `${root.id}|route`;
  const id = findingId("ICR-01", root.id, "route");
  const base = { id, rule: "ICR-01", node: root.name, nodeIds: [root.id], itemIds: [item] };

  const routes = ctx.model.files.flatMap((f) => f.routes.map((r) => ({ r, f }))).filter(({ r }) => r.router === "react-router" && !r.layout);
  const routerFound = ctx.model.files.some((f) => f.routerConfig);
  const review = (message: string, evidence: string[]) => {
    const card: Finding = { ...base, certainty: "review", kind: "router", message, evidence };
    ctx.add(card);
    ctx.mark(root.id, "route", "review", evidence, id);
  };
  const same = routes.filter(({ r }) => r.path === route);

  if (same.length === 0) {
    if (!routerFound) return review("라우터 설정(createBrowserRouter·<Route>)을 찾지 못해 화면 주소와 페이지의 연결을 확인하지 못했습니다.", ["올린 파일에 라우터 설정이 없음"]);
    if (ctx.scope.unreadableRouters.length) return review(`화면 주소 ${route}를 찾지 못했지만 읽지 못한 라우트가 있습니다.`, ctx.scope.unreadableRouters);
    const ev = [`라우터 설정의 주소: ${routes.map(({ r }) => r.path).join(", ") || "없음"}`];
    ctx.add({ ...base, certainty: "certain", severity: "warning", message: `라우터 설정에 화면 주소 ${route}가 없습니다.`, evidence: ev });
    return ctx.mark(root.id, "route", "mismatch", ev, id);
  }
  const linked = same.find(({ r }) => r.component === loc.unit.name);
  if (linked) return ctx.mark(root.id, "route", "match", [`${at(linked.f.path, linked.r.line)} ${route} → ${loc.unit.name}`]);
  if (same.some(({ r }) => r.component === null)) return review(`화면 주소 ${route}에 연결된 컴포넌트를 읽지 못했습니다.`, same.map(({ r, f }) => `${at(f.path, r.line)} ${r.path}`));
  const ev = same.map(({ r, f }) => `${at(f.path, r.line)} ${r.path} → ${r.component}`);
  ctx.add({ ...base, certainty: "certain", severity: "warning", message: `화면 주소 ${route}가 ${loc.unit.name}가 아니라 ${same[0].r.component}에 연결돼 있습니다.`, evidence: ev });
  ctx.mark(root.id, "route", "mismatch", ev, id);
}
