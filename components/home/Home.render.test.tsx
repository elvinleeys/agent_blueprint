import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Home from "../../app/page";
import { FLOW_STEPS, CLEANUP_TEXT } from "./HomeSections";
import { HERO_DESCRIPTION, HERO_TITLE, SIGNUP_NOTE } from "./HomeIntro";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("../../lib/supabase/client", () => ({ createClient: () => ({}) }));

// 서버 렌더링 스모크 테스트. 홈은 로그인·DB·AI 없이 정적 예시만 그린다(로그인 상태 이동은 proxy가 맡음)
const out = renderToString(<Home params={Promise.resolve({})} searchParams={Promise.resolve({})} />).replaceAll("<!-- -->", "");

describe("홈 랜딩", () => {
  it("첫 화면 문구(시작 버튼은 Suspense 안이라 아래 마무리 구역에서 확인)", () => {
    for (const t of [HERO_TITLE, HERO_DESCRIPTION, SIGNUP_NOTE]) expect(out).toContain(t);
  });

  it("미리보기는 설명 뒤(모바일에서는 아래)에 오고 읽기 전용이다: 버튼·선택 역할이 없고 상자마다 나타남 표시가 있다", () => {
    expect(out.indexOf("data-reveal")).toBeGreaterThan(out.indexOf(HERO_DESCRIPTION));
    const preview = out.slice(out.indexOf("<figure"), out.indexOf("</figure>"));
    expect(preview).toContain("data-reveal");
    expect(preview).not.toContain('role="button"');
    expect(preview).toContain("예시 화면");
  });

  it("5단계 흐름, 검사 결과(경고 2건)·지시서 예시, 정리 소개, 마무리 시작 버튼", () => {
    for (const s of FLOW_STEPS) expect(out).toContain(s.title);
    expect(FLOW_STEPS).toHaveLength(5);
    expect(out).toContain("경고 2");
    expect(out).toContain("R-03");
    expect(out).toContain("R-06");
    expect(out).toContain(CLEANUP_TEXT);
    // 첫 화면의 버튼은 searchParams를 기다리는 Suspense 안이라 서버 렌더링 문자열에는 마무리 버튼만 들어온다
    expect(out.slice(out.indexOf("closing-title"))).toContain("GitHub로 시작하기");
    expect(out).toContain("GitHub 저장소");
  });

  it("검사 결과 예시의 노드 이름은 눌러 선택하는 버튼이 아니다", () => {
    const check = out.slice(out.indexOf("구조 검사 결과"), out.indexOf("지시서 (앞부분)"));
    expect(check).not.toContain("<button");
  });
});

describe("나타나는 애니메이션", () => {
  const css = readFileSync("app/globals.css", "utf-8");
  it("CSS로만 하고 움직임 줄이기 설정이면 멈춘다", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{\s*\[data-reveal\]\s*{\s*animation: none;/);
  });
});
