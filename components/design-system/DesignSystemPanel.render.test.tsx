import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analyzeCode } from "@/core/cleanup/analyze";
import { addPicked } from "@/core/cleanup/picked-files";
import { summarizeUpload } from "@/core/cleanup/upload-summary";
import DesignSystemPanel from "./DesignSystemPanel";
import FileListSection from "./FileListSection";
import ResultSection from "./ResultSection";
import type { PickedFile, UploadList } from "./useUploadList";

// 서버 렌더링 스모크 테스트: 파일 선택·분석·복사 같은 클릭 흐름은 브라우저에서 확인한다
// (요청 처리는 lib/client/run-analyze.test.ts, 목록 합치기는 core/cleanup/picked-files.test.ts)
const text = (node: React.ReactElement) => renderToString(node).replaceAll("<!-- -->", "");
const file = (path: string, size = 100, hasPath = true): PickedFile => ({ path, name: path.split("/").pop()!, size, lastModified: 1, hasPath, ordinal: 1, file: {} as File });

describe("DesignSystemPanel", () => {
  const out = text(<DesignSystemPanel />);

  it("두 칸(디자인 시스템 / 검사할 코드)과 각 칸의 입력 방식·안내를 그린다", () => {
    for (const t of [
      "1. 디자인 시스템 (공식)",
      "폴더 업로드",
      "스펙 JSON 붙여넣기",
      "디자인 시스템 폴더(예: src/components/ui)를 선택하세요",
      "디자인 시스템 폴더 선택",
      "2. 검사할 코드",
      "폴더 선택",
      "파일 여러 개 선택",
      "더 좁은 폴더(예: src/components/ui)를 선택하세요",
      "분석하기",
    ]) expect(out).toContain(t);
  });

  it("디자인 시스템 경로를 직접 입력하는 칸은 없다", () => {
    expect(out).not.toContain("디자인 시스템 폴더 경로");
    expect(out).not.toContain('placeholder="src/components/ui"');
  });

  it("파일을 올리기 전에는 분석할 수 없고 이유를 알린다(버튼 비활성), 결과·지시서는 없다", () => {
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>분석하기<\/button>/);
    expect(out).toContain("검사할 코드 파일을 올려 주세요.");
    expect(out).not.toContain("분석 결과");
    expect(out).not.toContain(".md 내려받기");
  });
});

describe("FileListSection", () => {
  const upload = (entries: PickedFile[], unchecked = new Set<string>()): UploadList => ({
    list: entries,
    unchecked,
    summary: summarizeUpload(entries, unchecked),
    add: () => {},
    remove: () => {},
    clear: () => {},
    toggle: () => {},
  });
  const render = (u: UploadList) => text(<FileListSection idPrefix="t" pickers={[{ label: "폴더 선택", directory: true }]} upload={u} disabled={false} />);

  it("전체 N개 중 분석 대상 M개, 파일 목록, 삭제 버튼, 모두 지우기, 제외된 파일 이유를 보인다", () => {
    const out = render(upload([file("src/ui/A.tsx"), file("src/ui/types.ts"), file("src/ui/A.test.tsx"), file("node_modules/x.tsx")]));
    expect(out).toContain("전체 4개 중 분석 대상 2개");
    expect(out).toContain("src/ui/A.tsx");
    expect(out).toContain("src/ui/A.tsx 삭제");
    expect(out).toContain("모두 지우기");
    expect(out).toContain("제외된 파일 2개");
    expect(out).toContain("테스트·스토리 파일: 1개");
  });

  it("목록이 비어 있으면 개수·모두 지우기를 그리지 않는다", () => {
    expect(render({ ...upload([]), summary: null })).not.toContain("모두 지우기");
  });

  it("체크를 해제하면 선택 개수를 따로 보인다", () => {
    expect(render(upload([file("a.tsx"), file("b.tsx")], new Set(["a.tsx"])))).toContain("전체 2개 중 분석 대상 2개 (선택 1개)");
  });

  it("경로가 없는 파일은 '경로 없음', 같은 이름의 다른 파일은 구분해서 보인다", () => {
    const one = { ...file("Button.tsx", 10, false), name: "Button.tsx", lastModified: 1 };
    const two = { ...file("Button.tsx", 20, false), name: "Button.tsx", lastModified: 2 };
    const list = addPicked([], [one, two]);
    const out = render(upload(list));
    expect(out).toContain("Button.tsx (경로 없음)");
    expect(out).toContain("Button.tsx (경로 없음, 같은 이름의 다른 파일 #2)");
  });

  it("상한을 넘으면 더 좁은 폴더 안내를 보인다", () => {
    const out = render(upload(Array.from({ length: 31 }, (_, i) => file(`src/f${i}.tsx`))));
    expect(out).toContain("파일이 30개를 넘습니다.");
    expect(out).toContain("더 좁은 폴더(예: src/components/ui)를 선택하세요");
  });
});

describe("ResultSection", () => {
  const p = "(p: { a: string; b: string })";
  const analyze = () => {
    const o = analyzeCode({
      designSystem: { kind: "files", files: [{ path: "ds/Button.tsx", content: `export const Button = ${p} => <button/>;` }] },
      code: [
        { path: "app/Button.tsx", content: `export const Button = ${p} => <button/>;` },
        { path: "app/UserCard.tsx", content: `export const UserCard = ${p} => <i/>;` },
        { path: "app/UserCardWide.tsx", content: `export const UserCardWide = ${p} => <i/>;` },
        { path: "app/Cart.tsx", content: `export const Cart = () => <div/>;` },
        { path: "app/broken.tsx", content: `export const = <<<` },
      ],
    });
    if (!o.ok) throw new Error("분석 실패");
    return o.result;
  };

  it("경고가 맨 위, 정보 합치기 후보가 그 아래, '공식 목록에 없음'은 개수와 함께 접힌 묶음", () => {
    const out = text(<ResultSection result={analyze()} />);
    const warn = out.indexOf("경고 (1)");
    const info = out.indexOf("정보: 서로 비슷한 컴포넌트 (1)");
    const fold = out.indexOf("공식 목록에 없음 (3개)");
    expect(warn).toBeGreaterThan(-1);
    expect(warn).toBeLessThan(info);
    expect(info).toBeLessThan(fold);
    expect(out).toContain("공식과 같은 이름의 별도 구현");
    expect(out).toMatch(/<details[^>]*>(?:(?!<\/details>)[\s\S])*공식 목록에 없음 \(3개\)/);
    expect(out).not.toMatch(/<details[^>]* open/);
  });

  it("문법 오류로 일부만 분석된 파일을 알린다", () => {
    const out = text(<ResultSection result={analyze()} />);
    expect(out).toContain("문법 오류로 일부만 분석됨 (1개 파일)");
    expect(out).toContain("app/broken.tsx");
  });

  it("같은 폴더를 두 칸에 올려 코드 쪽에서 뺀 파일이 있으면 알린다", () => {
    const r = { ...analyze(), sameAsDesignSystemCount: 2 };
    expect(text(<ResultSection result={r} />)).toContain("내용이 같은 2개는 비교에서 뺐습니다");
  });
});
