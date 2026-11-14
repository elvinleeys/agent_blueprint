import { at, findingId, type Ctx } from "../../impl-check/context";
import type { Finding } from "../../impl-check/result";

// FSD 구현 검사(ICF-01): 실제 import가 계층 방향(위 계층을 가져오면 안 됨)과 같은 계층의 다른 슬라이스를 어기는가.
// 계층 순서(위 → 아래): app, pages, widgets, features, entities, shared. shared는 어느 계층에서나 가져올 수 있다. 타입만 가져오는 import는 제외한다.

const LAYERS = ["app", "pages", "widgets", "features", "entities", "shared"];
const SLICED = new Set(["pages", "widgets", "features", "entities"]);

type Place = { layer: string; slice: string | null };

/** 파일 경로에서 처음 나오는 계층 이름을 계층으로, 그 다음 폴더를 슬라이스로 본다 */
function placeOf(path: string): Place | null {
  const segs = path.split("/");
  const i = segs.findIndex((s) => LAYERS.includes(s));
  if (i < 0) return null;
  return { layer: segs[i], slice: SLICED.has(segs[i]) ? (segs[i + 1] ?? null) : null };
}

export function fsdRules(ctx: Ctx) {
  for (const node of ctx.nodes) {
    const loc = ctx.located(node.id);
    if (!loc) continue;
    const from = placeOf(loc.unit.path);
    if (!from || from.layer === "app") continue; // app 계층은 아래 계층을 모두 가져올 수 있다
    for (const imp of loc.file.imports) {
      if (imp.typeOnly || !imp.resolved) continue;
      const to = placeOf(imp.resolved);
      if (!to) continue;
      const up = LAYERS.indexOf(to.layer) < LAYERS.indexOf(from.layer);
      const sibling = to.layer === from.layer && SLICED.has(to.layer) && to.slice !== from.slice;
      if (!up && !sibling) continue;
      const ev = [`${at(loc.file.path, imp.line)} ${from.layer}${from.slice ? `/${from.slice}` : ""} → ${to.layer}${to.slice ? `/${to.slice}` : ""} (${imp.names.join(", ")})`];
      const item = ctx.parentOf(node) ? [`${node.id}|parent`] : [];
      const card: Finding = {
        id: findingId("ICF-01", node.id, "import"),
        rule: "ICF-01",
        certainty: "certain",
        severity: "error",
        node: node.name,
        nodeIds: [node.id],
        itemIds: item,
        message: up ? `${node.name}가 위 계층(${to.layer})을 가져옵니다.` : `${node.name}가 같은 계층(${to.layer})의 다른 슬라이스(${to.slice})를 가져옵니다.`,
        evidence: ev,
      };
      ctx.add(card);
      if (item.length) ctx.mark(node.id, "parent", "mismatch", ev, card.id);
      break; // 노드마다 한 장
    }
  }
}
