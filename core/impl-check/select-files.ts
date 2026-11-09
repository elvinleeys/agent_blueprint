import * as ts from "typescript";
import { CONFIG_FILE } from "../code-model/filter-files";
import { createImportResolver } from "../code-model/imports";
import { readPathConfigs } from "../code-model/tsconfig";
import type { SourceFile } from "../code-model/types";
import type { Blueprint } from "../schema/blueprint";

/**
 * 설계도 위치 기준으로 검사할 파일만 고른다(채점 스크립트의 기본 읽기 방식, 순수 함수).
 * FSD처럼 화면 하나의 코드가 여러 폴더에 흩어져도 빠지지 않게, 하위 폴더 하나가 아니라 노드 위치에서 출발한다.
 * 1. 설정 파일(tsconfig·jsconfig)은 모두 고른다.
 * 2. 노드의 location.dir이 경로 중간에 그대로 들어 있는 폴더의 파일(앞에 src/·폴더 이름이 붙어도 됨).
 * 3. 2번 파일이 가져오는 파일을 끝까지 따라간다(화면 검사와 같은 import 해석기). 설계 위치가 아닌 곳에 둔 파일도 이렇게 들어온다.
 * 4. 2번 파일을 직접 가져오는 파일(화면 진입 파일: app/…/page.tsx, 라우터 설정). 진입 파일이 가져오는 것은 따라가지 않는다(라우터가 앱 전체를 끌어오지 않게).
 * 한계: 위치 밖에 있으면서 어디서도 가져오지 않는 컴포넌트는 고르지 못한다(전체를 보려면 모든 파일을 넘긴다).
 * 입력은 거르기(filterFiles)를 통과한 파일이고, 결과는 입력 순서를 지킨다.
 */
export function selectByBlueprint<T extends SourceFile>(blueprint: Blueprint, files: T[]): T[] {
  const configs = files.filter((f) => CONFIG_FILE.test(f.path));
  const code = files.filter((f) => !CONFIG_FILE.test(f.path));
  const dirs = blueprint.nodes.map((n) => n.location.dir.split("/").filter(Boolean)).filter((d) => d.length);
  const inLocation = (path: string) => {
    const segs = path.split("/").slice(0, -1);
    return dirs.some((d) => segs.some((_, i) => d.every((s, j) => segs[i + j] === s)));
  };

  const resolve = createImportResolver(new Set(files.map((f) => f.path)), "tsconfig", readPathConfigs(configs));
  const importsOf = new Map(
    code.map((f) => [f.path, ts.preProcessFile(f.content, true, true).importedFiles.map((i) => resolve(f.path, i.fileName).resolved).filter((p): p is string => p !== null)]),
  );

  const located = new Set(code.filter((f) => inLocation(f.path)).map((f) => f.path));
  const picked = new Set(located);
  const queue = [...located];
  while (queue.length) {
    for (const p of importsOf.get(queue.pop()!) ?? []) {
      if (!picked.has(p)) {
        picked.add(p);
        queue.push(p);
      }
    }
  }
  for (const f of code) if ((importsOf.get(f.path) ?? []).some((p) => located.has(p))) picked.add(f.path);

  return files.filter((f) => CONFIG_FILE.test(f.path) || picked.has(f.path));
}
