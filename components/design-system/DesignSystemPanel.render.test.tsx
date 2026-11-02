import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { analyzeFiles } from "@/core/cleanup/analyze";
import { summarizeUpload } from "@/core/cleanup/upload-summary";
import DesignSystemPanel from "./DesignSystemPanel";
import ResultSection from "./ResultSection";
import UploadSection, { type PickedFile } from "./UploadSection";

// 서버 렌더링 스모크 테스트: 파일 선택·분석·복사 같은 클릭 흐름은 브라우저에서 확인한다(요청 처리는 lib/client/run-analyze.test.ts)
const text = (node: React.ReactElement) => renderToString(node).replaceAll("<!-- -->", "");
const file = (path: string, size = 100): PickedFile => ({ path, size, file: {} as File });

describe("DesignSystemPanel", () => {
  const out = text(<DesignSystemPanel />);

  it("업로드 안내(폴더 선택·파일 여러 개 선택·상한)와 스펙 입력 방식을 그린다", () => {
    for (const t of ["디자인 시스템 폴더(예: src/components/ui)를 선택하세요", "폴더 선택", "파일 여러 개 선택", "30개", "200KB", "1MB", "디자인 시스템 폴더로 만들기", "스펙 JSON 직접 입력", "src/components/ui", "분석하기"]) expect(out).toContain(t);
  });

  it("파일을 고르기 전에는 분석할 수 없다(버튼 비활성)이고 결과·지시서는 없다", () => {
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>분석하기<\/button>/);
    expect(out).not.toContain("분석 결과");
    expect(out).not.toContain(".md 내려받기");
  });
});

describe("UploadSection", () => {
  const render = (entries: PickedFile[], unchecked = new Set<string>()) =>
    text(<UploadSection summary={summarizeUpload(entries, unchecked)} unchecked={unchecked} onPick={() => {}} onToggle={() => {}} disabled={false} />);

  it("전체 N개 중 분석 대상 M개, 파일 목록, 제외된 파일 이유를 보인다", () => {
    const out = render([file("src/ui/A.tsx"), file("src/ui/types.ts"), file("src/ui/A.test.tsx"), file("node_modules/x.tsx")]);
    expect(out).toContain("전체 4개 중 분석 대상 2개");
    expect(out).toContain("src/ui/A.tsx");
    expect(out).toContain("제외된 파일 2개");
    expect(out).toContain("테스트·스토리 파일: 1개");
  });

  it("체크를 해제하면 선택 개수를 따로 보인다", () => {
    expect(render([file("a.tsx"), file("b.tsx")], new Set(["a.tsx"]))).toContain("전체 2개 중 분석 대상 2개 (선택 1개)");
  });

  it("상한을 넘으면 더 좁은 폴더 안내를 보인다", () => {
    const many = Array.from({ length: 31 }, (_, i) => file(`src/f${i}.tsx`));
    const out = render(many);
    expect(out).toContain("파일이 30개를 넘습니다.");
    expect(out).toContain("더 좁은 폴더(예: src/components/ui)를 선택하세요");
  });
});

describe("ResultSection", () => {
  const p = "(p: { a: string; b: string })";
  const analyze = () => {
    const o = analyzeFiles(
      [
        { path: "src/ui/Button.tsx", content: `export const Button = ${p} => <button/>;` },
        { path: "src/features/Button.tsx", content: `export const Button = ${p} => <button/>;` },
        { path: "src/features/UserCard.tsx", content: `export const UserCard = ${p} => <i/>;` },
        { path: "src/features/UserCardWide.tsx", content: `export const UserCardWide = ${p} => <i/>;` },
        { path: "src/features/Cart.tsx", content: `export const Cart = () => <div/>;` },
        { path: "src/features/broken.tsx", content: `export const = <<<` },
      ],
      { kind: "folder", folder: "src/ui" },
    );
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
    expect(out).toContain("src/features/broken.tsx");
  });
});
