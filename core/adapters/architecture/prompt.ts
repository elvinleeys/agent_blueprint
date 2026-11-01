import type { Blueprint, ComponentNode } from "../../schema/blueprint";
import type { TreeNode } from "../../schema/tree";

type Stack = Blueprint["stack"];

export const ARCHITECTURE_NAME: Record<Stack["architecture"], string> = { "type-based": "유형 중심", "feature-based": "기능 중심", fsd: "FSD" };

const isNextFsd = (s: Stack) => s.framework === "next" && s.architecture === "fsd";

/** 필수 규칙 안의 스택 규칙 */
export function architectureGuide(architecture: Stack["architecture"]): string[] {
  if (architecture !== "fsd") return ["파일은 컴포넌트 구조의 파일 위치대로 둔다."];
  return [
    "FSD 계층은 app > pages > widgets > features > entities > shared 순이다. 아래 계층이 위 계층을 가져오지 않는다.",
    "같은 계층의 다른 슬라이스를 가져오지 않는다. 슬라이스는 `ui`·`model`·`api`·`lib`·`config` 세그먼트로 나눈다.",
  ];
}

const extension = (stack: Stack, node: ComponentNode) => (stack.framework === "html" ? ".html" : node.kind === "hook" ? ".ts" : ".tsx");

/** 노드의 파일 경로. Next.js + FSD는 FSD 계층이 src 아래에 있다 */
export const nodePath = (stack: Stack, node: ComponentNode) => `${isNextFsd(stack) ? "src/" : ""}${node.location.dir}/${node.name}${extension(stack, node)}`;

/** 화면 주소를 app 아래 경로로. 빈 값이면 null, "/"는 루트(app/page.tsx) */
function routingFile(route: string | null): string | null {
  const trimmed = route?.trim();
  if (!trimmed) return null;
  const path = trimmed.replace(/^\/+|\/+$/g, "");
  return path === "" ? "app/page.tsx" : `app/${path}/page.tsx`;
}

// 규칙 파일의 paths는 glob이라 라우트의 [id]를 그대로 쓰면 글자 모임으로 읽힌다. 동적 구간은 *로 바꾼다
const toGlob = (path: string) => path.replace(/\[\[\.\.\.[^\]]+\]\]|\[\.\.\.[^\]]+\]/g, "**").replace(/\[[^\]]+\]/g, "*");

/**
 * 화면 규칙 파일(.claude/rules)의 paths 머리말 값. FSD는 노드들의 슬라이스 폴더(Next.js + FSD는 src/ 기준),
 * 유형·기능 중심은 노드의 파일 경로를 하나씩, Next.js는 라우팅 파일도 넣는다.
 * 같은 값은 한 번만, 정렬해서 입력이 같으면 항상 같은 목록이 된다
 */
export function rulePaths(stack: Stack, route: string | null, nodes: ComponentNode[]): string[] {
  const prefix = isNextFsd(stack) ? "src/" : "";
  const routing = stack.framework === "next" ? routingFile(route) : null;
  // FSD는 슬라이스 폴더가 이 화면의 것이라 폴더 단위. 유형·기능 중심은 components·hooks 같은 공용 폴더라
  // 폴더째 적으면 다른 화면 작업에도 규칙이 적용되므로 노드의 파일 경로를 하나씩 적는다
  const scopes = nodes.map((n) => (stack.architecture === "fsd" ? `${prefix}${n.location.dir}/**` : nodePath(stack, n)));
  return [...new Set([...scopes, ...(routing ? [toGlob(routing)] : [])])].sort();
}

const FSD_BOTTOM_UP = ["shared", "entities", "features", "widgets", "pages", "app"];
const postOrder = (n: TreeNode): TreeNode[] => [...n.children.flatMap(postOrder), n];

/**
 * 구현 순서. 가져오는 쪽보다 가져와지는 쪽을 먼저 만든다.
 * FSD는 아래 계층부터(shared → entities → features → widgets → pages → app), 같은 계층 안에서는 트리의 말단부터.
 * 그 외는 트리의 말단부터 부모 순서. Next.js는 마지막에 라우팅 파일(화면 주소가 있을 때)
 */
export function implementationOrder(stack: Stack, route: string | null, root: TreeNode): string[] {
  const nodes = postOrder(root);
  const rank = (n: TreeNode) => FSD_BOTTOM_UP.indexOf(n.location.dir.split("/")[0]);
  const ordered = stack.architecture === "fsd" ? nodes.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).map(({ n }) => n) : nodes;
  const steps = ordered.map((n) => `\`${n.name}\` — \`${nodePath(stack, n)}\``);
  if (stack.framework === "next") {
    const file = routingFile(route);
    steps.push(file ? `라우팅 파일 — \`${file}\`` : "라우팅 파일 — 화면 주소가 정해진 뒤 만든다");
  }
  return steps.map((s, i) => `${i + 1}. ${s}`);
}

/** 파일 위치 섹션. nodes는 트리 순서 */
export function locationLines(stack: Stack, route: string | null, root: TreeNode, nodes: ComponentNode[]): string[] {
  const lines: string[] = [];
  if (stack.framework === "next") {
    const file = routingFile(route);
    if (!file) {
      lines.push("- 화면 주소가 비어 있어 라우팅 파일(`app/…/page.tsx`)의 위치를 정할 수 없다. 화면 주소를 정한 뒤 라우팅 파일을 만든다.");
    } else if (isNextFsd(stack)) {
      const slice = /^pages\/([^/]+)\//.exec(root.location.dir)?.[1];
      const target = slice ? `\`src/pages/${slice}\`의 ${root.name}` : `${root.name}`;
      lines.push(`- 라우팅 파일 \`${file}\`은 FSD 페이지(${target})를 가져와 내보내기만 한다. 다른 로직·마크업을 두지 않는다.`);
    } else {
      lines.push(`- 라우팅 파일 \`${file}\`이 ${root.name}을 렌더링한다.`);
    }
  }
  if (isNextFsd(stack)) {
    lines.push(
      "- 라우팅용 `app/` 폴더는 프로젝트 루트에 둔다.",
      "- FSD 계층(app·pages·widgets·features·entities·shared)은 `src/` 아래에 둔다.",
      "- 프로젝트 루트에 빈 `pages/` 폴더를 둔다. Next.js가 `src/pages`를 Pages Router로 인식하지 않게 한다. 기존 프로젝트면 먼저 라우터 구성(App Router 여부, 기존 `pages/` 폴더)을 확인하고, 충돌하면 임의로 고치지 말고 보고한다. 대안으로 FSD의 pages 계층 이름을 `views`로 바꾸는 방법이 있다(보고 후 결정한다).",
      "- import 별칭은 `@/*` → `./src/*`로 설정한다.",
      "- 미들웨어(프록시) 파일은 프로젝트 루트에 둔다.",
    );
  }
  lines.push("", ...nodes.map((n) => `- ${n.name}: \`${nodePath(stack, n)}\``));
  return lines;
}
