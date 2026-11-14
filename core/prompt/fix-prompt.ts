import type { Finding, ImplCheckResult, ReviewKind, Severity } from "../impl-check/result";

// 구현 검사 수정 지시서. 템플릿만 쓰고 AI를 부르지 않아 같은 입력이면 같은 출력이다.
// 담는 것(스펙 "수정 지시서 범위"): 확실한 카드(설계 밖 발견 제외) 전부 + 사용자가 포함한 확인 필요 카드 + 사용자가 포함한 AI 책임 제안(missing, "AI 제안(사용자 확인)" 구역).
// 포함하지 않은 항목은 지시서에서만 빠지고(건수도 적지 않음), 머리말의 설계 준수 집계(일치 M / 전체 N)는 어떤 경우에도 검사 결과 그대로다.
// 이름·파일 경로·근거만 적고 코드 본문은 넣지 않는다.

export const FIX_SOURCE = "implementation-check";
export const FIX_FILE_NAME = "implementation-fix-prompt.md";

export type FixPromptInput = {
  baseline: { revision: number; source: "export" | "latest"; newerRevision?: number };
  result: Pick<ImplCheckResult, "findings" | "summary">;
  /** 지시서에 포함하기로 한 확인 필요 카드 id(순서·중복은 결과에 영향 없음) */
  include: Iterable<string>;
  /** 사용자가 포함한 AI 책임 제안(missing만). 없으면 지시서는 AI 이전과 같다 */
  aiResponsibilities?: AiResponsibilityItem[];
};

/** 수정 지시서에 넣는 AI 책임 제안 하나(AI가 "책임을 수행하지 않은 것 같다"고 본 것을 사용자가 포함함) */
export type AiResponsibilityItem = { id: string; nodeName: string; responsibility: string; reason: string };

const AI_RESPONSIBILITY_ACTION = "이 책임을 코드가 수행하는지 직접 확인하고, 수행하지 않으면 설계대로 추가한다. AI의 의견이라 틀릴 수 있으니 확실하지 않으면 고치지 말고 보고한다.";

export const SEVERITY_LABEL: Record<Severity, string> = { error: "오류", warning: "경고", info: "정보" };
export const REVIEW_LABEL: Record<ReviewKind, string> = {
  pair: "짝 확인 필요",
  state: "상태 확인 필요",
  prop: "props 확인 필요",
  style: "스타일 확인 필요",
  fetch: "서버 통신 확인 필요",
  "fetch-kind": "서버 통신 유형 확인 필요",
  router: "라우터 확인 필요",
  import: "import 확인 필요",
  unreadable: "읽지 못한 코드 확인 필요",
};

/** 규칙별 "할 일"(확실한 카드). 모든 규칙에 문구가 있어야 한다(시험으로 확인) */
export const FIX_ACTIONS: Record<string, string> = {
  "IC-01": "설계의 위치에 설계대로 컴포넌트를 만든다.",
  "IC-03": "파일을 설계의 위치로 옮기고 import 경로를 고친다.",
  "IC-04": "부모가 이 노드를 렌더링(훅이면 호출)하도록 고친다.",
  "IC-05": "설계의 상태를 이 컴포넌트에 둔다.",
  "IC-06": "설계의 props를 추가한다.",
  "IC-07": "설계의 이벤트 props를 추가하고 연결한다.",
  "IC-08": "설계대로 서버 통신을 이 노드로 모으거나, 서버 통신을 맡지 않는 노드에서는 뺀다.",
  "IC-09": "배치·자리 클래스를 설계대로 맞춘다.",
  "IC-10": "임의값 대신 설계의 토큰 클래스를 쓴다.",
  "IC-11": "맨 바깥 요소의 margin을 지우고 부모의 배치(gap)로 옮긴다.",
  "IC-12": "인라인 style을 지우고 클래스로 옮긴다.",
  "ICN-01": '파일 맨 위에 "use client"를 추가한다.',
  "ICN-02": '"use client"를 지운다.',
  "ICN-03": "server 컴포넌트를 client 파일에서 직접 가져오지 말고, server 부모에서 children으로 넘긴다.",
  "ICN-04": "page.tsx는 페이지를 가져와 내보내기만 하게 하고, 화면은 설계의 페이지 파일로 옮긴다.",
  "ICR-01": "라우터 설정에서 화면 주소를 설계의 페이지에 연결한다.",
  "ICF-01": "import가 FSD 방향(위 계층·같은 계층의 다른 슬라이스를 가져오지 않기)을 따르게 고친다.",
};

