import { describe, expect, it } from "vitest";
import { analyzeCode } from "../cleanup/analyze";
import { buildCleanupPrompt, CLEANUP_FILE_NAME, CLEANUP_SOURCE } from "./cleanup-prompt";

const p = "(p: { a: string; b: string })";
const designSystem = { kind: "files" as const, files: [{ path: "ds/Button.tsx", content: `export const Button = ${p} => <button/>;` }] };
const code = [
  { path: "app/Button.tsx", content: `export const Button = ${p} => <button/>;` },
  { path: "app/UserCard.tsx", content: `export const UserCard = ${p} => <i/>;` },
  { path: "app/UserCardWide.tsx", content: `export const UserCardWide = ${p} => <i/>;` },
  { path: "app/Big.tsx", content: `export const Big = (p: { ${"abcdefghi".split("").map((c) => `${c}: string`).join("; ")} }) => <i/>;` },
  { path: "app/Cart.tsx", content: `export const Cart = () => <div/>;` },
  { path: "app/broken.tsx", content: `export const = <<<` },
];
const run = () => {
  const o = analyzeCode({ code, designSystem });
  if (!o.ok) throw new Error("분석 실패");
  return o.result;
};

describe("buildCleanupPrompt", () => {
  const doc = buildCleanupPrompt(run());

  it("출처 구분과 파일 이름 상수, 공식 컴포넌트 출처 문장", () => {
    expect(CLEANUP_SOURCE).toBe("cleanup");
    expect(CLEANUP_FILE_NAME).toBe("design-system-cleanup-prompt.md");
    expect(doc).toContain("출처: cleanup");
    expect(doc).toContain("올린 디자인 시스템 파일 1개에서 내보낸 컴포넌트");
  });

  it("정리 대상은 경고만: 같은 이름의 별도 구현 → 나누기 순", () => {
    expect(doc).toMatch(/### 1\. 공식과 같은 이름의 별도 구현: Button/);
    expect(doc).toMatch(/### 2\. props가 많은 컴포넌트 나누기: Big \(props 9개\)/);
  });

  it("정보는 참고 절에: 비슷한 컴포넌트 묶음, 공식 목록에 없는 컴포넌트", () => {
    const ref = doc.slice(doc.indexOf("## 참고(정보)"), doc.indexOf("## 필수 규칙"));
    expect(ref).toContain("UserCard");
    expect(ref).toContain("UserCardWide");
    expect(ref).toMatch(/공식 목록에 없는 컴포넌트 \d+개/);
    expect(doc.indexOf("## 정리 대상")).toBeLessThan(doc.indexOf("## 참고(정보)"));
  });

  it("JSON 스펙이면 출처 문장이 다르다", () => {
    const text = JSON.stringify({ version: "1.2", components: [], tokens: { color: { a: "#fff" }, spacing: { "4": "16px" } } });
    const o = analyzeCode({ code, designSystem: { kind: "json", text } });
    if (!o.ok) throw new Error("분석 실패");
    expect(buildCleanupPrompt(o.result)).toContain("사용자가 입력한 디자인 시스템 스펙(JSON)");
  });

  it("필수 규칙·금지 사항·분석 한계(별칭·문법 오류 파일)를 담는다", () => {
    expect(doc).toContain("## 필수 규칙");
    expect(doc).toContain("## 금지 사항");
    expect(doc).toContain("`@/` 경로 별칭");
    expect(doc).toContain("`app/broken.tsx`");
  });

  it("같은 입력이면 같은 출력이고 줄바꿈 하나로 끝난다", () => {
    expect(buildCleanupPrompt(run())).toBe(doc);
    expect(doc.endsWith("\n")).toBe(true);
    expect(doc.endsWith("\n\n")).toBe(false);
  });

  it("경고가 없으면 그 사실을 알린다", () => {
    const o = analyzeCode({ code: [{ path: "app/A.tsx", content: `export const A = () => <i/>;` }], designSystem });
    if (!o.ok) throw new Error("분석 실패");
    expect(buildCleanupPrompt(o.result)).toContain("정리가 필요한 경고 항목이 없습니다");
  });
});
