import type { Rule, Violation } from "../types";

/** R-01 경고: 한 노드의 책임이 3개 초과 */
export const r01: Rule = (bp) =>
  bp.nodes
    .filter((n) => n.responsibilities.length > 3)
    .map((n) => ({
      ruleId: "R-01",
      severity: "warning",
      nodeIds: [n.id],
      message: `${n.name}의 책임이 ${n.responsibilities.length}개입니다(3개 이하 권장). 노드를 나눌 수 있는지 확인하세요.`,
    }));

/** R-04 오류: 표시 전용(presentational) 노드에 데이터 요청 배정 */
export const r04: Rule = (bp) =>
  bp.nodes
    .filter((n) => n.kind === "presentational" && n.dataFetch)
    .map((n) => ({
      ruleId: "R-04",
      severity: "error",
      nodeIds: [n.id],
      message: `${n.name}은(는) 표시 전용인데 데이터를 직접 요청합니다. 요청은 container나 page로 옮기고 값은 props로 받으세요.`,
    }));

/** R-07 경고: 설계도 전체에 데이터 요청 노드가 없음. 선택은 루트로 연결한다 */
export const r07: Rule = (bp) => {
  if (bp.nodes.some((n) => n.dataFetch)) return [];
  const root = bp.nodes.find((n) => n.parentId === null);
  return [
    {
      ruleId: "R-07",
      severity: "warning",
      nodeIds: root ? [root.id] : [],
      message: "데이터를 요청하는 노드가 하나도 없습니다. 화면이 받는 데이터가 어디서 오는지 정해 주세요.",
    },
  ];
};

/** R-08 경고: 루트가 아닌 노드의 종류가 page (페이지는 화면 단위 최상위) */
export const r08: Rule = (bp) =>
  bp.nodes
    .filter((n) => n.kind === "page" && n.parentId !== null)
    .map((n) => ({
      ruleId: "R-08",
      severity: "warning",
      nodeIds: [n.id],
      message: `${n.name}은(는) 루트가 아닌데 종류가 페이지입니다. container나 presentational로 바꾸세요.`,
    }));

const MARGIN = /^margin(-(top|right|bottom|left|inline|inline-start|inline-end|block|block-start|block-end))?$/;
// 가운데 정렬 용도의 auto는 허용한다: 가로 방향 margin이고 값이 auto(와 0)뿐일 때
const CENTERING = new Set(["margin", "margin-inline", "margin-inline-start", "margin-inline-end", "margin-left", "margin-right"]);
const isZero = (t: string) => /^0(px|rem|em)?$/.test(t);

function ownedMargins(props: { property: string; value: string }[]) {
  return props.filter((p) => {
    if (!MARGIN.test(p.property)) return false;
    const tokens = p.value.trim().split(/\s+/);
    const centering = CENTERING.has(p.property) && tokens.includes("auto") && tokens.every((t) => t === "auto" || isZero(t));
    return !centering;
  });
}

/** R-06 경고: 자식 노드가 바깥 여백을 소유 (간격은 부모 layout.gap으로). 루트는 제외 */
export const r06: Rule = (bp) =>
  bp.nodes.flatMap((n): Violation[] => {
    if (n.parentId === null || !n.style) return [];
    const margins = ownedMargins(n.style.properties);
    if (!n.style.ownsOuterSpacing && margins.length === 0) return [];
    const detail = margins.length > 0 ? `(${margins.map((m) => `${m.property}: ${m.value}`).join(", ")})` : "";
    return [{ ruleId: "R-06", severity: "warning", nodeIds: [n.id], message: `${n.name}이(가) 바깥 여백을 스스로 가집니다${detail}. 간격은 부모의 gap으로 주세요.` }];
  });
