// 설계 노드 ↔ 코드 컴포넌트·훅 짝짓기의 결과 타입. 규칙은 스펙 tasks/spec-implementation-check.md §6-1.

/**
 * 짝의 근거 종류
 * - exact: 이름이 정확히 같음 / case: 대소문자만 다름
 * - same-name-location: 같은 이름이 여러 개인데 파일 위치(location.dir)가 맞는 것이 하나
 * - same-name: 같은 이름이 여러 개인데 특정하지 못함
 * - name-similarity: 이름 단어 Jaccard가 기준값 이상(점수 = Jaccard)
 * - location: 부모가 렌더링·호출하는 짝 없는 코드이고 같은 폴더 / props 유사 / 이름 단어 겹침
 * - route: 페이지 노드의 화면 주소와 같은 주소의 화면 파일 안 컴포넌트
 * - file-name: 이름 없는 기본 내보내기를 파일 이름으로 판단(코드가 직접 붙인 이름이 아님)
 * - path-name-unread: 경로에 노드 이름이 보이는데 그 파일을 읽지 못함
 * - unknown-target: 경로를 알 수 없는 import(변수)가 있어 "코드에 없음"을 확정하지 못함
 */
export type EvidenceKind = "exact" | "case" | "same-name-location" | "same-name" | "name-similarity" | "location" | "route" | "file-name" | "path-name-unread" | "unknown-target";

/** 근거 하나: 종류, 점수(있으면), 사람이 읽는 설명 */
export type Evidence = { kind: EvidenceKind; score?: number; detail: string };

export type UnitRef = {
  name: string;
  path: string;
  kind: "component" | "hook";
  /** 파일 밖으로 내보내는가. false면 파일 안에서만 쓰는 컴포넌트(별도 정보, 짝의 확실성과 무관) */
  exported: boolean;
  /** declared = 코드가 직접 붙인 이름, file = 이름 없는 기본 내보내기라 파일 이름에서 가져온 이름 */
  nameSource: "declared" | "file";
};

/** 확실한 짝. 이후 검사(props·상태·이벤트·서버 통신·위치)는 이 짝에 대해서만 한다 */
export type CertainPair = { nodeId: string; nodeName: string; unit: UnitRef; evidence: Evidence[] };

export type CandidateEntry = { unit: UnitRef; evidence: Evidence[]; /** 후보 정렬에 쓴 이름 유사도(0~1) */ score: number };

/**
 * 짝 확인 필요 한 건
 * - candidate: 후보가 있음(짝 없는 노드와 코드가 후보로 묶인 한 건)
 * - same-name-ambiguous: 같은 이름이 여러 개인데 위치 등으로 특정하지 못함
 * - unreadable-named-path: 경로에 노드 이름이 보이는데 그 파일을 읽지 못해 확실한 짝도 확정하지 않음
 * - unreadable-unknown-target: 짝을 못 찾았고 경로를 알 수 없는 import(변수)가 있어 "코드에 없음"을 확정하지 못함
 */
export type PairReview = {
  nodeId: string;
  nodeName: string;
  reason: "candidate" | "same-name-ambiguous" | "unreadable-named-path" | "unreadable-unknown-target";
  /** 1순위가 맨 앞. 비어 있을 수 있다(unreadable-unknown-target 등) */
  candidates: CandidateEntry[];
  /** 읽지 못한 경로 글자(unreadable-named-path) */
  via?: string;
  /** 이 확인 필요 항목 전체의 근거(1순위 후보의 근거, 또는 읽지 못한 코드의 근거) */
  evidence: Evidence[];
};

export type Pairing = {
  /** 확실한 짝 */
  pairs: CertainPair[];
  /** 짝 확인 필요(후보·같은 이름 여러 개·읽지 못한 코드) */
  reviews: PairReview[];
  /** 짝도 후보도 없고 읽지 못한 코드의 영향도 없는 노드(코드에 없음, IC-01) */
  missing: { nodeId: string; nodeName: string }[];
  /** 코드에만 있는 내보낸 컴포넌트·훅(짝도 후보도 아님, IC-02 재료) */
  extraUnits: UnitRef[];
  /** 이후 검사를 해도 되는 노드인가: 확실한 짝일 때만 true(후보·확인 필요는 false) */
  checkable: (nodeId: string) => boolean;
  /** 확실한 짝을 노드 id로 찾는다 */
  pairOf: (nodeId: string) => CertainPair | undefined;
};
