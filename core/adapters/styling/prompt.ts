import { layoutLabel, resolveLayout, type Breakpoint } from "../../preview/preview";
import type { Blueprint } from "../../schema/blueprint";
import type { TreeNode } from "../../schema/tree";

type Styling = Blueprint["stack"]["styling"];
type Layout = NonNullable<TreeNode["layout"]>;

export const STYLING_NAME: Record<Styling, string> = { css: "CSS", "css-modules": "CSS Modules", tailwind: "Tailwind CSS" };

/** 토큰 정의 규칙: 있으면 그대로, 없으면 만들지 않고 보고, 사용자가 값을 확정한 경우에만 정의 */
const tokenRule = (where: string) =>
  `디자인 토큰이 기존 테마(또는 CSS 변수)에 있는지 확인하고, 있으면 그대로 사용한다. 없으면 임의의 값을 만들지 않고 확인이 필요한 항목으로 보고한다. 사용자가 값을 확정한 경우에만 정의한다(${where}).`;

/** 필수 규칙 안의 스택 규칙 */
export function stylingGuide(styling: Styling): string[] {
  if (styling === "tailwind")
    return [
      "스타일은 유틸리티 클래스로만 쓴다. CSS Modules(`*.module.css`)와 인라인 스타일은 쓰지 않고, 테마에 없는 임의값(대괄호 값)도 쓰지 않는다.",
      "프로젝트의 Tailwind 버전을 확인한다. 4면 CSS의 `@theme`에, 3이면 `tailwind.config`의 `theme.extend`에 디자인 토큰을 정의한다.",
      tokenRule("Tailwind 4는 `@theme`, 3은 `tailwind.config`의 `theme.extend`"),
      "반응형은 모바일 우선이다. 기본 클래스가 모바일이고, 큰 화면은 `md:`(태블릿)·`lg:`(데스크톱) 접두사로 덮어쓴다.",
    ];
  if (styling === "css-modules")
    return [
      "컴포넌트 전용 스타일은 컴포넌트와 같은 이름의 `<컴포넌트명>.module.css`에 둔다. 전역 CSS에 두지 않는다.",
      tokenRule("CSS Modules는 기존 전역 변수 파일"),
    ];
  return ["클래스 이름은 하나의 명명 규칙(BEM 등)을 정해 일관되게 쓴다."];
}

/** 배치 섹션 머리말. 설계도의 기본 배치는 데스크톱 기준이다 */
export function layoutIntro(styling: Styling): string {
  return styling === "tailwind"
    ? "설계도의 기본 배치는 데스크톱 기준이다. 아래 클래스는 모바일 우선(기본=모바일, `md:`=태블릿, `lg:`=데스크톱)으로 바꿔 적었다."
    : "설계도의 기본 배치는 데스크톱 기준이고, 괄호 안은 태블릿·모바일에서 바뀌는 값이다.";
}

// 화면 너비별 값. 미리보기와 같은 계산(resolveLayout)을 쓰므로 미리보기와 같은 배치를 말한다
const BP_NAME: Record<Breakpoint, string> = { desktop: "데스크톱", tablet: "태블릿", mobile: "모바일" };

/** 데스크톱 값 뒤에, 값이 바뀌는 태블릿·모바일만 괄호로 덧붙인다 */
function desktopFirst(label: (bp: Breakpoint) => string): string {
  const notes: string[] = [];
  if (label("tablet") !== label("desktop")) notes.push(`${BP_NAME.tablet} ${label("tablet")}`);
  if (label("mobile") !== label("tablet")) notes.push(`${BP_NAME.mobile} ${label("mobile")}`);
  return `${label("desktop")}${notes.length ? `(${notes.join(", ")})` : ""}`;
}

/** 모바일 우선 클래스: 모바일 값은 접두사 없이, 바뀌는 곳에만 md:·lg: */
function mobileFirst(value: (bp: Breakpoint) => string): string {
  const [m, t, d] = [value("mobile"), value("tablet"), value("desktop")];
  return [m, t !== m ? `md:${t}` : "", d !== t ? `lg:${d}` : ""].filter(Boolean).join(" ");
}

// spacing.4 → 4, spacing.md → md (대응표의 gap-<키>와 같다). 다른 분류의 토큰은 클래스가 없다
const gapClass = (gap: string | null) => (gap?.startsWith("spacing.") ? kebab(gap.slice("spacing.".length)) : undefined);

