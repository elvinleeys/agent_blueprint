import { readCodeModel } from "../code-model/facts";
import { CONFIG_FILE, checkLimits, filterFiles, type LimitProblem } from "../code-model/filter-files";
import type { SourceFile } from "../code-model/types";
import type { Blueprint } from "../schema/blueprint";
import { configSummary } from "./config-summary";
import { checkImplementation } from "./run";
import { selectByBlueprint } from "./select-files";

/**
 * 구현 검사 채점(화면 없이, 지시서 효과 측정용. 순수 함수). 판정은 checkImplementation을 그대로 쓰고 숫자만 모은다.
 * 거르기 규칙은 업로드와 같고(filterFiles), 상한은 내 컴퓨터용(LOCAL_LIMITS)이다. 서버 상한(UPLOAD_LIMITS)은 서버 보호용이라 쓰지 않는다.
 */

/** 내 컴퓨터용 상한 기본값. 스크립트 옵션(--max-files·--max-file-kb·--max-total-mb)으로 바꾼다 */
export const LOCAL_LIMITS = { maxFiles: 1000, maxFileBytes: 1024 * 1024, maxTotalBytes: 20 * 1024 * 1024 };
export type ScoreLimits = typeof LOCAL_LIMITS;

/** blueprint-locations: 설계도 위치 기준으로 골라 읽음(기본), all: 코드 폴더 전체 */
export type ScoreMode = "blueprint-locations" | "all";

export type ScoreReport = {
  title: string;
  stack: Blueprint["stack"];
  mode: ScoreMode;
  /** 분석한 파일 수(설정 파일 포함, 화면의 "파일 N개"와 같은 기준) */
  files: number;
  /** 거르기를 통과한 폴더의 대상 파일 수 */
  scanned: number;
  configs: { read: number; unsupported: number };
  design: { total: number; match: number; mismatch: number; review: number };
  ban: { violated: number; unknown: number };
  outsideDesign: { count: number; messages: string[] };
  cards: { certain: number; review: number };
};

export type ScoreOutcome = { ok: true; report: ScoreReport } | { ok: false; message: string };

const byteLength = (s: string) => new TextEncoder().encode(s).length;

const LIMIT_TEXT: Record<LimitProblem["kind"], (n: number, l: ScoreLimits) => string> = {
  "too-many-files": (n, l) => `파일 ${n.toLocaleString("en-US")}개(상한 ${l.maxFiles}개, --max-files)`,
  "file-too-large": (_, l) => `파일 하나가 ${l.maxFileBytes / 1024}KB를 넘음(--max-file-kb)`,
  "total-too-large": (_, l) => `합계가 ${l.maxTotalBytes / (1024 * 1024)}MB를 넘음(--max-total-mb)`,
};

export function scoreImplementation(blueprint: Blueprint, input: SourceFile[], mode: ScoreMode = "blueprint-locations", limits: ScoreLimits = LOCAL_LIMITS): ScoreOutcome {
  if (blueprint.stack.framework === "html") return { ok: false, message: "HTML 프로젝트는 구현 검사를 지원하지 않습니다." };
  const scanned = filterFiles(input.map((f) => ({ ...f, size: byteLength(f.content) })), { allowConfigFiles: true }).accepted;
  const picked = mode === "all" ? scanned : selectByBlueprint(blueprint, scanned);

  const problems = checkLimits(picked, limits);
  if (problems.length) {
    const tail = mode === "all" ? "옵션으로 상한을 올리거나, --all 없이 설계도 위치 기준으로 읽어 보세요." : "옵션으로 상한을 올려 주세요.";
    return { ok: false, message: `분석할 파일이 상한을 넘습니다: ${problems.map((p) => LIMIT_TEXT[p.kind](picked.length, limits)).join(", ")}.\n${tail}` };
  }
  if (!picked.some((f) => !CONFIG_FILE.test(f.path))) {
    const where = mode === "all" ? "" : " 설계도 위치에서 찾은 파일이 없으면 --all로 폴더 전체를 읽어 보세요.";
    return { ok: false, message: `검사할 코드: 분석할 .ts·.tsx 파일이 없습니다.${where}` };
  }

  const files = picked.map(({ path, content }) => ({ path, content }));
  const model = readCodeModel(files);
  const { findings, summary } = checkImplementation(blueprint, model);
  const outside = findings.filter((f) => f.outsideDesign);
  return {
    ok: true,
    report: {
      title: blueprint.title,
      stack: blueprint.stack,
      mode,
      files: files.length,
      scanned: scanned.length,
      configs: configSummary(files, model),
      design: summary.design,
      ban: summary.ban,
      // 같은 이름이 여러 파일에 있어도 구분되게 근거(파일 경로)를 붙인다
      outsideDesign: { count: outside.length, messages: outside.map((f) => [f.message, ...f.evidence].join(" — ")) },
      cards: { certain: findings.filter((f) => f.certainty === "certain" && !f.outsideDesign).length, review: findings.filter((f) => f.certainty === "review").length },
    },
  };
}

