import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ProjectSettingsTab, { canCommitName } from "./ProjectSettingsTab";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

describe("프로젝트 이름 수정", () => {
  it("처음에는 보기 상태: 입력칸 비활성, '이름 수정' 버튼만 있고 완료·취소는 없다", () => {
    const project = { id: "p1", name: "내 프로젝트", stack: { framework: "next", styling: "tailwind", architecture: "feature-based" } } as never;
    const out = renderToString(<ProjectSettingsTab project={project} onRenamed={() => {}} />).replaceAll("<!-- -->", "");
    expect(out).toMatch(/<input[^>]*id="rename"[^>]*disabled/);
    expect(out).toContain("이름 수정");
    expect(out).not.toContain(">완료<");
    expect(out).not.toContain(">취소<");
  });

  it("완료는 바뀌었고 비어 있지 않고 저장 중이 아닐 때만 누를 수 있다", () => {
    expect(canCommitName("a", "b", false)).toBe(true);
    expect(canCommitName("a", " b ", false)).toBe(true);
    expect(canCommitName("a", "a", false)).toBe(false);
    expect(canCommitName("a", " a ", false)).toBe(false);
    expect(canCommitName("a", "   ", false)).toBe(false);
    expect(canCommitName("a", "", false)).toBe(false);
    expect(canCommitName("a", "b", true)).toBe(false);
  });
});
