import type { Violation } from "@/core/rules/types";
import type { Blueprint } from "@/core/schema/blueprint";
import type { ExportFormat } from "@/lib/client/run-export";

type Framework = Blueprint["stack"]["framework"];

// 지시서 탭의 고정 안내 문구
export const RULES_FOLDER_NOTE = "화면 규칙 파일은 프로젝트의 .claude/rules/ 폴더에 넣으세요.";
export const COMMON_RULES_NOTE = "새 프로젝트면 공통 규칙은 별도로 정하고, 기존 프로젝트면 기존 CLAUDE.md가 우선입니다.";
export const SKIP_NOTE = "복사와 내려받기는 같은 내용이어도 몇 번이든 할 수 있습니다. 같은 내용이면 건너뛰는 것은 지시서 기록 저장과 새 판 만들기뿐입니다.";
export const SPEC_EMPTY_WARNING = "스펙 항목이 비어 있어 규칙이 적습니다. 스펙을 입력하고 초안을 다시 만들면 규칙이 더 채워집니다.";
export const NO_BLUEPRINT_NOTE = "아직 설계도가 없습니다. 구조 설계 탭에서 초안을 만든 뒤 내보낼 수 있습니다.";
export const ROUTE_ERROR = "화면 주소는 /로 시작하고 공백이 없어야 합니다. 예: /products/[id]";

/** 화면 주소 칸 설명: 스택마다 주소가 쓰이는 곳이 다르다 */
export const ROUTE_HELP: Record<Framework, string> = {
  next: "Next.js에서 페이지 파일 위치를 정하는 데 쓰입니다. 예: /products/[id] 비워 두면 라우팅 파일 위치를 정하지 못한다는 안내가 지시서에 들어갑니다.",
  react: "라우터에 연결할 경로로 쓰입니다. [id]는 :id 형식으로 바뀝니다. 예: /products/[id] → /products/:id 비워 두면 연결할 경로를 정하지 못한다는 안내가 지시서에 들어갑니다.",
  html: "파일 경로를 정할 때 참고만 합니다. 예: /products/detail 비워 두어도 됩니다.",
};

export const DOCUMENT_HINT: Record<ExportFormat, string> = {
  claude_md: "화면 규칙 파일: 이 화면에서 무엇을 만드는지 정한 규칙입니다. .claude/rules/ 폴더에 넣어 두세요.",
  prompt: "지시서: 위 규칙 파일을 참조해 어떻게 구현할지 에이전트에게 지시합니다. 에이전트에게 그대로 붙여 넣으세요.",
};

// 서버의 spec_inputs.route check와 같은 규칙. 빈 값은 허용(주소 없음)
export const isValidRoute = (route: string) => route === "" || /^\/[^\s]{0,199}$/.test(route);

export const unresolvedErrors = (violations: Violation[]) => violations.filter((v) => v.severity === "error");

export function errorConfirmDescription(errors: Violation[]): string {
  const ids = [...new Set(errors.map((v) => v.ruleId))].join(", ");
  return `미해결 오류가 ${errors.length}건 있습니다(${ids}). 그대로 내보내면 지시서의 "구현 전 확인"에 이 오류가 남은 채 포함됩니다. 계속할까요?`;
}
