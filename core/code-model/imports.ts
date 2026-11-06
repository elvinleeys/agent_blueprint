/**
 * import 경로를 올린 파일로 바꾼다(순수 문자열 계산, 파일 시스템·tsconfig를 읽지 않음).
 *
 * - 상대 경로(`./`, `../`): 가져오는 파일의 폴더 기준.
 * - `@/` 별칭: tsconfig를 올리지 않으므로 가장 흔한 설정(`"@/*": ["./src/*"]` 또는 `["./*"]`)만 따른다.
 *   프로젝트 루트 = 가져오는 파일 경로에서 처음 나오는 `src/` 폴더의 앞부분(경로에 `src/`가 없거나 맨 앞이면 빈 접두사).
 *   `@/x`는 `<루트>src/x`를 먼저, 없으면 `<루트>x`를 찾는다. 올린 폴더 이름이 앞에 붙어 있어도(`my-app/src/…`) 루트가 따라온다.
 * - 그 밖의 패키지 import(`react`, `next/link`, `@scope/pkg`)는 null. 다른 별칭(`~/`, `#/`)도 null이며 호출한 쪽이 "읽지 못함"으로 센다.
 */
const EXTS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

const normalize = (segments: string[]): string => {
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
};

/** 가져오는 파일의 프로젝트 루트 접두사(끝 `/` 포함 또는 빈 문자열) */
export function projectRootOf(fromPath: string): string {
  const parts = fromPath.split("/");
  const i = parts.indexOf("src");
  return i > 0 ? `${parts.slice(0, i).join("/")}/` : "";
}

export const isAliasImport = (spec: string) => spec.startsWith("@/");
export const isRelativeImport = (spec: string) => spec.startsWith(".");

/** 올린 파일 경로 집합에서 import를 찾는다. 못 찾으면 null */
export function resolveModule(paths: ReadonlySet<string>, fromPath: string, spec: string): string | null {
  let bases: string[];
  if (isRelativeImport(spec)) bases = [normalize([...fromPath.split("/").slice(0, -1), ...spec.split("/")])];
  else if (isAliasImport(spec)) {
    const root = projectRootOf(fromPath);
    const rest = spec.slice(2);
    bases = [`${root}src/${rest}`, `${root}${rest}`];
  } else return null;
  for (const base of bases) {
    const hit = EXTS.map((e) => `${base}${e}`).find((p) => paths.has(p));
    if (hit) return hit;
  }
  return null;
}