/** GitHub 저장소에서 읽었을 때: 같은 커밋으로 다시 채점해 결과를 재현할 수 있게 출력에 적는다 */
export type RepoInfo = { name: string; ref: string; commit: string | null; subdir: string | null };

const repoLine = (repo: RepoInfo) => `저장소: ${repo.name}${repo.subdir ? `/${repo.subdir}` : ""} @ ${repo.ref}${repo.commit ? ` (커밋 ${repo.commit.slice(0, 7)})` : ""}`;

/** --json 출력: 결과를 여러 개 모아 비교할 수 있게 한 줄 JSON */
export function scoreJson(r: ScoreReport, blueprintFile: string, codeSource: string, repo?: RepoInfo): string {
  return JSON.stringify({
    blueprint: { file: blueprintFile, title: r.title, stack: r.stack },
    code: { source: codeSource, mode: r.mode, files: r.files, scanned: r.scanned, configs: r.configs, ...(repo ? { repo } : {}) },
    design: r.design,
    ban: r.ban,
    outsideDesign: r.outsideDesign,
    cards: r.cards,
  });
}

/** 사람이 읽는 출력. 집계 문구는 화면(result-view)과 같은 형식이다 */
export function scoreText(r: ScoreReport, codeName: string, repo?: RepoInfo): string {
  const d = r.design;
  const mode =
    r.mode === "all"
      ? "읽은 방식: 코드 폴더 전체(--all)"
      : '읽은 방식: 설계도 위치 기준으로 읽음(노드 위치 + 가져오는 파일 + 화면 진입 파일). 위치 밖에서 가져오지 않는 "설계에 없는 컴포넌트"는 찾지 못합니다. 전체를 보려면 --all';
  return [
    `구현 검사 채점: ${r.title} (${r.stack.framework} · ${r.stack.styling} · ${r.stack.architecture})`,
    ...(repo ? [repoLine(repo)] : []),
    `코드: ${codeName} (${r.files}개 분석 / 폴더의 대상 파일 ${r.scanned}개, 설정 파일 ${r.configs.read}개 읽음 / 못 따라간 설정 ${r.configs.unsupported}개)`,
    mode,
    "",
    `설계 준수   설계 항목 ${d.total}개 중 일치 ${d.match}개 · 불일치 ${d.mismatch}개 · 확인 필요 ${d.review}개`,
    `금지 규칙   위반 ${r.ban.violated}개 · 확인 불가 ${r.ban.unknown}개`,
    `설계 밖     ${r.outsideDesign.count}건`,
    ...r.outsideDesign.messages.map((m) => `  - ${m}`),
    `결과 카드   확실 ${r.cards.certain}장 · 확인 필요 ${r.cards.review}장`,
    "",
  ].join("\n");
}
