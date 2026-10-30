// 스펙 입력 폼의 안내 문구와 버튼 이름(문구가 바뀌어도 판단 로직은 그대로라 한곳에 모아 테스트한다)

export const SPEC_LABELS = {
  overview: "① 화면 개요 (선택)",
  tokens: "② 디자인 토큰 (선택)",
  layout: "③ 레이아웃·반응형 (선택)",
  componentRules: "④ 컴포넌트 규칙 (선택)",
  stateData: "⑤ 상태·데이터 (선택)",
  accessibility: "⑥ 접근성 (선택)",
  constraints: "⑦ 금지·제약 사항 (선택)",
} as const;

export const ROUTE_LABEL = "화면 주소 (선택)";

/** 이미지만 넣었을 때의 권장 안내(생성을 막지 않는다) */
export const IMAGE_ONLY_NOTE =
  "이미지만으로도 생성할 수 있어요. 다만 데이터 조회 위치·상태는 이미지에 보이지 않으니, ① 화면 개요와 ⑤ 상태·데이터를 함께 적으면 결과가 더 정확해져요.";

/** 생성 버튼 근처에 항상 보여 주는 최소 조건 */
export const MIN_CONDITION = "7개 항목 중 하나 이상, 또는 이미지 1장 이상이면 생성할 수 있어요";

export const REGENERATE_NOTE = "새 판으로 추가되며 기존 초안은 보존됩니다.";

/** 설계도가 아직 없으면 "초안 생성", 있으면 "초안 다시 생성" */
export function generateButtonLabel(busy: boolean, hasBlueprint: boolean): string {
  if (busy) return "초안 생성 중…";
  return hasBlueprint ? "초안 다시 생성" : "초안 생성";
}
