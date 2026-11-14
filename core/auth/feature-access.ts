/**
 * 기능 사용 허용 판단(순수 함수). 서버 라우트와 화면(서버 컴포넌트)이 같은 판단을 쓴다.
 * 기능마다 설정값 두 개(켜짐, 허용 GitHub 계정 id 목록)만 다르다. 새 기능은 FeatureId에 이름을 더하고
 * lib/api/feature-access.ts의 환경변수 표에 한 줄을 더한다. 사용자별 횟수 제한을 넣을 때는 decideAccess만 바꾼다.
 */

/** 허용 판단을 거치는 기능. AI 제안 단계에서 "ai"를 더한다 */
export type FeatureId = "repoCheck";

export type FeatureConfig = { enabled: boolean; allowedGithubIds: ReadonlySet<string> };
/** allowed 허용, disabled 서버 설정으로 꺼짐(모든 사용자), not_allowed 켜져 있지만 허용 목록 밖 */
export type Access = "allowed" | "disabled" | "not_allowed";

/** 환경변수 문자열 → 설정. 켜짐은 정확히 "true"일 때만(빈 값·오타는 꺼짐), 목록은 쉼표로 나눈 숫자 id만 받는다 */
export function parseFeatureConfig(enabledRaw: string | undefined, allowedRaw: string | undefined): FeatureConfig {
  const ids = (allowedRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
  return { enabled: enabledRaw?.trim() === "true", allowedGithubIds: new Set(ids) };
}

/** githubId는 인증 서버가 관리하는 GitHub identity의 숫자 id(사용자가 바꿀 수 있는 user_metadata가 아님). 모르면 null */
export function decideAccess(config: FeatureConfig, githubId: string | null): Access {
  if (!config.enabled) return "disabled";
  return githubId !== null && config.allowedGithubIds.has(githubId) ? "allowed" : "not_allowed";
}
