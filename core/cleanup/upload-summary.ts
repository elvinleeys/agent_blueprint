import { checkLimits, filterFiles, type FileEntry, type FilterOptions, type LimitProblem, type RejectReason } from "../code-model/filter-files";

export type UploadSummary<T extends FileEntry> = {
  /** 고른 파일 전체 수 */
  total: number;
  /** 거른 뒤 분석 대상(체크 해제 전) */
  accepted: T[];
  rejected: { entry: T; reason: RejectReason }[];
  /** 분석 대상 중 체크가 해제되지 않은 것 = 실제로 보낼 파일 */
  selected: T[];
  /** 보낼 파일이 상한을 넘으면 문제가 있다(있으면 보내지 않는다) */
  problems: LimitProblem[];
  rejectedByReason: Partial<Record<RejectReason, number>>;
};

/** 업로드 화면의 상태 계산(순수 함수): 거르기 → 체크 해제 반영 → 상한 검사. 상한은 체크한 파일 기준으로 센다 */
export function summarizeUpload<T extends FileEntry>(entries: T[], unchecked: ReadonlySet<string>, options: FilterOptions = {}): UploadSummary<T> {
  const { accepted, rejected } = filterFiles(entries, options);
  const selected = accepted.filter((e) => !unchecked.has(e.path));
  const rejectedByReason: UploadSummary<T>["rejectedByReason"] = {};
  for (const r of rejected) rejectedByReason[r.reason] = (rejectedByReason[r.reason] ?? 0) + 1;
  return { total: entries.length, accepted, rejected, selected, problems: checkLimits(selected), rejectedByReason };
}

export const REJECT_LABEL: Record<RejectReason, string> = {
  "excluded-dir": "제외 폴더(node_modules·.next·dist·build·coverage·.git)",
  "not-source": ".ts·.tsx가 아닌 파일",
  declaration: "선언 파일(.d.ts)",
  "test-or-story": "테스트·스토리 파일",
};
