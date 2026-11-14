import type { Finding } from "@/core/impl-check/result";
import { CONFIRMED_PROBLEM_TEXT } from "@/core/impl-check/confirmed";
import type { CheckResponse, RemovedPair } from "@/lib/client/run-implementation-check";

// 구현 검사 결과 화면의 계산(순수 함수): 구역 나누기, 문구. 화면 컴포넌트는 이 결과를 그리기만 한다.

/** 카드를 구역으로 나눈다: 확실(설계 밖 제외) · 확인 필요 · 설계 밖 발견. 순서는 검사 결과 그대로 */
export function groupFindings(findings: Finding[]) {
  return {
    certain: findings.filter((f) => f.certainty === "certain" && !f.outsideDesign),
    review: findings.filter((f) => f.certainty === "review"),
    outside: findings.filter((f) => f.outsideDesign),
  };
}

export function baselineText(b: CheckResponse["baseline"]): string {
  const base = b.source === "export" ? `설계도 판 ${b.revision} 기준(지시서를 내보낸 판)` : `내보낸 기록이 없어 최신 판 ${b.revision} 기준`;
  return b.newerRevision !== undefined ? `${base}. 이후 판 ${b.newerRevision}가 있습니다.` : base;
}

/** GitHub 저장소에서 읽은 결과: 저장소·브랜치·커밋 앞 7자리·하위 폴더 */
export function repoText(r: NonNullable<CheckResponse["repo"]>): string {
  return [`GitHub ${r.name}`, r.ref.length === 40 ? null : `브랜치 ${r.ref}`, r.commit ? `커밋 ${r.commit.slice(0, 7)}` : null, r.subdir ? `하위 폴더 ${r.subdir}` : null].filter(Boolean).join(" · ");
}

export function designSummaryText(s: CheckResponse["result"]["summary"]): string {
  const d = s.design;
  return `설계 항목 ${d.total}개 중 일치 ${d.match}개 · 불일치 ${d.mismatch}개 · 확인 필요 ${d.review}개`;
}

export function banSummaryText(s: CheckResponse["result"]["summary"]): string {
  return `금지 규칙(인라인 style·바깥 여백): 위반 ${s.ban.violated}개 · 확인 불가 ${s.ban.unknown}개`;
}

export function configText(c: CheckResponse["meta"]["configs"]): string {
  return `설정 파일 ${c.read}개 읽음 / 못 따라간 설정 ${c.unsupported}개${c.unsupported > 0 ? "(그 설정에 기대는 import는 해석하지 못해 확인 필요로 보냄)" : ""}`;
}

/** 자동으로 뺀 확정 짝을 사용자에게 알리는 문장(노드 이름은 이전 결과에서 찾고 없으면 id) */
export function removedTexts(removed: RemovedPair[], nameOf: (nodeId: string) => string): string[] {
  return removed.map((r) => `${nameOf(r.nodeId)}: ${CONFIRMED_PROBLEM_TEXT[r.reason as keyof typeof CONFIRMED_PROBLEM_TEXT] ?? r.reason}`);
}

/** 후보 한 건의 "다른 노드의 1순위이기도 함" 문구 */
export const contestedText = (by: string[] | undefined): string | null => (by?.length ? `다른 노드(${by.join(", ")})의 1순위 후보이기도 함` : null);
