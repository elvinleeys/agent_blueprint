import type { Blueprint } from "../../schema/blueprint";
import type { Rule } from "../../rules/types";
import { cssRules } from "./css";
import { cssModulesRules } from "./css-modules";
import { tailwindRules } from "./tailwind";

const BY_STYLING: Record<Blueprint["stack"]["styling"], Rule[]> = {
  css: cssRules,
  "css-modules": cssModulesRules,
  tailwind: tailwindRules,
};

export const stylingRules = (styling: Blueprint["stack"]["styling"]): Rule[] => BY_STYLING[styling];
