import { describe, expect, it } from "vitest";
import { readCodeModel } from "../code-model/facts";

// 설정 파일(tsconfig.json·jsconfig.json)을 어떻게 올렸는지에 따라 별칭 import가 풀리는지:
// - 폴더 업로드: 설정 파일의 폴더 위치를 알아서 그 설정의 paths를 그 폴더 기준으로 푼다.
// - 파일 선택: 폴더 위치를 알 수 없어 파일 이름만 경로가 된다 → "프로젝트 맨 위에 있는 설정"(경로 `tsconfig.json`)으로 간주한다.
//   이때 코드 파일도 폴더 정보가 없어(이름만) paths 대상(`./src/...`)에 해당하는 파일이 없으므로 별칭 import는 풀리지 않고, 해석 못 함으로 남아 관련 판정이 확인 필요로 간다.

const TSCONFIG = `{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }`;
const PAGE = `import { Card } from "@/components/Card";\nexport function Page() { return <Card />; }`;
const CARD = `export function Card() { return <i />; }`;
const importOf = (files: { path: string; content: string }[], file: string) => readCodeModel(files).files.find((f) => f.path === file)!.imports.find((i) => i.spec === "@/components/Card");

describe("설정 파일을 올리는 방식과 별칭 해석", () => {
  it("폴더 업로드: 설정 파일의 폴더를 알아서 paths가 풀린다(업로드 폴더 이름이 앞에 붙어도)", () => {
    const files = [
      { path: "my-app/tsconfig.json", content: TSCONFIG },
      { path: "my-app/src/pages/Page.tsx", content: PAGE },
      { path: "my-app/src/components/Card.tsx", content: CARD },
    ];
    expect(importOf(files, "my-app/src/pages/Page.tsx")).toMatchObject({ resolved: "my-app/src/components/Card.tsx", resolvedBy: "tsconfig" });
  });

  it("파일 선택: 설정 파일은 이름만 있어 맨 위 설정으로 간주되고, 폴더 정보가 없는 코드의 별칭 import는 풀리지 않는다(해석 못 함)", () => {
    const files = [
      { path: "tsconfig.json", content: TSCONFIG },
      { path: "Page.tsx", content: PAGE },
      { path: "Card.tsx", content: CARD },
    ];
    const imp = importOf(files, "Page.tsx");
    expect(imp?.resolved).toBeNull();
    expect(readCodeModel(files).configNotes).toEqual([]); // 설정 자체는 읽었다(읽지 못한 설정이 아니다)
  });
});
