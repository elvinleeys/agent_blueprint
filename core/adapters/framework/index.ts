import type { Blueprint } from "../../schema/blueprint";
import type { Rule } from "../../rules/types";
import { nextRules } from "./next";

/** html·react는 프레임워크 전용 규칙이 없다 */
export const frameworkRules = (framework: Blueprint["stack"]["framework"]): Rule[] => (framework === "next" ? nextRules : []);
