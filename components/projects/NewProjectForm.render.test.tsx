import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import NewProjectForm from "./NewProjectForm";
import { FRAMEWORKS, labelOf } from "./stack-labels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

describe("NewProjectForm", () => {
  it("프레임워크 선택지에서 HTML을 숨긴다", () => {
    const out = renderToString(<NewProjectForm />);
    expect(out).toContain('value="next"');
    expect(out).toContain('value="react"');
    expect(out).not.toContain('value="html"');
  });

  it("이미 만든 HTML 프로젝트를 표시하는 라벨은 그대로 남아 있다", () => {
    expect(labelOf(FRAMEWORKS, "html")).toBe("HTML");
  });
});
