import type { AliasMode } from "./options";
import { dirOf, joinPath } from "./path-utils";
import { configFor, type ConfigUncertainty, type PathAliasConfig, type PathConfigs } from "./tsconfig";

/**
 * import 경로를 올린 파일로 바꾼다(순수 문자열 계산, 파일 시스템을 읽지 않음).
 *
 * 풀이 순서:
 * 1. 상대 경로(`./`, `../`): 가져오는 파일의 폴더 기준.
 * 2. 업로드한 tsconfig.json·jsconfig.json이 있고 `paths`를 정의했으면 그것만 따른다(가장 가까운 위쪽 폴더의 설정).
 *    `paths`에 없으면 `baseUrl` 기준으로 찾는다. 그래도 못 풀면 못 푼 것이다(기본 규칙으로 몰래 대신하지 않는다).
 * 3. `paths`를 정의한 설정이 없으면 기본 규칙: `@/x`는 `<루트>src/x`를 먼저, 없으면 `<루트>x`.
 *    프로젝트 루트 = 가져오는 파일 경로에서 처음 나오는 `src/` 폴더의 앞부분(경로에 `src/`가 없거나 맨 앞이면 빈 접두사).
 * 4. 그 밖의 패키지 import(`react`, `next/link`, `@scope/pkg`)는 null이고 kind는 "package".
 *    `@/`·`~/`·`#/`로 시작하는데 못 푼 것은 kind "alias"에 resolved null이다. 호출한 쪽이 관련 판정만 "확인 필요"로 보낸다.
 */
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export type ImportKind = "relative" | "alias" | "package";
export type Resolution = {
  resolved: string | null;
  kind: ImportKind;
  /** 무엇으로 풀었는지: 상대 경로 / 올린 설정 파일(tsconfig·jsconfig) / 기본 규칙. 못 풀었으면 null */
  by: "relative" | "tsconfig" | "default" | null;
  /** tsconfig로 풀거나 풀려고 시도한 설정 파일 */
  config?: string;
  /** 못 푼 이유가 설정을 다 읽지 못해서인 경우(패키지 extends를 따라가지 못함, 설정 읽기 실패). 틀린 경로로 확정하지 않고 해석 못 함으로 둔다 */
  uncertain?: ConfigUncertainty;
};

