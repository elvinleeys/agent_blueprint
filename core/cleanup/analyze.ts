import { compareDesignSystem, type CompareSummary, type Finding } from "./compare";
import { extractComponents } from "./extract";
import { inferComponents, parseSpecJson, type InferWarning } from "./infer-spec";
import type { OfficialComponent, PartialFile, SourceFile } from "./types";

/** 공식 스펙을 얻는 방법: JSON 직접 입력, 또는 디자인 시스템으로 올린 파일의 내보낸 컴포넌트 */
export type SpecSource = { kind: "json"; text: string } | { kind: "files"; files: SourceFile[] };

export type AnalyzeInput = {
  /** 검사할 코드 */
  code: SourceFile[];
  designSystem: SpecSource;
};

export type AnalyzeResult = {
  specSource: SpecSource["kind"];
  officialCount: number;
  codeFileCount: number;
  designSystemFileCount: number;
  /** 디자인 시스템 파일과 같은 파일(내용이 같고 경로 끝이 이어짐)이라 코드 쪽에서 뺀 파일 수(같은 폴더를 두 칸에 올린 경우) */
  sameAsDesignSystemCount: number;
  findings: Finding[];
  summary: CompareSummary;
  /** 디자인 시스템 파일로 스펙을 만들 때 버린 값(형식이 맞지 않는 variant, 중복 이름) */
  inferWarnings: InferWarning[];
  /** 문법 오류로 일부만 분석된 파일(디자인 시스템 파일과 코드 모두) */
  partialFiles: PartialFile[];
  /** 분석 중 예외로 건너뛴 파일 */
  failedPaths: string[];
};

export type AnalyzeOutcome =
  | { ok: true; result: AnalyzeResult }
  | { ok: false; reason: "spec_invalid" | "no_official"; message: string; details: string[] };

const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");

/** 한 경로가 다른 경로의 끝부분(폴더 경계 기준)이거나 같은가. 업로드 경로는 선택한 폴더 이름부터 시작해 서로 앞부분이 다를 수 있다 */
function pathsOverlap(a: string, b: string): boolean {
  const [x, y] = [norm(a), norm(b)];
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
}

/**
 * 분석 전체의 순수 함수: 검사할 코드 + 디자인 시스템(JSON 또는 파일) → 비교 결과.
 * 입력 방식(업로드·GitHub)과 무관하다. 파일은 이미 거르고 상한을 검사한 것으로 본다.
 * 두 파일 묶음은 서로 다른 저장소일 수 있어 따로 분석한다(경로가 겹쳐도 섞이지 않는다).
 */
export function analyzeCode(input: AnalyzeInput): AnalyzeOutcome {
  const { designSystem } = input;
  let official: OfficialComponent[];
  let inferWarnings: InferWarning[] = [];
  let partialFiles: PartialFile[] = [];
  let failedPaths: string[] = [];
  let code = input.code;
  let sameAsDesignSystemCount = 0;
  let designSystemFileCount = 0;

  if (designSystem.kind === "json") {
    const parsed = parseSpecJson(designSystem.text);
    if (!parsed.ok) return { ok: false, reason: "spec_invalid", message: "디자인 시스템 스펙 JSON이 올바르지 않습니다.", details: parsed.errors };
    official = parsed.spec.components;
  } else {
    const ds = extractComponents(designSystem.files);
    const inferred = inferComponents(ds.components);
    if (inferred.used === 0) {
      return { ok: false, reason: "no_official", message: "디자인 시스템 파일에서 내보낸 컴포넌트를 찾지 못했습니다. 올린 파일을 확인해 주세요.", details: ds.partialFiles.map((p) => `${p.path}: ${p.errors[0]?.message ?? ""}`) };
    }
    official = inferred.official;
    inferWarnings = inferred.warnings;
    partialFiles = ds.partialFiles;
    failedPaths = ds.failedPaths;
    designSystemFileCount = designSystem.files.length;
    // 같은 폴더를 두 칸에 모두 올리면 디자인 시스템 컴포넌트가 "같은 이름의 별도 구현"으로 잡히므로 같은 파일은 코드 쪽에서 뺀다.
    // 내용이 같고 경로 끝이 이어지는 경우만 같은 파일로 본다(다른 위치에 복사해 둔 같은 내용의 파일은 별도 구현으로 남긴다)
    code = input.code.filter((f) => !designSystem.files.some((d) => d.content === f.content && pathsOverlap(d.path, f.path)));
    sameAsDesignSystemCount = input.code.length - code.length;
  }

  const target = extractComponents(code);
  const { findings, summary } = compareDesignSystem({ official, analyzed: target.components, officialFromFiles: designSystem.kind === "files" });
  return {
    ok: true,
    result: {
      specSource: designSystem.kind,
      officialCount: official.length,
      codeFileCount: code.length,
      designSystemFileCount,
      sameAsDesignSystemCount,
      findings,
      summary,
      inferWarnings,
      partialFiles: [...partialFiles, ...target.partialFiles],
      failedPaths: [...failedPaths, ...target.failedPaths],
    },
  };
}
