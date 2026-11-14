// 구현 검사 결과 타입. 설계 준수 항목과 금지 규칙 항목을 따로 집계하고, 결과 카드(Finding)마다 같은 입력이면 같은 id를 둔다.
// id는 5단계 AI 제안이 확인 필요 항목을 가리키는 데 쓴다(AI 의견은 설계 준수 일치율에 직접 넣지 않고 따로 보인다).

export type Severity = "error" | "warning" | "info";

/** 설계 준수 항목 하나의 판정. 근거를 확인해야 일치, 설계와 다른 근거를 확인하면 불일치, 근거가 부족하면 확인 필요 */
export type ItemStatus = "match" | "mismatch" | "review";
/** 금지 규칙 항목: 준수·위반·확인 불가(코드에 없는 노드·짝 확인 필요 노드·CSS처럼 판정할 수 없는 경우) */
export type BanStatus = "ok" | "violated" | "unknown";

/**
 * 설계 준수 항목 키: exists · location · parent · fetch · render · layout · placement · route
 * · token:<css속성> · state:<이름> · prop:<이름> · event:<이름>
 */
export type ItemKey = string;
export type BanKey = "inline-style" | "outer-spacing";

export type DesignItem = {
  /** `<노드 id>|<항목 키>` */
  id: string;
  nodeId: string;
  nodeName: string;
  key: ItemKey;
  status: ItemStatus;
  /** 이 항목 판정에 관련된 결과 카드 id */
  findingIds: string[];
  /** 근거: 파일·위치·읽은 값 */
  evidence: string[];
};

export type BanItem = { id: string; nodeId: string; nodeName: string; key: BanKey; status: BanStatus; findingIds: string[]; evidence: string[] };

/** 확인 필요 카드의 종류 */
export type ReviewKind = "pair" | "state" | "prop" | "style" | "fetch" | "fetch-kind" | "router" | "import" | "unreadable";

/**
 * 결과 카드. id = `<규칙>|<노드 id>|<카드 키>`(같은 입력이면 같은 id).
 * certain이면 severity가 있고, review(확인 필요)이면 kind가 있다.
 */
export type Finding = {
  id: string;
  rule: string;
  certainty: "certain" | "review";
  severity?: Severity;
  kind?: ReviewKind;
  /** 설계 노드 이름(IC-02는 코드 컴포넌트 이름) */
  node: string;
  nodeIds: string[];
  itemIds: string[];
  message: string;
  evidence: string[];
  /** 확인 필요: 설계 쪽 이름(상태·props)과 코드 쪽 후보 이름, 읽지 못한 경로 */
  design?: string;
  candidate?: string;
  via?: string;
  /** true면 설계에 적히지 않은 발견(코드에만 있음, 설계에 없는 props·상태). 설계 준수 항목에 들지 않는다 */
  outsideDesign?: boolean;
};

export type Summary = {
  /** 설계 준수: 일치 M / 전체 N */
  design: { total: number; match: number; mismatch: number; review: number };
  /** 금지 규칙(설계 준수 일치율의 분모·분자에 넣지 않는다) */
  ban: { violated: number; unknown: number };
  /** 설계에 없는 발견 수 */
  outsideDesign: number;
  /** 검사 범위 밖(설계도에 적혀 있지만 코드로 판정하지 않는 것) */
  outOfScope: string[];
};

export const OUT_OF_SCOPE = ["책임(responsibilities)", "kind 구분", "설명 글", "스타일 범위·명명 규칙", "AI 가정 표시", "props 타입", "형제 순서", "토큰으로 클래스를 정하지 못하는 속성(max-width·font-size 등)"];

export type ImplCheckResult = {
  items: DesignItem[];
  bans: BanItem[];
  findings: Finding[];
  summary: Summary;
};
