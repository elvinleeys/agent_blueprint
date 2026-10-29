import type { Blueprint } from "../schema/blueprint";
import type { SpecInput } from "../schema/spec-input";

export type DraftPromptInput = {
  spec: SpecInput;
  stack: Blueprint["stack"];
};

const SPEC_LABELS: [keyof SpecInput, string][] = [
  ["overview", "① 화면 개요"],
  ["tokens", "② 디자인 토큰"],
  ["layout", "③ 레이아웃·반응형"],
  ["componentRules", "④ 컴포넌트 규칙"],
  ["stateData", "⑤ 상태·데이터"],
  ["accessibility", "⑥ 접근성"],
  ["constraints", "⑦ 금지·제약 사항"],
];

const LOCATION_RULES: Record<Blueprint["stack"]["architecture"], string> = {
  "type-based": "location.dir은 유형별 폴더(예: components, hooks, lib)를 kebab-case 상대 경로로 쓴다.",
  "feature-based":
    "location.dir은 features/<기능>/<폴더>(예: features/cart/components) 또는 공용 폴더(예: components/common)를 쓴다.",
  fsd:
    "location.dir은 FSD 형식만 쓴다. pages·widgets·features·entities는 `<계층>/<슬라이스>/<세그먼트>`(슬라이스는 kebab-case), " +
    "app·shared는 `<계층>/<세그먼트>`. 세그먼트는 ui·model·api·lib·config 중 하나. " +
    "page 노드는 pages 계층, 훅은 model·api·lib, 그 외 화면 컴포넌트는 ui 세그먼트. " +
    "부모 노드는 자식 노드보다 위 계층(app > pages > widgets > features > entities > shared)이거나 같은 계층의 같은 슬라이스여야 한다(자식이 부모보다 위 계층이면 안 된다).",
};

const instructions = (stack: DraftPromptInput["stack"], hasImage: boolean) =>
  [
    "당신은 프론트엔드 구조 설계 도우미다. 주어진 스택과 화면 정보로 컴포넌트 트리 설계도(JSON)를 만든다. 코드나 설명 없이 스키마에 맞는 JSON만 출력한다.",
    hasImage
      ? "첨부된 와이어프레임 이미지의 영역을 컴포넌트로 나눈다. 텍스트 스펙이 없거나 부족한 부분은 이미지에서 추론한다."
      : "텍스트 스펙만으로 설계한다.",
    "",
    "## 최상위 값",
    `- version은 "1.2", generatedBy는 "ai", stack은 사용자 메시지의 값을 그대로 쓴다.`,
    "- route는 스펙에 URL 경로가 있으면 그 값, 없으면 null. source는 사용자 메시지의 값을 그대로 쓴다.",
    "",
    "## nodes 규칙",
    "- nodes는 평면 배열이며 children 필드를 쓰지 않는다. 부모는 parentId로 가리킨다.",
    "- parentId가 null인 루트는 정확히 1개(kind는 page, order 0). 모든 parentId는 nodes 안의 id를 가리킨다.",
    "- id와 name은 설계도 안에서 각각 고유하다. 이름은 컴포넌트는 PascalCase, 훅은 use + PascalCase.",
    "- 같은 부모 아래 형제의 order는 0부터 시작하는 정수이며 겹치지 않는다.",
    "- responsibilities는 노드당 최대 5개, 가능하면 3개 이하. 표시만 하는 노드(presentational)는 dataFetch를 false로 한다.",
    "- state는 그 노드가 소유한 상태, props는 부모에게서 받는 값, events는 처리하는 사용자 이벤트(예: onClick)다.",
    "- 훅(kind hook)은 layout·placement·style·renderMode를 null, events를 빈 배열로 하고, 자식을 갖지 않는다(훅은 부모가 될 수 없다).",
    stack.framework === "next"
      ? "- Next.js: 훅이 아닌 모든 노드의 renderMode는 server 또는 client. 상태나 이벤트가 있는 노드는 client, 그렇지 않으면 server. 훅은 null."
      : "- Next.js가 아니므로 모든 노드의 renderMode는 null.",
    `- ${LOCATION_RULES[stack.architecture]}`,
    "",
    "## 배치와 스타일",
    "- 배치 책임은 부모에게 있다. 훅이 아닌 자식이 있는 노드는 layout이 필수이고, 자식 간격은 부모 layout.gap(토큰 문자열, 예: spacing.4)으로만 준다.",
    "- layout.display가 flex면 direction 필수·columns는 null, grid면 columns(1~12) 필수·direction은 null, block이면 둘 다 null. responsive 값도 같은 규칙을 따른다.",
    "- placement는 부모의 layout.display가 grid일 때만 쓰고(span은 열 수 또는 \"full\"), 그 외에는 null.",
    "- style.properties에는 그 노드 자신의 모양만 쓴다. display, flex-direction, grid-template-columns, gap, row-gap, column-gap, justify-content, align-items, grid-column은 쓰지 않는다. property는 kebab-case이며 한 노드 안에서 중복하지 않는다.",
    "- 값이 디자인 토큰이면 isToken을 true로 한다. 자식이 바깥 여백(margin 등)을 가지면 ownsOuterSpacing을 true로 한다(되도록 false).",
    `- 스타일 방식은 ${stack.styling}이다. style.scope는 css는 global, css-modules는 module, tailwind는 utility로 한다.`,
    "",
    "## 가정 표시",
    "- 입력에 없어 임의로 채운 값이 있으면 그 노드의 assumed를 true로 하고 assumedFields에 필드명을 적는다. 없으면 assumed false, assumedFields는 null.",
    "- 해당하지 않는 선택 필드(direction, columns, align, justify, responsive, classPattern, description, assumedFields)는 null로 둔다.",
  ].join("\n");

export function buildDraftPrompt({ spec, stack }: DraftPromptInput): { instructions: string; userText: string } {
  const hasImage = spec.imageCount > 0;
  const filled = SPEC_LABELS.flatMap(([key, label]) => {
    const value = spec[key];
    return typeof value === "string" && value.trim() ? [`${label}: ${value.trim()}`] : [];
  });

  const userText = [
    "## 스택",
    `- framework: ${stack.framework}`,
    `- styling: ${stack.styling}`,
    `- architecture: ${stack.architecture}`,
    "",
    "## 입력 정보",
    `- source.hasSpec: ${filled.length > 0}`,
    `- source.imageCount: ${spec.imageCount}`,
    "",
    "## 화면 스펙",
    ...(filled.length > 0 ? filled : ["(텍스트 스펙 없음)"]),
    ...(hasImage ? ["", "와이어프레임 이미지를 첨부했다."] : []),
  ].join("\n");

  return { instructions: instructions(stack, hasImage), userText };
}
