import type { ComponentNode } from "@/core/schema/blueprint";
import { KIND_LABEL } from "../labels";
import type { Option } from "./controls";

/**
 * 종류 선택 상자의 항목. 페이지는 화면 단위 최상위라 루트에서만 고를 수 있다.
 * 루트가 아닌데 이미 페이지인 노드(AI 초안)는 현재 값을 보이려고 항목을 남기되 고를 수 없게 막는다.
 */
export function kindOptions(node: Pick<ComponentNode, "kind" | "parentId">): Option[] {
  const isRoot = node.parentId === null;
  const options: Option[] = [];
  if (isRoot || node.kind === "page") options.push({ value: "page", label: KIND_LABEL.page, disabled: !isRoot });
  options.push({ value: "container", label: KIND_LABEL.container }, { value: "presentational", label: KIND_LABEL.presentational });
  return options;
}
