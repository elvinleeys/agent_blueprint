// 구현 검사 화면 시연용 코드 폴더를 만든다(바로 올릴 수 있는 완성 코드).
//   npm run demo:build   # fixtures/demo-implementation-check/{correct,renamed,warning}/ 를 시험 데이터에서 다시 만든다
// 원본은 fixtures/implementation-check/next 의 correct 위에 사례 폴더를 덮어쓴 것이다. 폴더 세 개를 만들어 커밋해 두고,
// core/impl-check/demo.test.ts 가 폴더 내용이 시험 데이터와 같은지, 각 폴더의 검사 결과가 문서(docs/demo-implementation-check.md)와 같은지 확인한다.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { changedPaths, loadCode } from "../core/impl-check/load-fixture";

export const DEMO_ROOT = "fixtures/demo-implementation-check";

/** 경로 별칭(@/)을 읽는 설정. 폴더를 올릴 때 설정 파일 읽기도 함께 보인다 */
export const DEMO_TSCONFIG = `{\n  "compilerOptions": {\n    "baseUrl": ".",\n    "paths": { "@/*": ["./src/*"] }\n  }\n}\n`;

/** 시연 폴더 이름 → 만드는 방법(시험 데이터 사례를 correct 위에 차례로 덮어쓴다. 같은 파일을 건드리는 사례를 섞지 않는다) */
export const DEMO_SETS: Record<string, string[]> = {
  correct: [],
  renamed: ["renamed"],
  warning: ["wrong-IC-03", "wrong-IC-11", "wrong-IC-12"],
};

/** 시험 데이터에서 시연 폴더의 파일들을 계산한다(경로는 폴더 안의 상대 경로) */
export function composeDemo(cases: string[]): { path: string; content: string }[] {
  const files = new Map(loadCode("next", "correct").map((f) => [f.path, f.content]));
  for (const c of cases) {
    const { written, deleted } = changedPaths("next", c);
    const merged = new Map(loadCode("next", c).map((f) => [f.path, f.content]));
    for (const path of written) files.set(path, merged.get(path)!);
    for (const path of deleted) files.delete(path);
  }
  files.set("tsconfig.json", DEMO_TSCONFIG);
  return [...files].map(([path, content]) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path));
}

if (process.argv[1]?.endsWith("build-demo-code.ts")) {
  rmSync(DEMO_ROOT, { recursive: true, force: true });
  for (const [name, cases] of Object.entries(DEMO_SETS)) {
    const files = composeDemo(cases);
    for (const f of files) {
      const target = join(DEMO_ROOT, name, f.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.content);
    }
    console.log(`${DEMO_ROOT}/${name}: 파일 ${files.length}개`);
  }
}
