import { ARCHITECTURE_NAME, architectureGuide, locationLines, rulePaths } from "../adapters/architecture/prompt";
import { dataLoadingGuide, displayRoute, FRAMEWORK_NAME, frameworkGuide, renderModeText, routingGuide } from "../adapters/framework/prompt";
import { layoutIntro, layoutLines, STYLING_NAME, styleLines, stylingGuide, tailwindTokenLines, usedTokens } from "../adapters/styling/prompt";
import type { Blueprint } from "../schema/blueprint";
import type { TreeNode } from "../schema/tree";
import { block, text, toDocument, type Prepared } from "./export-common";

const KIND_NAME = { page: "페이지", container: "컨테이너", presentational: "표시", hook: "훅" } as const;

// 설계도 필드 이름 → 화면(노드 편집 패널)에서 쓰는 한국어 이름
const FIELD_LABEL: Record<string, string> = {
  name: "이름",
  location: "파일 위치",
  kind: "종류",
  responsibilities: "책임",
  state: "상태",
  props: "props",
  events: "이벤트",
  dataFetch: "서버 통신",
  renderMode: "렌더링 방식",
  layout: "배치",
  placement: "차지 칸",
  style: "스타일",
};

/** "layout.gap" → "배치 gap", "responsibilities[0]" → "책임 1번째". 모르는 필드는 그대로 */
export function fieldLabel(field: string): string {
  const top = /^[A-Za-z]+/.exec(field)?.[0] ?? field;
  const rest = field.slice(top.length).replace(/^\./, "");
  const index = /^\[(\d+)\]$/.exec(rest);
  return [FIELD_LABEL[top] ?? top, index ? `${Number(index[1]) + 1}번째` : rest].filter(Boolean).join(" ");
}

/** 노드 항목 하나: 문자열이면 한 줄, 배열이면 첫 원소가 제목이고 나머지는 그 아래 목록 */
type Attr = string | string[];

function nodeLines(n: TreeNode, depth: number, framework: Blueprint["stack"]["framework"], parent: TreeNode | undefined): string[] {
  const pad = "  ".repeat(depth);
  const mode = renderModeText(framework, n.renderMode);
  const parentMode = parent && renderModeText(framework, parent.renderMode);
  const hooks = n.children.filter((c) => c.kind === "hook").map((c) => c.name);
  // 책임이 둘 이상이면 줄을 나눈 목록으로
  const responsibilities: Attr[] = n.responsibilities.length > 1 ? [["책임:", ...n.responsibilities]] : n.responsibilities.map((r) => `책임: ${r}`);
  const attrs: Attr[] = [
    ...responsibilities,
    ...(n.state.length ? [`상태: ${n.state.map((s) => (s.description ? `${s.name}(${s.description})` : s.name)).join(", ")}`] : []),
    // 훅은 인자를 책임에 적으므로 props 줄이 없고, 그 외 노드는 props가 없다는 것도 분명히 적는다
    ...(n.props.length ? [`props: ${n.props.map((p) => `${p.name}: ${p.type}`).join(", ")}`] : n.kind === "hook" ? [] : ["props: 없음"]),
    ...(n.events.length ? [`이벤트: ${n.events.join(", ")}`] : []),
    `서버 통신(조회·요청): ${n.dataFetch ? "예" : "아니오"}`,
    ...(mode ? [`렌더링: ${mode}`] : []),
    // 설계도의 부모-자식(훅)에서 그대로 끌어낸 정보
    ...(hooks.length ? [`사용하는 훅: ${hooks.join(", ")}`] : []),
    ...(n.kind === "hook" && parent ? [`사용 위치: ${parent.name}${parentMode ? ` (${parentMode})` : ""}`] : []),
  ];
  return [
    `${pad}- **${n.name}** (${KIND_NAME[n.kind]})`,
    ...attrs.flatMap((a) => (typeof a === "string" ? [`${pad}  - ${a}`] : [`${pad}  - ${a[0]}`, ...a.slice(1).map((s) => `${pad}    - ${s}`)])),
  ];
}

