/** 업로드 전에 브라우저에서 거르는 규칙(순수 함수). 입력은 경로와 크기만 본다 */
export const EXCLUDED_DIRS = ["node_modules", ".next", "dist", "build", "coverage", ".git"];

/** 보내는 파일 수·크기 상한. .ts 파일도 같은 기준으로 센다 */
export const UPLOAD_LIMITS = { maxFiles: 30, maxFileBytes: 200 * 1024, maxTotalBytes: 1024 * 1024 };

export type FileEntry = { path: string; size: number };
export type RejectReason = "excluded-dir" | "not-source" | "declaration" | "test-or-story";
export type FilterResult<T extends FileEntry> = { accepted: T[]; rejected: { entry: T; reason: RejectReason }[] };

const NORMALIZE = (p: string) => p.replace(/\\/g, "/");

function reasonToReject(path: string): RejectReason | null {
  const p = NORMALIZE(path);
  if (p.split("/").slice(0, -1).some((seg) => EXCLUDED_DIRS.includes(seg))) return "excluded-dir";
  if (!/\.tsx?$/.test(p)) return "not-source";
  if (/\.d\.ts$/.test(p)) return "declaration";
  if (/\.(test|spec|stories)\.tsx?$/.test(p)) return "test-or-story";
  return null;
}

/** .tsx(컴포넌트)와 .ts(타입을 찾는 데만 쓰임)를 남기고 나머지를 거른다. 거른 이유를 함께 돌려준다 */
export function filterFiles<T extends FileEntry>(entries: T[]): FilterResult<T> {
  const accepted: T[] = [];
  const rejected: FilterResult<T>["rejected"] = [];
  for (const entry of entries) {
    const reason = reasonToReject(entry.path);
    if (reason) rejected.push({ entry, reason });
    else accepted.push(entry);
  }
  return { accepted, rejected };
}

export type LimitProblem = { kind: "too-many-files" | "file-too-large" | "total-too-large"; paths?: string[] };

export const NARROWER_FOLDER_HINT = "더 좁은 폴더(예: src/components/ui)를 선택하세요.";

/** 상한 문제를 사용자용 문장으로. 화면과 서버가 같은 문구를 쓴다 */
export function describeLimitProblems(problems: LimitProblem[], limits = UPLOAD_LIMITS): string {
  if (!problems.length) return "";
  const text: Record<LimitProblem["kind"], string> = {
    "too-many-files": `파일이 ${limits.maxFiles}개를 넘습니다.`,
    "file-too-large": `파일 하나가 ${limits.maxFileBytes / 1024}KB를 넘습니다.`,
    "total-too-large": `파일 합계가 ${limits.maxTotalBytes / (1024 * 1024)}MB를 넘습니다.`,
  };
  return `${problems.map((p) => text[p.kind]).join(" ")} ${NARROWER_FOLDER_HINT}`;
}

/** 보내기 전 상한 검사. 문제가 하나라도 있으면 보내지 않는다 */
export function checkLimits(entries: FileEntry[], limits = UPLOAD_LIMITS): LimitProblem[] {
  const problems: LimitProblem[] = [];
  if (entries.length > limits.maxFiles) problems.push({ kind: "too-many-files" });
  const large = entries.filter((e) => e.size > limits.maxFileBytes).map((e) => e.path);
  if (large.length) problems.push({ kind: "file-too-large", paths: large });
  if (entries.reduce((sum, e) => sum + e.size, 0) > limits.maxTotalBytes) problems.push({ kind: "total-too-large" });
  return problems;
}