const REVIEW_ACTION = "설계와 맞는지 확인하고, 다르면 설계대로 고친다. 확실하지 않으면 고치지 말고 보고한다.";
const IMPORT_RENAME = "이 컴포넌트를 가져오는 모든 파일의 import 경로와 가져오는 이름도 함께 변경한다.";

const actionOf = (f: Finding): string => {
  if (f.certainty === "certain") return FIX_ACTIONS[f.rule] ?? REVIEW_ACTION;
  if (f.rule === "IC-01" && f.kind === "pair") {
    const target = f.candidate ? `후보 코드(${f.candidate})가 설계의 ${f.node}가 맞는지` : `어느 코드가 설계의 ${f.node}인지`;
    return `${target} 확인한 뒤, 맞으면 설계 이름·위치로 맞추고 설계대로 고친다. ${IMPORT_RENAME}`;
  }
  return REVIEW_ACTION;
};

const titleOf = (f: Finding): string => {
  const label = f.certainty === "certain" ? SEVERITY_LABEL[f.severity ?? "warning"] : REVIEW_LABEL[f.kind ?? "pair"];
  const who = f.certainty === "review" && f.kind === "pair" && f.candidate ? `${f.node} ↔ ${f.candidate}` : f.node;
  return `[${f.rule} · ${label}] ${who}`;
};

const item = (n: number, f: Finding): string[] => [`### ${n}. ${titleOf(f)}`, "", `- 문제: ${f.message}`, ...f.evidence.map((e) => `- 근거: ${e}`), `- 할 일: ${actionOf(f)}`, ""];

export function buildFixPrompt({ baseline, result, include, aiResponsibilities = [] }: FixPromptInput): string {
  const { findings, summary } = result;
  const included = new Set(include);
  const certain = findings.filter((f) => f.certainty === "certain" && !f.outsideDesign);
  const reviews = findings.filter((f) => f.certainty === "review");
  const picked = reviews.filter((f) => included.has(f.id));
  const outside = findings.filter((f) => f.outsideDesign);
  const d = summary.design;

  const basis = baseline.source === "export" ? "지시서를 내보낸 판" : "내보낸 기록이 없어 최신 판";
  const lines: string[] = [
    "# 구현 수정 지시서",
    "",
    `> 출처: ${FIX_SOURCE} (AgentBlueprint 구현 검사). 기준: 설계도 판 ${baseline.revision}(${basis})`,
    ...(baseline.newerRevision !== undefined ? [`> 이후 판 ${baseline.newerRevision}가 있습니다. 이 지시서는 판 ${baseline.revision} 기준입니다.`] : []),
    `> 설계 준수: ${d.total}개 중 일치 ${d.match}개 (불일치 ${d.mismatch}, 확인 필요 ${d.review})`,
    "",
    "## 목표",
    "",
    "설계도대로 구현되도록 아래 항목을 **한 번에 하나씩** 고칩니다. 아래에 없는 코드는 바꾸지 않습니다.",
    "",
  ];

  let n = 0;
  if (certain.length) {
    lines.push("## 확실한 수정 (오류 → 경고 → 정보 순)", "");
    for (const f of certain) lines.push(...item(++n, f));
  }
  if (picked.length) {
    lines.push("## 확인 뒤 수정 (사용자가 포함한 확인 필요 항목)", "");
    for (const f of picked) lines.push(...item(++n, f));
  }
  // 같은 입력이면 같은 출력: 화면의 체크 순서와 상관없이 id 순으로
  const aiItems = [...new Map(aiResponsibilities.map((a) => [a.id, a])).values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (aiItems.length) {
    lines.push("## AI 제안(사용자 확인)", "", "> AI가 책임을 수행하지 않은 것 같다고 본 항목 중 사용자가 포함한 것입니다. 설계 준수 집계에는 들어가지 않습니다.", "");
    for (const a of aiItems) lines.push(`### ${++n}. [AI 제안 · 책임 확인] ${a.nodeName}`, "", `- 책임: ${a.responsibility}`, `- AI 근거: ${a.reason}`, `- 할 일: ${AI_RESPONSIBILITY_ACTION}`, "");
  }
  if (!certain.length && !picked.length && !aiItems.length) lines.push("## 고칠 항목", "", "고칠 항목이 없습니다.", "");

  // 사용자의 진행 상황(포함하지 않은 확인 필요 건수)은 적지 않는다: 지시서는 에이전트가 고칠 것만 담는다
  lines.push("## 건드리지 않을 것", "");
  for (const f of outside) lines.push(`- 설계 밖: ${f.message}`);
  lines.push("- 위에 적지 않은 코드는 바꾸지 않는다");
  lines.push("");
  return lines.join("\n");
}