/** 화면 규칙 파일(.claude/rules/<화면>.md): 이 화면이 "무엇"인지. 어떻게 만들지는 지시서가 맡는다 */
export function buildRuleFile({ input, root, flat, nodes }: Prepared): string {
  const { blueprint: bp, spec, route } = input;
  const { framework, styling, architecture } = bp.stack;

  const overview = [
    `- 화면 이름: ${bp.title}`,
    `- 화면 주소: ${text(route) ? displayRoute(framework, text(route)) : "없음(아직 입력되지 않음)"}`,
    `- 스택: ${FRAMEWORK_NAME[framework]} · ${STYLING_NAME[styling]} · ${ARCHITECTURE_NAME[architecture]}`,
    ...(text(spec.overview) ? ["", "### 화면 개요", text(spec.overview)] : []),
  ];

  const specItems: [string, string | undefined][] = [
    ["디자인 토큰", spec.tokens],
    ["레이아웃·반응형", spec.layout],
    ["컴포넌트 규칙", spec.componentRules],
    ["상태·데이터", spec.stateData],
    ["접근성", spec.accessibility],
  ];
  const needDefinition = usedTokens(nodes).filter((t) => !text(spec.tokens).includes(t));
  const tokenTable = styling === "tailwind" ? tailwindTokenLines(spec.tokens, nodes) : [];
  // 서버 통신 노드가 페이지 하나뿐이면 하위 노드의 중복 조회를 막는 규칙을 넣는다(설계도 값은 바꾸지 않는다)
  const fetchers = nodes.filter((n) => n.dataFetch);
  const pageOnlyFetch = fetchers.length === 1 && fetchers[0].kind === "page";
  const routing = routingGuide(framework, root.name, route);
  const dataLoading = dataLoadingGuide(framework);
  const rules = [
    ...specItems.flatMap(([title, v]) => (text(v) ? [`### ${title}`, text(v), ""] : [])),
    ...(routing.length ? ["### 라우팅", ...routing, ""] : []),
    ...(fetchers.length && dataLoading.length ? ["### 데이터 로딩", ...dataLoading, ""] : []),
    ...(pageOnlyFetch ? ["### 서버 통신", "같은 데이터는 페이지에서 조회한 값을 전달한다. 하위 컴포넌트가 같은 데이터를 다시 조회하지 않는다.", ""] : []),
    "### 스택 규칙",
    ...[...frameworkGuide(framework), ...stylingGuide(styling), ...architectureGuide(architecture)].map((l) => `- ${l}`),
    ...(needDefinition.length
      ? ["", "### 정의가 필요한 토큰", "설계도에서 쓰였지만 스펙의 디자인 토큰에 없다. 기존 프로젝트의 토큰에서 먼저 찾고, 없으면 임의 값으로 바꾸지 말고 정의가 필요하다고 보고한다.", ...needDefinition.map((t) => `- \`${t}\``)]
      : []),
    ...(tokenTable.length ? ["", "### 토큰 → Tailwind 클래스", ...tokenTable] : []),
  ];

  const owners = nodes.filter((n) => n.state.length > 0).map((n) => `- ${n.name}: ${n.state.map((s) => s.name).join(", ")}`);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const structure = flat.flatMap(({ n, depth }) => nodeLines(n, depth, framework, n.parentId ? byId.get(n.parentId) : undefined));
  const placed = nodes.flatMap((n) => layoutLines(styling, n));
  const assumed = nodes
    .filter((n) => n.assumed || n.assumedFields?.length)
    .map((n) => `- ${n.name}: ${n.assumedFields?.length ? n.assumedFields.map(fieldLabel).join(", ") : "(필드 지정 없음)"}`);

  const head = [
    "---",
    "paths:",
    ...rulePaths(bp.stack, route, nodes).map((p) => `  - "${p}"`),
    "---",
    "",
    `# ${bp.title} — 화면 규칙`,
    "",
    "이 파일은 이 화면 하나의 규칙이다. 위 paths의 파일을 만들거나 고칠 때 적용된다. 만드는 절차는 지시서가 맡는다.",
    "",
  ];
  const priority = [
    "- 디자인 토큰·디렉토리 구조·코드 작성 방식·공통 컴포넌트는 기존 프로젝트를 따른다.",
    "- 이 화면의 구조·책임·상태 위치·배치는 이 파일을 따른다. 기존 프로젝트와 정면으로 충돌하면 임의로 고치지 말고 먼저 보고한다.",
    "- 컴포넌트 구조와 화면 개요가 어긋나면 컴포넌트 구조가 우선이다. 컴포넌트 구조에 없는 요구사항은 구현 전에 보고한다.",
  ];

  return toDocument([
    ...head,
    ...block(2, "우선순위", priority),
    ...block(2, "화면과 스택", overview),
    ...block(2, "규칙", rules),
    ...block(2, "금지 사항", text(spec.constraints) ? [text(spec.constraints)] : []),
    ...block(2, "상태 소유 요약", owners.length ? ["상태는 아래 노드가 소유한다. 다른 노드는 props로 받는다.", "", ...owners] : []),
    ...block(2, "컴포넌트 구조", ["서버 통신은 서버에서 데이터를 조회하거나 요청을 보내는 노드를 뜻한다. 구체적인 내용은 책임에 적혀 있다.", "", ...structure]),
    ...block(2, "파일 위치", locationLines(bp.stack, route, root, nodes)),
    ...block(2, "배치", placed.length ? [layoutIntro(styling), "", ...placed] : []),
    ...block(2, "스타일", styleLines(styling, root)),
    ...block(2, "확인이 필요한 값", assumed.length ? ["AI가 가정한 값이다. 사용자가 아직 확인하지 않았으니 구현 전에 확인한다.", ...assumed] : []),
  ]);
}