function tailwindLayout(l: Layout): string {
  const at = (bp: Breakpoint) => resolveLayout(l, bp);
  const parts = [
    l.display,
    l.display === "flex" ? mobileFirst((bp) => `flex-${at(bp).direction === "column" ? "col" : "row"}`) : "",
    l.display === "grid" ? mobileFirst((bp) => `grid-cols-${at(bp).columns}`) : "",
    gapClass(l.gap) ? `gap-${gapClass(l.gap)}` : "",
    l.align ? `items-${l.align}` : "",
    l.justify ? `justify-${l.justify}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

// 열이 줄어든 화면에서는 열 수까지만 차지한다(미리보기와 같은 규칙)
const spanAt = (parent: Layout, span: number | "full", bp: Breakpoint) => (span === "full" ? "full" : Math.min(span, resolveLayout(parent, bp).columns ?? span));
const spanClass = (parent: Layout, span: number | "full") => mobileFirst((bp) => `col-span-${spanAt(parent, span, bp)}`);

/** 부모 노드가 자식을 어떻게 놓는지 문장으로. 자식 배치가 없는 노드는 빈 배열 */
export function layoutLines(styling: Styling, parent: TreeNode): string[] {
  const l = parent.layout;
  const kids = parent.children.filter((c) => c.kind !== "hook");
  if (!l || kids.length === 0) return [];
  const at = (bp: Breakpoint) => resolveLayout(l, bp);
  const shape = desktopFirst((bp) => layoutLabel(l.display, at(bp).direction, at(bp).columns));
  const tail = [
    l.gap ? `간격 토큰 ${l.gap}` : "간격 없음",
    l.align ? `align-items ${l.align}` : "",
    l.justify ? `justify-content ${l.justify === "between" ? "space-between" : l.justify}` : "",
  ].filter(Boolean);
  const tw = styling === "tailwind" ? ` Tailwind 클래스: \`${tailwindLayout(l)}\`.` : "";
  const lines = [`- **${parent.name}**: 자식을 ${shape} 배치로 놓는다. ${tail.join(", ")}.${tw}`];

  // 자리(placement)는 그리드 부모 아래에서만 있다. 열이 줄어든 화면에서는 열 수까지만 차지한다(미리보기와 같은 규칙)
  for (const c of kids) {
    if (!c.placement) continue;
    const span = (bp: Breakpoint) => spanAt(l, c.placement!.span, bp);
    const text = desktopFirst((bp) => (span(bp) === "full" ? "한 줄 전체" : `${span(bp)}칸`));
    const cls = styling === "tailwind" ? ` 클래스: \`${spanClass(l, c.placement.span)}\`.` : "";
    lines.push(`  - ${c.name}: ${text} 차지.${cls}`);
  }
  return lines;
}

const TOKEN_IN_TEXT = /\b(?:color|spacing|radius|layout|font|shadow|size|border|opacity)\.[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*/g;
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();

/** 클래스로 바꿀 수 있는 토큰만 클래스를 돌려준다. 나머지는 null */
function tokenClasses(token: string): string | null {
  const [category, ...rest] = token.split(".");
  const key = kebab(rest.join("."));
  if (category === "color") return `\`bg-${key}\`·\`text-${key}\`·\`border-${key}\``;
  if (category === "spacing") return `\`p-${key}\`·\`m-${key}\`·\`gap-${key}\``;
  if (category === "radius") return `\`rounded-${key}\``;
  return null;
}

const TOKEN_MEANING: Record<string, string> = { "layout.maxWidth": "최대 너비 " };

/** 클래스가 없는 토큰은 임의의 클래스를 만들지 않고 프로젝트 테마의 토큰을 쓰게 한다 */
const classlessSentence = (token: string) =>
  `- \`${token}\`은(는) 프로젝트 테마에 정의된 ${TOKEN_MEANING[token] ?? ""}토큰을 사용한다. 해당 토큰이 없으면 임의의 클래스를 만들지 않고 확인이 필요한 항목으로 보고한다.`;

/**
 * Tailwind 토큰 → 클래스 대응표. 스펙의 디자인 토큰 글과 설계도에서 쓰인 토큰(스타일 속성·gap)을 모아 이름순으로 적는다.
 * 토큰이 없으면 빈 배열
 */
export function tailwindTokenLines(tokensText: string | undefined, nodes: TreeNode[]): string[] {
  const used = nodes.flatMap((n) => [n.layout?.gap ?? "", ...(n.style?.properties.filter((p) => p.isToken).map((p) => p.value) ?? [])]);
  const tokens = [...new Set([...(tokensText?.match(TOKEN_IN_TEXT) ?? []), ...used.filter(Boolean)])].sort();
  if (tokens.length === 0) return [];
  const mapped = tokens.filter((t) => tokenClasses(t));
  const classless = tokens.filter((t) => !tokenClasses(t));
  return [
    "간격 토큰은 기본 간격 단위(4px)를 가정해 같은 숫자의 단계 클래스로 바꿨다. 프로젝트가 간격을 따로 정의했다면 그 값에 맞춘다.",
    ...(mapped.length ? ["", "| 토큰 | Tailwind 클래스 |", "| --- | --- |", ...mapped.map((t) => `| \`${t}\` | ${tokenClasses(t)} |`)] : []),
    ...(classless.length ? ["", ...classless.map(classlessSentence)] : []),
  ];
}

/** 설계도에서 쓰인 토큰: 자식 배치의 gap과 토큰으로 표시된 스타일 값. 이름순, 중복 없음 */
export const usedTokens = (nodes: TreeNode[]): string[] =>
  [...new Set(nodes.flatMap((n) => [n.layout?.gap ?? "", ...(n.style?.properties.filter((p) => p.isToken).map((p) => p.value) ?? [])]).filter(Boolean))].sort();

// 속성 → (클래스 접두사, 토큰 분류). 짝이 맞는 토큰만 클래스로 바꾼다
const PROPERTY_CLASS: Record<string, [prefix: string, category: string]> = {
  color: ["text", "color"],
  "background-color": ["bg", "color"],
  background: ["bg", "color"],
  "border-color": ["border", "color"],
  padding: ["p", "spacing"],
  margin: ["m", "spacing"],
  "border-radius": ["rounded", "radius"],
};

function styleClass(property: string, token: string): string | null {
  const [category, ...rest] = token.split(".");
  const rule = PROPERTY_CLASS[property];
  return rule && rule[1] === category ? `${rule[0]}-${kebab(rest.join("."))}` : null;
}

const SCOPE_NAME = { global: "전역", module: "모듈", utility: "유틸리티" } as const;

/**
 * Tailwind: 노드마다 한 줄. 색·모서리 같은 시각 클래스만 적는다(배치·간격·정렬·반응형·차지 칸은 배치 섹션이 맡아 반복하지 않는다).
 * 클래스로 못 바꾸는 값은 따로 적는다
 */
function tailwindStyleLine(node: TreeNode): string | null {
  const classes: string[] = [];
  const raw: string[] = [];
  const unmapped: string[] = [];
  for (const p of node.style?.properties ?? []) {
    const cls = p.isToken ? styleClass(p.property, p.value) : null;
    if (cls) classes.push(cls);
    else (p.isToken ? unmapped : raw).push(`${p.property}: ${p.value}`);
  }
  const used = classes.filter(Boolean).join(" ");
  const parts = [
    used ? `\`${used}\`` : "",
    raw.length ? `토큰이 아닌 값 ${raw.join(", ")}` : "",
    unmapped.length ? `대응 클래스 없는 토큰 ${unmapped.join(", ")}` : "",
    node.style?.ownsOuterSpacing ? "바깥 여백을 직접 가짐" : "",
  ].filter(Boolean);
  return parts.length ? `- **${node.name}**: ${parts.join(" / ")}` : null;
}

function plainStyleLines(n: TreeNode): string[] {
  const s = n.style;
  if (!s || (s.properties.length === 0 && !s.ownsOuterSpacing)) return [];
  const extra = [s.ownsOuterSpacing ? "바깥 여백을 직접 가짐" : "", s.classPattern ? `클래스 패턴 ${s.classPattern}` : ""].filter(Boolean);
  return [
    `- **${n.name}** (${SCOPE_NAME[s.scope]} 스타일${extra.length ? `, ${extra.join(", ")}` : ""})`,
    ...s.properties.map((p) => `  - ${p.property}: ${p.value} ${p.isToken ? "(토큰)" : "— 토큰이 아닌 값"}`),
  ];
}

/** 스타일 섹션. 트리 순서로 돈다. Tailwind는 '모듈 스타일' 같은 범위 표기 없이 클래스 한 줄 */
export function styleLines(styling: Styling, root: TreeNode): string[] {
  const walk = (n: TreeNode): string[] => [
    ...(styling === "tailwind" ? [tailwindStyleLine(n)].flatMap((l) => (l ? [l] : [])) : plainStyleLines(n)),
    ...n.children.flatMap(walk),
  ];
  return walk(root);
}
