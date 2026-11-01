import { prepare, type ExportInput } from "./export-common";
import { buildRuleFile } from "./rule-file";
import { buildTaskPrompt } from "./task-prompt";

export { exportFileName, FORMAT_LABEL, ruleFilePath, type ExportFormat, type ExportInput, type ExportSpec } from "./export-common";

/**
 * 설계도를 두 가지 문서로 바꾼다. 템플릿만 쓰고 시간·난수·AI 호출이 없어 같은 입력이면 항상 같은 문자열이다.
 * - claude_md: 화면 규칙 파일(.claude/rules/<화면>.md). "무엇을" 만드는가
 * - prompt: 지시서. 그 규칙 파일을 참조해 "어떻게" 만드는가
 */
export function buildExportPrompt(input: ExportInput): string {
  const prepared = prepare(input);
  return input.format === "claude_md" ? buildRuleFile(prepared) : buildTaskPrompt(prepared);
}
