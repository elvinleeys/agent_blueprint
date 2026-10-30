import type { Blueprint } from "../../schema/blueprint";
import type { Rule } from "../../rules/types";
import { fsdRules } from "./fsd";

/** type-based·feature-based는 계층 규칙이 없다 */
export const architectureRules = (architecture: Blueprint["stack"]["architecture"]): Rule[] => (architecture === "fsd" ? fsdRules : []);
