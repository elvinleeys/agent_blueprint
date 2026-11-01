import type { Violation } from "../rules/types";
import type { Blueprint } from "../schema/blueprint";
import type { SpecInput } from "../schema/spec-input";
import { buildTree, type TreeNode } from "../schema/tree";

/** prompt: 지시서("어떻게"). claude_md: 화면 규칙 파일("무엇을", DB 값은 이전 이름 그대로) */
export type ExportFormat = "prompt" | "claude_md";

export type ExportSpec = Partial<Pick<SpecInput, "overview" | "tokens" | "layout" | "componentRules" | "stateData" | "accessibility" | "constraints">>;

export type ExportInput = {
  blueprint: Blueprint;
  spec: ExportSpec;
  /** 화면 주소. 비어 있으면 라우팅 파일 위치를 정할 수 없다는 안내가 들어간다 */
  route: string | null;
  violations: Violation[];
  format: ExportFormat;
};

export const FORMAT_LABEL: Record<ExportFormat, string> = { prompt: "지시서", claude_md: "화면 규칙 파일(.claude/rules)" };

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** 루트 노드 이름의 kebab-case(끝의 Page 제외) */
function screenName(bp: Blueprint): string {
  const root = bp.nodes.find((n) => n.parentId === null);
  return kebab((root?.name ?? "screen").replace(/Page$/, "")) || "screen";
}

/** 화면 규칙 파일의 프로젝트 안 경로. 지시서가 이 경로를 가리킨다 */
export const ruleFilePath = (bp: Blueprint) => `.claude/rules/${screenName(bp)}.md`;

/** 내려받기 파일 이름: 화면 규칙 파일은 product-detail.md, 지시서는 product-detail-prompt.md */
export const exportFileName = (bp: Blueprint, format: ExportFormat) => `${screenName(bp)}${format === "prompt" ? "-prompt" : ""}.md`;

export type Flat = { n: TreeNode; depth: number };
export type Prepared = { input: ExportInput; root: TreeNode; flat: Flat[]; nodes: TreeNode[] };

const flatten = (n: TreeNode, depth = 0): Flat[] => [{ n, depth }, ...n.children.flatMap((c) => flatten(c, depth + 1))];

/** 트리와 순서를 한 번 계산한다. 같은 입력이면 같은 결과(노드는 order로 정렬) */
export function prepare(input: ExportInput): Prepared {
  const root = buildTree(input.blueprint.nodes);
  if (!root) throw new Error("루트가 하나인 설계도만 지시서로 만들 수 있습니다.");
  const flat = flatten(root);
  return { input, root, flat, nodes: flat.map((f) => f.n) };
}

export const text = (s: string | undefined | null) => s?.trim() ?? "";

/** 내용이 없으면 섹션 전체를 생략한다 */
export function block(level: 2 | 3, title: string, body: string[]): string[] {
  return body.length ? [`${"#".repeat(level)} ${title}`, "", ...body, ""] : [];
}

/** 줄 목록을 문서로: 빈 줄 3개 이상은 2개로 줄이고 끝에 줄바꿈 하나 */
export const toDocument = (lines: string[]) => `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
