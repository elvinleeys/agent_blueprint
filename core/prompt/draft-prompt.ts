import type { Blueprint } from "../schema/blueprint";
import type { SpecInput } from "../schema/spec-input";

export const DRAFT_PROMPT_VERSION = "v2";

export type DraftImageInfo = { originalWidth?: number };

export type DraftPromptInput = {
  spec: SpecInput;
  stack: Blueprint["stack"];
  route?: string | null;
  images?: DraftImageInfo[];
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

const filledSpec = (spec: SpecInput) =>
  SPEC_LABELS.flatMap(([key, label]) => {
    const value = spec[key];
    return typeof value === "string" && value.trim() ? [`${label}: ${value.trim()}`] : [];
  });

/** 텍스트 스펙 항목이 하나라도 채워져 있는지 (source.hasSpec 값) */
export const hasSpecText = (spec: SpecInput) => filledSpec(spec).length > 0;

const LOCATION_RULES: Record<Blueprint["stack"]["architecture"], string> = {
  "type-based": "location.dir은 유형별 폴더(예: components, hooks, lib)를 kebab-case 상대 경로로 쓴다.",
  "feature-based":
    "location.dir은 features/<기능>/<폴더>(예: features/cart/components) 또는 공용 폴더(예: components/common)를 쓴다.",
  fsd:
    "location.dir은 FSD 형식만 쓴다. pages·widgets·features·entities는 `<계층>/<슬라이스>/<세그먼트>`(슬라이스는 kebab-case), " +
    "app·shared는 `<계층>/<세그먼트>`. 예: pages/product-detail/ui, widgets/product-header/ui, features/add-to-cart/model, shared/ui. " +
    "세그먼트는 ui·model·api·lib·config 중 하나만 쓴다(page 같은 이름 금지). " +
    "page 노드는 pages 계층, 훅은 model·api·lib, 그 외 화면 컴포넌트는 ui 세그먼트. " +
    "부모 노드는 자식 노드보다 위 계층(app > pages > widgets > features > entities > shared)이거나 같은 계층의 같은 슬라이스여야 한다(자식이 부모보다 위 계층이면 안 된다). " +
    "같은 계층(예: features끼리)의 부모-자식은 슬라이스가 같아야 하며, 다른 슬라이스이면 안 된다.",
};

const instructions = (stack: DraftPromptInput["stack"], hasImage: boolean) =>
  [
    "당신은 프론트엔드 구조 설계 도우미다. 주어진 스택과 화면 정보로 컴포넌트 트리 설계도(JSON)를 만든다. 코드나 설명 없이 스키마에 맞는 JSON만 출력한다.",
    "모든 문장(title, responsibilities, state의 description 등)은 한국어로 쓴다. 컴포넌트·훅 이름(name)과 id는 영문 식별자로 쓴다.",
    ...(hasImage
      ? [
          "첨부된 와이어프레임 이미지의 영역을 컴포넌트로 나눈다. 텍스트 스펙이 없거나 부족한 부분은 이미지에서 추론한다.",
          "이미지는 영역과 배치를 파악하는 용도다. 크기·색상·간격 값은 스펙의 토큰과 레이아웃 항목을 사용하고, 이미지에서 픽셀 값을 짐작해야 하면 isToken false, assumed true로 표시한다.",
        ]
      : ["텍스트 스펙만으로 설계한다."]),
    "",
    "## 최상위 값",
    `- version은 "1.2", generatedBy는 "ai", stack·route·source는 사용자 메시지의 값을 그대로 쓴다(route가 null이면 null).`,
    "",
    "## nodes 규칙",
    "- nodes는 평면 배열이며 children 필드를 쓰지 않는다. 부모는 parentId로 가리킨다.",
    "- parentId가 null인 루트는 정확히 1개(kind는 page, order 0). 모든 parentId는 nodes 안의 id를 가리킨다.",
    "- id와 name은 설계도 안에서 각각 고유하다. 이름은 컴포넌트는 PascalCase, 훅은 use + PascalCase.",
    "- 같은 부모 아래 형제(훅 포함)의 order는 0부터 시작하는 연속 정수이며 겹치지 않는다.",
    "- responsibilities는 노드당 최대 5개, 가능하면 3개 이하.",
    "- 화면 데이터 조회는 page 노드가 담당하는 것을 기본으로 한다(page 노드의 dataFetch true). 표시만 하는 노드(presentational)는 dataFetch를 false로 한다.",
    "- state는 그 노드가 소유한 상태, props는 부모에게서 받는 값, events는 처리하는 사용자 이벤트(예: onClick)다.",
    "- 책임에 사용자 상호작용(선택·이동·입력·열기/닫기·전환 등)이 있는 노드는 state와 events를 채운다. 상호작용이 있는데 state·events가 비어 있으면 안 된다.",
    "- 부모에게서 onXxx 같은 콜백 prop을 받는 노드는 그 이벤트를 events에도 포함한다.",
    "- 훅(kind hook)은 layout·placement·style·renderMode를 null, events를 빈 배열로 하고, 자식을 갖지 않는다(훅은 부모가 될 수 없다).",
    ...(stack.framework === "next"
      ? [
          "- Next.js: 훅이 아닌 모든 노드의 renderMode는 server 또는 client. 상태나 이벤트가 있는 노드는 client, 그렇지 않으면 server. 훅은 null.",
          "- Next.js: client 노드의 자손은 모두 client여야 한다. 부모-자식은 import 관계라 client 파일이 불러온 컴포넌트는 server가 될 수 없다(server 부모가 client 자식을 갖는 것은 가능).",
          "- Next.js: 훅 노드의 부모는 renderMode가 client여야 한다. server 노드 아래에 훅을 두지 않는다.",
        ]
      : ["- Next.js가 아니므로 모든 노드의 renderMode는 null."]),
    `- ${LOCATION_RULES[stack.architecture]}`,
    "",
    "## 배치와 스타일",
    "- 배치 책임은 부모에게 있다. 훅이 아닌 자식이 있는 노드는 layout이 필수이고, 자식 간격은 부모 layout.gap(토큰 문자열, 예: spacing.4)으로만 준다.",
    "- layout.display가 flex면 direction 필수·columns는 null, grid면 columns(1~12) 필수·direction은 null, block이면 둘 다 null.",
    "- responsive도 같은 규칙이다. grid 부모의 responsive에는 columns만, flex 부모의 responsive에는 direction만 쓴다(grid에 direction, flex에 columns를 쓰지 않는다).",
    "- placement는 부모의 layout.display가 grid일 때만 쓰고(span은 열 수 또는 \"full\"), 그 외에는 null.",
    "- style.properties에는 그 노드 자신의 모양만 쓴다. display, flex-direction, grid-template-columns, gap, row-gap, column-gap, justify-content, align-items, grid-column은 쓰지 않는다. property는 kebab-case이며 한 노드 안에서 중복하지 않는다.",
    "- 값이 디자인 토큰이면 isToken을 true로 한다. 자식이 바깥 여백(margin 등)을 가지면 ownsOuterSpacing을 true로 한다(되도록 false).",
    `- 스타일 방식은 ${stack.styling}이다. style.scope는 css는 global, css-modules는 module, tailwind는 utility로 한다.`,
    "",
    "## 가정 표시",
    "- 입력에 없어 임의로 채운 값이 있으면 그 노드의 assumed를 true로 하고 assumedFields에 필드명을 적는다. 없으면 assumed false, assumedFields는 null.",
    "- 해당하지 않는 선택 필드(direction, columns, align, justify, responsive, classPattern, description, assumedFields)는 null로 둔다.",
  ].join("\n");

export function buildDraftPrompt({ spec, stack, route = null, images = [] }: DraftPromptInput): {
  instructions: string;
  userText: string;
} {
  const hasImage = spec.imageCount > 0;
  const filled = filledSpec(spec);
  // 이미지는 브라우저에서 축소해 보내므로 원본 가로를 알려 주어야 모델이 픽셀 값을 원본 기준으로 오해하지 않는다
  const imageNotes = images.flatMap((img, i) =>
    img.originalWidth ? [`- 이미지 ${i + 1}: 원본 가로 ${img.originalWidth}px를 축소해 전달함`] : [],
  );

  const userText = [
    "## 스택",
    `- framework: ${stack.framework}`,
    `- styling: ${stack.styling}`,
    `- architecture: ${stack.architecture}`,
    `- route: ${route ?? "null"}`,
    "",
    "## 입력 정보",
    `- source.hasSpec: ${filled.length > 0}`,
    `- source.imageCount: ${spec.imageCount}`,
    ...imageNotes,
    "",
    "## 화면 스펙",
    ...(filled.length > 0 ? filled : ["(텍스트 스펙 없음)"]),
    ...(hasImage ? ["", "와이어프레임 이미지를 첨부했다."] : []),
  ].join("\n");

  return { instructions: instructions(stack, hasImage), userText };
}
