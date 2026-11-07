// 테스트 전용: fixtures/implementation-check의 묶음을 읽는다(node:fs 사용, 앱 코드에서 import 금지)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BlueprintSchema, type Blueprint } from "../schema/blueprint";
import type { SourceFile } from "../cleanup/types";

export const FIXTURE_ROOT = join(process.cwd(), "fixtures", "implementation-check");

export type ExpectedCertain = { rule: string; severity: "error" | "warning" | "info"; node: string };
export type ExpectedReview = { rule: string; kind: "pair" | "state" | "prop" | "style" | "fetch" | "router" | "import" | "unreadable" | "fetch-kind"; node: string; design?: string; candidate?: string; via?: string };
/** 판정과 별개로 분석기가 읽어야 하는 값(코드 모델 단위 시험용). 없는 키는 검사하지 않는다 */
export type ExpectedFacts = {
  /** 노드 이름 → 서버 통신 유형 */
  fetch?: Record<string, "READ" | "WRITE" | "UNKNOWN">;
  /** 노드 이름 → 클래스 → 분류 */
  classes?: Record<string, Record<string, "ALWAYS" | "CONDITIONAL" | "DYNAMIC" | "ABSENT">>;
  /** 공통 형식으로 바꾼 화면 주소(/products/:id) */
  routes?: string[];
  /** import 문자열 → 해석된 파일(못 풀면 null) */
  imports?: Record<string, string | null>;
};
export type ExpectedCase = { blueprint?: string; certain: ExpectedCertain[]; needsReview: ExpectedReview[]; facts?: ExpectedFacts };
export type Expected = { bundle: string; blueprint: string; cases: Record<string, ExpectedCase> };

const walk = (dir: string, base = dir): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).replaceAll("\\", "/")]));

export const readExpected = (bundle: string): Expected => JSON.parse(readFileSync(join(FIXTURE_ROOT, bundle, "expected.json"), "utf8"));

export const listCaseDirs = (bundle: string): string[] =>
  readdirSync(join(FIXTURE_ROOT, bundle), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

/** 사례의 설계도(사례가 지정한 파일, 없으면 묶음 기본) */
export function loadBlueprint(bundle: string, caseName: string): Blueprint {
  const exp = readExpected(bundle);
  const file = exp.cases[caseName]?.blueprint ?? exp.blueprint;
  return BlueprintSchema.parse(JSON.parse(readFileSync(join(FIXTURE_ROOT, bundle, file), "utf8")));
}

/** correct 위에 사례 폴더의 파일을 덮어쓴 코드. `X.deleted`는 X를 지운다. `.d.ts`는 분석 대상이 아니라 제외하지 않고 그대로 둔다 */
export function loadCode(bundle: string, caseName: string): SourceFile[] {
  const files = new Map<string, string>();
  const correct = join(FIXTURE_ROOT, bundle, "correct");
  for (const p of walk(correct)) files.set(p, readFileSync(join(correct, p), "utf8"));
  if (caseName !== "correct") {
    const dir = join(FIXTURE_ROOT, bundle, caseName);
    if (!existsSync(dir)) throw new Error(`사례 폴더가 없습니다: ${bundle}/${caseName}`);
    for (const p of walk(dir)) {
      if (p.endsWith(".deleted")) files.delete(p.slice(0, -".deleted".length));
      else files.set(p, readFileSync(join(dir, p), "utf8"));
    }
  }
  return [...files].map(([path, content]) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path));
}

/** 사례 폴더가 correct에서 바꾼 파일 경로(추가·수정·삭제) */
export function changedPaths(bundle: string, caseName: string): { written: string[]; deleted: string[] } {
  const dir = join(FIXTURE_ROOT, bundle, caseName);
  const all = walk(dir);
  return { written: all.filter((p) => !p.endsWith(".deleted")), deleted: all.filter((p) => p.endsWith(".deleted")).map((p) => p.slice(0, -".deleted".length)) };
}

export const correctPaths = (bundle: string): string[] => walk(join(FIXTURE_ROOT, bundle, "correct"));
export const readCorrect = (bundle: string, path: string): string => readFileSync(join(FIXTURE_ROOT, bundle, "correct", path), "utf8");
