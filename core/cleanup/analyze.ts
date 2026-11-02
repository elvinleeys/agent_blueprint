import { compareDesignSystem, type CompareSummary, type Finding } from "./compare";
import { extractComponents } from "./extract";
import { inferComponents, parseSpecJson, type InferWarning } from "./infer-spec";
import type { OfficialComponent, PartialFile, SourceFile } from "./types";

/** 공식 스펙을 얻는 방법: JSON 직접 입력, 또는 디자인 시스템 폴더의 컴포넌트로 자동 생성 */
export type SpecSource = { kind: "json"; text: string } | { kind: "folder"; folder: string };

export type AnalyzeResult = {
  specSource: "json" | "folder";
  designSystemFolder: string | null;
  officialCount: number;
  fileCount: number;
  findings: Finding[];
  summary: CompareSummary;
  /** 폴더로 스펙을 만들 때 버린 값(형식이 맞지 않는 variant, 중복 이름) */
  inferWarnings: InferWarning[];
  /** 문법 오류로 일부만 분석된 파일 */
  partialFiles: PartialFile[];
  /** 분석 중 예외로 건너뛴 파일 */
  failedPaths: string[];
};

export type AnalyzeOutcome =
  | { ok: true; result: AnalyzeResult }
  | { ok: false; reason: "spec_invalid" | "no_official"; message: string; details: string[] };

/**
 * 분석 전체의 순수 함수: 파일 목록 + 스펙 얻는 방법 → 비교 결과.
 * 입력 방식(업로드·GitHub)과 무관하다. 파일은 이미 거르고 상한을 검사한 것으로 본다.
 */
export function analyzeFiles(files: SourceFile[], spec: SpecSource): AnalyzeOutcome {
  const { components, failedPaths, partialFiles } = extractComponents(files);

  let official: OfficialComponent[];
  let inferWarnings: InferWarning[] = [];
  let designSystemFolder: string | undefined;
  if (spec.kind === "json") {
    const parsed = parseSpecJson(spec.text);
    if (!parsed.ok) return { ok: false, reason: "spec_invalid", message: "디자인 시스템 스펙 JSON이 올바르지 않습니다.", details: parsed.errors };
    official = parsed.spec.components;
  } else {
    const inferred = inferComponents(components, spec.folder);
    if (inferred.used === 0) {
      return { ok: false, reason: "no_official", message: `"${spec.folder}" 폴더에서 내보낸 컴포넌트를 찾지 못했습니다. 폴더 경로를 확인해 주세요.`, details: [] };
    }
    official = inferred.official;
    inferWarnings = inferred.warnings;
    designSystemFolder = spec.folder;
  }

  const { findings, summary } = compareDesignSystem({ official, analyzed: components, designSystemFolder });
  return {
    ok: true,
    result: { specSource: spec.kind, designSystemFolder: designSystemFolder ?? null, officialCount: official.length, fileCount: files.length, findings, summary, inferWarnings, partialFiles, failedPaths },
  };
}
