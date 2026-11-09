// 채점 스크립트의 코드 읽기: 내 컴퓨터의 폴더 → { path, content }[] (node:fs 사용, 앱 코드에서 import 금지).
// 판정과 분리해 두었다. GitHub 공개 저장소 입력은 같은 모양을 돌려주는 read-github.ts를 더하면 된다.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CONFIG_FILE, EXCLUDED_DIRS } from "../../core/code-model/filter-files";
import type { SourceFile } from "../../core/code-model/types";

/** 읽을 후보(나머지는 거르기에서 어차피 빠지므로 내용을 읽지 않는다) */
const CANDIDATE = /\.tsx?$/;

/**
 * 폴더를 읽는다. 경로는 화면에서 폴더를 올릴 때처럼 폴더 이름으로 시작한다(예: renamed/src/...).
 * 제외 폴더(node_modules 등)는 들어가지 않는다. tsconfig를 따로 주면 프로젝트 맨 위 설정(<폴더>/tsconfig.json)으로 간주한다(파일 선택으로 올린 설정과 같은 규칙, 스펙 §4-1). 같은 경로의 설정이 있으면 준 것으로 바꾼다.
 */
export function readLocalFolder(dir: string, tsconfigFile?: string): SourceFile[] {
  const root = resolve(dir);
  const name = basename(root);
  const out: SourceFile[] = [];
  const walk = (abs: string, rel: string) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (!EXCLUDED_DIRS.includes(e.name)) walk(join(abs, e.name), r);
      } else if (e.isFile() && (CANDIDATE.test(e.name) || CONFIG_FILE.test(r))) {
        out.push({ path: r, content: readFileSync(join(abs, e.name), "utf8") });
      }
    }
  };
  walk(root, name);
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (tsconfigFile) {
    const path = `${name}/tsconfig.json`;
    return [{ path, content: readFileSync(tsconfigFile, "utf8") }, ...out.filter((f) => f.path !== path)];
  }
  return out;
}
