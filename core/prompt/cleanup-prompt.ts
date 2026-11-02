import type { AnalyzeResult } from "../cleanup/analyze";
import type { CompRef, Finding } from "../cleanup/compare";
import { block, toDocument } from "./export-common";

/** 내보낸 문서의 출처 구분(prompt_exports.source_type과 같은 값). 이번 범위에서는 DB에 저장하지 않는다 */
export const CLEANUP_SOURCE = "cleanup";
export const CLEANUP_FILE_NAME = "design-system-cleanup-prompt.md";

type Of<R extends Finding["rule"]> = Extract<Finding, { rule: R }>;
const pick = <R extends Finding["rule"]>(fs: Finding[], rule: R, severity?: Finding["severity"]) =>
  fs.filter((f): f is Of<R> => f.rule === rule && (!severity || f.severity === severity));

const where = (r: CompRef) => `${r.name}${r.path ? ` (\`${r.path}\`)` : " (공식 스펙 항목)"}`;

/**
 * 디자인 시스템 정리 지시서. 템플릿만 쓰고 AI를 부르지 않아 같은 입력이면 같은 출력이다.
 * 경고(같은 이름의 별도 구현·합치기·나누기)를 정리 대상으로, 정보는 참고로 담는다.
 */
export function buildCleanupPrompt(result: AnalyzeResult): string {
  const { findings, summary } = result;
  const dup = pick(findings, "C-05");
  const merge = pick(findings, "C-02");
  const split = pick(findings, "C-03");
  const mergeWarn = merge.filter((f) => f.severity === "warning");
  const mergeInfo = merge.filter((f) => f.severity === "info");
  const notOfficial = pick(findings, "C-01");

  const lines: string[] = [
    "# 디자인 시스템 정리 지시서",
    "",
    `> 출처: ${CLEANUP_SOURCE} (AgentBlueprint 디자인 시스템 정리). 공식 컴포넌트 ${result.officialCount}개 기준, 비교한 컴포넌트 ${summary.comparedCount}개.`,
    result.specSource === "folder" ? `> 공식 컴포넌트는 \`${result.designSystemFolder}\` 폴더의 내보낸 컴포넌트입니다.` : "> 공식 컴포넌트는 사용자가 입력한 디자인 시스템 스펙(JSON)입니다.",
    "",
    "## 목표",
    "",
    "공식 디자인 시스템 컴포넌트를 기준으로, 아래 정리 대상을 **한 번에 하나씩** 정리합니다. 화면의 동작과 모양은 바뀌지 않아야 합니다.",
    "",
  ];

  const targets: string[] = [];
  let n = 0;
  for (const f of dup) {
    targets.push(
      `### ${++n}. 공식과 같은 이름의 별도 구현: ${f.component.name}`,
      "",
      `- 위치: \`${f.component.path}\``,
      `- 공식: ${f.officialPath ? `\`${f.officialPath}\`` : "디자인 시스템 폴더"}`,
      "- 할 일: 공식 컴포넌트로 대체할 수 있는지 비교한다. 대체할 수 있으면 사용처의 import를 공식 컴포넌트로 바꾸고 별도 구현을 지운다. 공식에 없는 props·variant가 필요하면 지우지 말고 먼저 보고한다.",
      "",
    );
  }
  for (const f of mergeWarn) {
    targets.push(
      `### ${++n}. 공식 컴포넌트와 비슷한 컴포넌트 합치기: ${f.members.map((m) => m.name).join(", ")}`,
      "",
      ...f.members.map((m) => `- ${m.official ? "공식" : "별도"}: ${where(m)}`),
      ...f.evidence.map((e) => `- 근거: ${e}`),
      "- 할 일: 공식 컴포넌트로 합칠 수 있는지 검토한다. 합칠 수 있으면 별도 컴포넌트의 사용처를 공식 컴포넌트로 바꾼다. 차이가 꼭 필요한 것이면 공식 컴포넌트의 variant 추가를 제안한다.",
      "",
    );
  }
  for (const f of split) {
    targets.push(
      `### ${++n}. props가 많은 컴포넌트 나누기: ${f.component.name} (props ${f.propCount}개)`,
      "",
      `- 위치: \`${f.component.path}\``,
      "- 할 일: props를 책임별로 묶을 수 있는지 검토한다. 나눌 수 있으면 하위 컴포넌트로 분리하고 기존 import 경로와 공개 props는 유지한다.",
      "",
    );
  }
  lines.push(...(targets.length ? block(2, "정리 대상", targets) : block(2, "정리 대상", ["정리가 필요한 경고 항목이 없습니다. 참고 항목만 확인합니다."])));

  const notes: string[] = [];
  for (const f of mergeInfo) {
    notes.push(`- 서로 비슷한 컴포넌트(합칠 수 있는지 검토): ${f.members.map(where).join(", ")}`);
  }
  if (notOfficial.length) {
    notes.push(`- 공식 목록에 없는 컴포넌트 ${notOfficial.length}개: ${notOfficial.map((f) => f.component.name).join(", ")}. 화면 전용이면 그대로 두고, 여러 화면에서 쓰이면 공식 목록에 추가할지 제안만 한다.`);
  }
  lines.push(...block(2, "참고(정보)", notes));

  lines.push(
    ...block(2, "필수 규칙", [
      "- 정리 대상을 위에서부터 하나씩 처리하고, 한 항목을 끝낼 때마다 타입 검사·린트·테스트를 실행해 통과를 확인한다.",
      "- 컴포넌트를 바꾸면 그 컴포넌트를 쓰는 모든 곳의 import와 props를 함께 고친다.",
      "- 공식 컴포넌트의 props·variant 이름과 의미는 바꾸지 않는다.",
      "- 판단이 서지 않는 항목은 코드를 바꾸지 말고 이유와 함께 보고한다.",
    ]),
    ...block(2, "금지 사항", [
      "- 정리 대상에 없는 컴포넌트와 파일을 고치지 않는다.",
      "- 공식 컴포넌트 파일을 임의로 수정하지 않는다(필요하면 먼저 제안한다).",
      "- 새 컴포넌트를 임의로 만들지 않는다.",
      "- 화면의 동작·모양을 바꾸는 변경을 하지 않는다.",
    ]),
  );

  const limits: string[] = [`- 이 목록은 코드를 정적으로 읽어 만든 것입니다. 올린 파일 ${result.fileCount}개만 분석했고, \`@/\` 경로 별칭과 \`export … from\` 재내보내기는 따라가지 않았습니다.`];
  if (summary.unresolvedCount) limits.push(`- props를 일부만 읽은 컴포넌트가 ${summary.unresolvedCount}개 있어 props 비교가 부정확할 수 있습니다. 판단 전에 실제 코드를 확인한다.`);
  if (summary.internalCount) limits.push(`- 파일 안에서만 쓰는 컴포넌트 ${summary.internalCount}개는 비교하지 않았습니다.`);
  for (const p of result.partialFiles) limits.push(`- 문법 오류로 일부만 분석된 파일: \`${p.path}\` (${p.errors[0]?.line}줄: ${p.errors[0]?.message})`);
  for (const p of result.failedPaths) limits.push(`- 분석하지 못한 파일: \`${p}\``);
  lines.push(...block(2, "분석 한계", limits));

  return toDocument(lines);
}
