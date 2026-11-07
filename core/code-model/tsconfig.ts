import * as ts from "typescript";
import { dirOf, joinPath } from "./path-utils";
import type { SourceFile } from "./types";

// 올린 tsconfig.json·jsconfig.json의 paths(경로 별칭)를 읽는다. 순수 문자열 계산이며 파일 시스템을 읽지 않는다.
// 주석·끝 쉼표를 허용하는 형식은 TypeScript의 설정 파서가 읽는다. extends는 올린 상대 경로 설정 파일만 따라간다.
// 지원 범위와 못 읽는 경우는 스펙(tasks/spec-implementation-check.md §4-1 "tsconfig 지원 범위")을 따른다.

/** 설정을 다 읽지 못한 이유. 이 설정에 기대는 import는 틀린 경로로 확정하지 않고 해석 못 함으로 둔다 */
export type ConfigUncertainty = "extends-not-followed" | "invalid-json";

export type PathAliasConfig = {
  configPath: string;
  /** `paths`의 대상이 풀리는 기준 폴더(업로드 기준). baseUrl이 있으면 그 폴더, 없으면 설정 파일 폴더 */
  pathsBase: string;
  paths: { pattern: string; targets: string[] }[];
  /** baseUrl이 있으면 그 폴더(`components/Foo`처럼 별칭 없이 쓴 import를 풀 때 쓴다) */
  baseUrl: string | null;
  /** 패키지에서 이어받는 extends 등을 따라가지 못했거나 설정을 읽지 못했으면 그 이유. 없으면 null */
  uncertain: ConfigUncertainty | null;
};

export type ConfigNote = {
  path: string;
  /** invalid-json: 설정을 읽지 못함 / extends-not-followed: 올리지 않았거나 패키지인 extends를 따라가지 못함 / unsupported-pattern: `*`가 둘 이상인 paths 패턴 */
  reason: ConfigUncertainty | "unsupported-pattern";
  extends?: string;
  pattern?: string;
};

export type PathConfigs = { byDir: Map<string, PathAliasConfig>; notes: ConfigNote[] };

const CONFIG_NAME = /(^|\/)(tsconfig|jsconfig)\.json$/;
const MAX_EXTENDS_DEPTH = 5;

type Merged = { baseUrl?: string; paths?: { map: Record<string, string[]>; base: string }; uncertain?: ConfigUncertainty };

function findConfig(byPath: Map<string, SourceFile>, dir: string, spec: string): string | null {
  const base = joinPath(dir, spec);
  return [base, `${base}.json`, `${base}/tsconfig.json`].find((p) => byPath.has(p)) ?? null;
}

function load(path: string, byPath: Map<string, SourceFile>, notes: ConfigNote[], chain: string[]): Merged | null {
  const file = byPath.get(path);
  if (!file || chain.includes(path) || chain.length >= MAX_EXTENDS_DEPTH) return null;
  const { config, error } = ts.parseConfigFileTextToJson(path, file.content);
  if (error || !config || typeof config !== "object") {
    notes.push({ path, reason: "invalid-json" });
    return null;
  }
  const dir = dirOf(path);
  let merged: Merged = {};
  const ext = (config as { extends?: unknown }).extends;
  const specs = typeof ext === "string" ? [ext] : Array.isArray(ext) ? ext.filter((x): x is string => typeof x === "string") : [];
  for (const spec of specs) {
    const target = spec.startsWith(".") ? findConfig(byPath, dir, spec) : null;
    const parent = target ? load(target, byPath, notes, [...chain, path]) : null;
    if (parent) merged = { ...merged, ...parent }; // 뒤에 적은 설정이 앞의 것을 덮는다
    else {
      if (!target) notes.push({ path, reason: "extends-not-followed", extends: spec });
      merged.uncertain = "extends-not-followed";
    }
  }
  const co = (config as { compilerOptions?: { baseUrl?: unknown; paths?: unknown } }).compilerOptions;
  if (co && typeof co.baseUrl === "string") merged.baseUrl = joinPath(dir, co.baseUrl);
  if (co && co.paths && typeof co.paths === "object") {
    const map: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(co.paths as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      if (k.split("*").length > 2) notes.push({ path, reason: "unsupported-pattern", pattern: k }); // `*`는 하나만 지원
      else map[k] = v.filter((x): x is string => typeof x === "string");
    }
    merged.paths = { map, base: merged.baseUrl ?? dir };
  }
  return merged;
}

/**
 * 올린 파일에서 tsconfig.json·jsconfig.json을 찾아 폴더별로 별칭 설정을 만든다.
 * paths·baseUrl이 없는 설정도 담는다: 각 파일은 가장 가까운 위쪽 설정을 따르므로, 별칭이 없는 가까운 설정이 먼 설정을 가려야 한다
 */
export function readPathConfigs(files: SourceFile[]): PathConfigs {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const notes: ConfigNote[] = [];
  const byDir = new Map<string, PathAliasConfig>();
  // jsconfig를 먼저, tsconfig를 나중에 처리해 같은 폴더에 둘 다 있으면 tsconfig가 이긴다
  const names = files.map((f) => f.path).filter((p) => CONFIG_NAME.test(p)).sort((a, b) => Number(/jsconfig/.test(b)) - Number(/jsconfig/.test(a)));
  for (const path of names) {
    const m = load(path, byPath, notes, []);
    if (!m) {
      byDir.set(dirOf(path), { configPath: path, pathsBase: dirOf(path), paths: [], baseUrl: null, uncertain: "invalid-json" });
      continue;
    }
    byDir.set(dirOf(path), {
      configPath: path,
      pathsBase: m.paths?.base ?? m.baseUrl ?? dirOf(path),
      paths: Object.entries(m.paths?.map ?? {}).map(([pattern, targets]) => ({ pattern, targets })),
      baseUrl: m.baseUrl ?? null,
      uncertain: m.uncertain ?? null,
    });
  }
  return { byDir, notes };
}

/** 파일에서 가장 가까운 위쪽 폴더의 설정. 없으면 null */
export function configFor(configs: PathConfigs, fromPath: string): PathAliasConfig | null {
  let dir = dirOf(fromPath);
  for (;;) {
    const hit = configs.byDir.get(dir);
    if (hit) return hit;
    if (dir === "") return null;
    dir = dirOf(dir);
  }
}