/** 별칭처럼 보이는 시작 글자(패키지와 구별하기 위한 것) */
const ALIAS_LIKE = /^(@|~|#)\//;

export const isAliasImport = (spec: string) => spec.startsWith("@/");
export const isRelativeImport = (spec: string) => spec.startsWith(".");

const findFile = (paths: ReadonlySet<string>, base: string): string | null => EXTS.map((e) => `${base}${e}`).find((p) => paths.has(p)) ?? null;

/** 가져오는 파일의 프로젝트 루트 접두사(끝 `/` 포함 또는 빈 문자열) */
export function projectRootOf(fromPath: string): string {
  const parts = fromPath.split("/");
  const i = parts.indexOf("src");
  return i > 0 ? `${parts.slice(0, i).join("/")}/` : "";
}

/** 기본 규칙만으로 푼다(설정 파일을 보지 않음). 상대 경로와 `@/`만 푼다. 못 풀면 null */
export function resolveModule(paths: ReadonlySet<string>, fromPath: string, spec: string): string | null {
  if (isRelativeImport(spec)) return findFile(paths, joinPath(dirOf(fromPath), spec));
  if (!isAliasImport(spec)) return null;
  const root = projectRootOf(fromPath);
  const rest = spec.slice(2);
  return findFile(paths, `${root}src/${rest}`) ?? findFile(paths, `${root}${rest}`);
}

/** tsconfig `paths`의 패턴(`@/*`, `~lib`)과 import 글자를 맞춰 보고, 가장 긴 접두사 패턴의 대상 후보들을 돌려준다 */
function matchPaths(spec: string, patterns: { pattern: string; targets: string[] }[]): string[] | null {
  let best: { len: number; targets: string[] } | null = null;
  for (const { pattern, targets } of patterns) {
    const star = pattern.indexOf("*");
    if (star < 0) {
      if (spec === pattern && (!best || pattern.length >= best.len)) best = { len: pattern.length, targets };
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (spec.length >= prefix.length + suffix.length && spec.startsWith(prefix) && spec.endsWith(suffix) && (!best || prefix.length > best.len)) {
      const middle = spec.slice(prefix.length, spec.length - suffix.length);
      best = { len: prefix.length, targets: targets.map((t) => t.replace("*", middle)) };
    }
  }
  return best ? best.targets : null;
}

/** 파일 집합과 별칭 설정을 묶어 import 해석기를 만든다. 모드는 기능별 설정(options.ts)이 정한다 */
export function createImportResolver(paths: ReadonlySet<string>, mode: AliasMode, configs: PathConfigs | null) {
  // 설정을 다 읽지 못한 경우에 "업로드 폴더 이름으로 시작하는 import"를 가려내기 위한 폴더 이름(설정의 baseUrl 또는 설정 폴더 바로 아래)
  const topFolders = new Map<string, Set<string>>();
  const folderNames = (cfg: PathAliasConfig): Set<string> => {
    let hit = topFolders.get(cfg.configPath);
    if (!hit) {
      const base = cfg.baseUrl ?? dirOf(cfg.configPath);
      const prefix = base ? `${base}/` : "";
      hit = new Set([...paths].filter((p) => p.startsWith(prefix) && p.slice(prefix.length).includes("/")).map((p) => p.slice(prefix.length).split("/")[0]));
      topFolders.set(cfg.configPath, hit);
    }
    return hit;
  };

  return (from: string, spec: string): Resolution => {
    if (isRelativeImport(spec)) {
      const resolved = findFile(paths, joinPath(dirOf(from), spec));
      return { resolved, kind: "relative", by: resolved ? "relative" : null };
    }
    const aliasLike = ALIAS_LIKE.test(spec);
    if (mode === "off") return { resolved: null, kind: aliasLike ? "alias" : "package", by: null };

    const cfg = mode === "tsconfig" && configs ? configFor(configs, from) : null;
    if (cfg && (cfg.paths.length || cfg.baseUrl !== null)) {
      const targets = matchPaths(spec, cfg.paths);
      if (targets) {
        const resolved = targets.map((t) => findFile(paths, joinPath(cfg.pathsBase, t))).find((p) => p) ?? null;
        return { resolved, kind: "alias", by: resolved ? "tsconfig" : null, config: cfg.configPath };
      }
      const viaBase = cfg.baseUrl !== null ? findFile(paths, joinPath(cfg.baseUrl, spec)) : null;
      if (viaBase) return { resolved: viaBase, kind: "alias", by: "tsconfig", config: cfg.configPath };
      // paths를 정의한 설정은 믿는다: 거기에 없는 별칭을 기본 규칙으로 몰래 풀지 않는다
      if (cfg.paths.length) return { resolved: null, kind: aliasLike ? "alias" : "package", by: null, config: cfg.configPath };
    }
    // 설정을 다 읽지 못했고 자기 paths도 없으면, 따라가지 못한 쪽이 별칭·baseUrl을 정했을 수 있다: 그 설정에 기대는 import만 해석 못 함으로 둔다
    if (cfg?.uncertain && !cfg.paths.length && (aliasLike || folderNames(cfg).has(spec.split("/")[0]))) {
      return { resolved: null, kind: "alias", by: null, config: cfg.configPath, uncertain: cfg.uncertain };
    }
    if (isAliasImport(spec)) {
      const resolved = resolveModule(paths, from, spec);
      return { resolved, kind: "alias", by: resolved ? "default" : null };
    }
    return { resolved: null, kind: aliasLike ? "alias" : "package", by: null };
  };
}

export type ImportResolver = ReturnType<typeof createImportResolver>;
