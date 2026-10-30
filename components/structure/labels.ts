import type { ComponentNode } from "../../core/schema/blueprint";

export const KIND_LABEL: Record<ComponentNode["kind"], string> = {
  page: "페이지",
  container: "컨테이너",
  presentational: "표시",
  hook: "훅",
};
